import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import type { Bootstrap, TransactionInput } from '../../src/shared/types';
import { buildWorkbookImport } from '../../src/shared/xlsx-import';
import {
  readXlsx,
  originalTransactions,
  type Workbook,
  type WorkbookCell,
} from '../../src/shared/xlsx';
import { extractWorkbookManagement } from '../../src/shared/xlsx-management';
import { assetBalanceAt } from '../../src/shared/assets';
import {
  appendWorkbookArchive,
  restoreWorkbookArchive,
  isWorkbookArchiveRecord,
} from '../../src/shared/workbook-archive';
import {
  backupTables,
  csvImportRows,
  defaultCsvMapping,
  parseCsv,
  transactionsCsv,
  type BudgetBackup,
  type ImportPreview,
  type RestorePreview,
  type RecordHistory,
  type SourceRecord,
} from '../../src/shared/data';
let runtime: Miniflare, script: string, cookie: string;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
async function call(path: string, method = 'GET', body?: unknown) {
  return runtime.dispatchFetch(`http://localhost${path}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function state() {
  const response = await call('/api/bootstrap');
  expect(response.status).toBe(200);
  return response.json() as Promise<Bootstrap>;
}
async function backup() {
  const response = await call('/api/data/backup');
  expect(response.status).toBe(200);
  return response.json() as Promise<BudgetBackup>;
}
const members = { u1: 'u1', u2: 'u2' };
async function previewRestore(value: BudgetBackup) {
  const response = await call('/api/data/restore/preview', 'POST', {
    backup: value,
    memberMap: members,
    mode: 'replace',
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<RestorePreview>;
}
async function restore(
  value: BudgetBackup,
  preview: RestorePreview,
  extra: Record<string, unknown> = {},
) {
  return call('/api/data/restore', 'POST', {
    backup: value,
    memberMap: members,
    mode: 'replace',
    digest: preview.digest,
    expectedRevision: preview.revision,
    confirmReplace: true,
    mutationId: crypto.randomUUID(),
    ...extra,
  });
}
const input = (): TransactionInput => ({
  ledgerId: 'main',
  date: '2026-09-16',
  description: '가져온 지출',
  amount: 12000,
  type: 'expense',
  ownerId: 'shared',
  paymentMethodId: 'card-j',
  tagIds: [],
  allocations: [{ assetId: 'reserve', amount: 12000 }],
});
async function importPreview(
  rows = [{ rowId: 'sheet1:30', transaction: input() }],
  sourceId = '2026-original',
) {
  const response = await call('/api/data/import/preview', 'POST', { sourceId, rows });
  expect(response.status).toBe(200);
  return response.json() as Promise<ImportPreview>;
}
async function apply(preview: ImportPreview, extra: Record<string, unknown> = {}) {
  return call('/api/data/import', 'POST', {
    sourceId: preview.sourceId,
    rows: preview.rows.map(({ rowId, transaction, sourceLocation }) => ({
      rowId,
      transaction,
      ...(sourceLocation ? { sourceLocation } : {}),
    })),
    digest: preview.digest,
    expectedRevision: preview.revision,
    confirmImport: true,
    mutationId: crypto.randomUUID(),
    ...extra,
  });
}
beforeAll(async () => {
  script = (
    await build({
      stdin: {
        contents: `import worker from './src/server/index.ts';
          import { instrumentDatabase } from './tests/server/d1-probe.ts';
          export { HouseholdRoom } from './src/server/index.ts';
          export default { async fetch(request, env, ctx) {
            const probe = instrumentDatabase(env.DB);
            const response = await worker.fetch(request, { ...env, DB: probe.db }, ctx);
            const result = new Response(response.body, response);
            result.headers.set('X-Test-D1-Metrics', JSON.stringify(probe.metrics));
            return result;
          } };`,
        resolveDir: process.cwd(),
        loader: 'js',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      external: ['cloudflare:workers'],
    })
  ).outputFiles[0].text;
});
beforeEach(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: '2026-09-16',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      durableObjects: { COLLABORATION: { className: 'HouseholdRoom', useSQLite: true } },
      bindings: { DEMO_MODE: 'true' },
    }),
  );
  db = await runtime.getD1Database('DB');
  for (const file of [
    ...(await readdir('migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => `migrations/${f}`),
    'seeds/demo.sql',
  ])
    for (const statement of (await readFile(file, 'utf8'))
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  cookie = '';
  const response = await call('/api/auth/demo', 'POST', { userId: 'u1' });
  cookie = response.headers.get('Set-Cookie')!.split(';')[0];
});
afterEach(async () => {
  await runtime?.dispose();
});
function syntheticWorkbook(): Workbook {
  const sheet = (name: string, values: Record<string, WorkbookCell['value']>) => ({
    name,
    hidden: false,
    cells: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])),
  });
  return {
    date1904: false,
    sheets: [
      sheet('설정', { C3: 2026, E3: 1, G3: 1 }),
      sheet('1', {
        H6: '2026-01-01',
        H7: '2026-01-31',
        B69: '식비',
        C69: 100000,
        C129: 100000,
        C37: 500000,
        T30: '2026-01-15',
        U30: '검증 원본 식사',
        V30: 12000,
        W30: '식비',
        X30: '외식',
        Y30: '현금',
        Z30: '여행',
        U31: '검증 원본 날짜 미정',
        V31: 5000,
        W31: '식비',
        X31: '외식',
        Y31: '현금',
        T32: '2026-01-20',
        U32: '검증 원본 급여',
        V32: 400000,
        W32: '수입',
        X32: '급여',
        Y32: '현금',
        T33: '2026-01-21',
        U33: '검증 원본 저축',
        V33: 50000,
        W33: '저축',
        X33: '적금',
        Y33: '현금',
      }),
      sheet('자산관리', {
        B11: '유동자산',
        C11: '예비금',
        D11: '검증 관측 자산',
        E11: 500000,
        F11: 480000,
      }),
    ],
  };
}
describe('portable data backup and import', () => {
  it('imports missing payments as null and preserves null through backup restore and portable rebinding', async () => {
    const missing = input();
    delete (missing as Partial<TransactionInput>).paymentMethodId;
    const preview = await importPreview(
      [{ rowId: 'unspecified:1', transaction: missing }],
      'unspecified-import',
    );
    expect(preview.errors).toBe(0);
    expect(preview.rows[0].transaction.paymentMethodId).toBeNull();
    expect((await apply(preview)).status).toBe(200);
    const original = await backup();
    const record = original.tables.import_records.find(
      (r) => r.source_id === 'unspecified-import',
    )!;
    const transactionId = String(record.transaction_id);
    expect(
      original.tables.transactions.find((t) => t.id === transactionId)!.payment_method_id,
    ).toBeNull();
    expect(JSON.parse(String(record.payload_json)).paymentMethodId).toBeNull();
    expect(
      (await state()).transactions.find((t) => t.id === transactionId)!.paymentMethodId,
    ).toBeNull();
    const samePreview = await previewRestore(original);
    expect(samePreview.issues).toEqual([]);
    expect((await restore(original, samePreview)).status).toBe(200);
    const duplicate = await importPreview(
      [{ rowId: 'unspecified:1', transaction: { ...missing, paymentMethodId: null } }],
      'unspecified-import',
    );
    expect(duplicate).toMatchObject({ ready: 0, duplicate: 1, errors: 0 });
    const portable = await backup();
    portable.sourceHouseholdId = 'other-unspecified-household';
    const portablePreview = await previewRestore(portable);
    expect(portablePreview.issues).toEqual([]);
    expect((await restore(portable, portablePreview)).status).toBe(200);
    const rebound = await backup();
    const reboundRecord = rebound.tables.import_records.find(
      (r) => r.source_id === 'unspecified-import',
    )!;
    expect(JSON.parse(String(reboundRecord.payload_json)).paymentMethodId).toBeNull();
    expect(
      rebound.tables.transactions.find((t) => t.id === reboundRecord.transaction_id)!
        .payment_method_id,
    ).toBeNull();
    expect((await previewRestore(rebound)).issues).toEqual([]);
  });

  it('nullable import and backup references still reject nonempty unknown or archived payments', async () => {
    await db.prepare("UPDATE payment_methods SET archived=1 WHERE id='card-j'").run();
    for (const paymentMethodId of ['card-j', 'does-not-exist', 'null', '']) {
      const preview = await importPreview([
        { rowId: 'invalid-payment', transaction: { ...input(), paymentMethodId } },
      ]);
      expect(preview.errors, paymentMethodId).toBe(1);
      expect((await apply(preview)).status).toBe(400);
    }
    const candidate = await backup();
    candidate.tables.transactions[0].payment_method_id = 'does-not-exist';
    expect(
      (await previewRestore(candidate)).issues.some((v) => v.includes('payment_method_id')),
    ).toBe(true);
    candidate.tables.transactions[0].payment_method_id = null;
    expect((await previewRestore(candidate)).issues).toEqual([]);
    delete candidate.tables.transactions[0].payment_method_id;
    const omitted = await previewRestore(candidate);
    expect(omitted.issues).toEqual([]);
    expect((await restore(candidate, omitted)).status).toBe(200);
    expect(
      (await backup()).tables.transactions.find(
        (t) => t.id === candidate.tables.transactions[0].id,
      )!.payment_method_id,
    ).toBeNull();
  });

  it('round-trips arbitrary parent chains and sibling order while preserving independent finances', async () => {
    const original = await backup();
    expect(original.schemaVersion).toBe(2);
    const candidate = structuredClone(original);
    const main = candidate.tables.ledgers.find((l) => l.id === 'main')!;
    const trip = candidate.tables.ledgers.find((l) => l.id === 'trip')!;
    main.parent_id = 'year';
    main.sort_order = 4;
    trip.sort_order = 2;
    candidate.tables.ledgers.push(
      { ...main, id: 'year', name: '2026', parent_id: null, sort_order: 1 },
      { ...trip, id: 'independent', name: '독립 가계부', parent_id: null, sort_order: 0 },
      { ...trip, id: 'detail', name: '여행 상세', parent_id: 'trip', sort_order: 0 },
    );
    const before = await state();
    const preview = await previewRestore(candidate);
    expect(preview.issues).toEqual([]);
    const response = await restore(candidate, preview);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({ hierarchyVersion: before.hierarchyVersion! + 1 });
    const after = await state();
    expect(after.hierarchyVersion).toBe(before.hierarchyVersion! + 1);
    expect(
      after.assets
        .map((a) => ({ id: a.id, balance: a.balance }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      before.assets
        .map((a) => ({ id: a.id, balance: a.balance }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(after.assetMovements).toEqual(before.assetMovements);
    const portable = await backup();
    const structure = (value: BudgetBackup) =>
      value.tables.ledgers
        .map(({ id, parent_id, sort_order, budget }) => ({ id, parent_id, sort_order, budget }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    expect(structure(portable)).toEqual(structure(candidate));
    expect(portable.tables.ledgers.every((l) => l.kind === 'purpose')).toBe(true);
    expect((await restore(portable, await previewRestore(portable))).status).toBe(200);
    expect(structure(await backup())).toEqual(structure(candidate));
    expect((await state()).hierarchyVersion).toBe(before.hierarchyVersion! + 2);
  });

  it('migrates schema 1 missing sibling order from file order but rejects a missing schema 2 order', async () => {
    const original = await backup();
    const legacy = structuredClone(original);
    legacy.schemaVersion = 1;
    legacy.tables.ledgers.push({
      ...legacy.tables.ledgers[0],
      id: 'legacy-root',
      kind: 'purpose',
      parent_id: null,
    });
    legacy.tables.ledgers.reverse();
    for (const ledger of legacy.tables.ledgers) delete ledger.sort_order;
    const preview = await previewRestore(legacy);
    expect(preview.issues).toEqual([]);
    expect((await restore(legacy, preview)).status).toBe(200);
    const restored = await backup();
    expect(restored.schemaVersion).toBe(2);
    for (const [index, ledger] of legacy.tables.ledgers.entries())
      expect(restored.tables.ledgers.find((l) => l.id === ledger.id)?.sort_order).toBe(index);
    const invalid = structuredClone(original);
    delete invalid.tables.ledgers[0].sort_order;
    expect(
      (await previewRestore(invalid)).issues.some(
        (issue) => issue.includes('정렬') || issue.includes('sort_order'),
      ),
    ).toBe(true);
  });

  it('rejects self-parenting and multi-node cycles before any restore data is replaced', async () => {
    const original = await backup();
    for (const self of [false, true]) {
      const invalid = structuredClone(original);
      invalid.tables.ledgers.find((l) => l.id === 'main')!.parent_id = self ? 'main' : 'trip';
      const preview = await previewRestore(invalid);
      expect(
        preview.issues.some((issue) => issue.includes('순환') || issue.includes('자기 자신')),
      ).toBe(true);
      expect((await restore(invalid, preview)).status).toBe(400);
      expect((await backup()).tables).toEqual(original.tables);
      expect((await state()).hierarchyVersion).toBe(1);
    }
  });

  it('does not export or restore member roles and denies normal users both restore endpoints', async () => {
    const original = await backup();
    expect(original.members.every((m) => !Object.hasOwn(m, 'role'))).toBe(true);
    const roles = (await state()).users.map(({ id, role }) => ({ id, role }));
    const forged = structuredClone(original);
    forged.members = forged.members.map((member) => ({
      ...member,
      role: member.id === 'u2' ? 'admin' : 'user',
    }));
    const preview = await previewRestore(forged);
    expect(preview.issues).toEqual([]);
    expect((await restore(forged, preview)).status).toBe(200);
    expect((await state()).users.map(({ id, role }) => ({ id, role }))).toEqual(roles);
    const withUsers = {
      ...original,
      tables: { ...original.tables, users: [{ id: 'u2', role: 'admin' }] },
    };
    expect(
      (
        await call('/api/data/restore/preview', 'POST', {
          backup: withUsers,
          memberMap: members,
          mode: 'replace',
        })
      ).status,
    ).toBe(400);
    const fresh = await previewRestore(forged);
    const userLogin = await call('/api/auth/demo', 'POST', { userId: 'u2' });
    cookie = userLogin.headers.get('Set-Cookie')!.split(';')[0];
    const deniedPreview = await call('/api/data/restore/preview', 'POST', {
      backup: forged,
      memberMap: members,
      mode: 'replace',
      role: 'admin',
    });
    expect(deniedPreview.status).toBe(403);
    expect(await deniedPreview.json()).toMatchObject({ code: 'ADMIN_REQUIRED' });
    const deniedApply = await restore(forged, fresh, { role: 'admin' });
    expect(deniedApply.status).toBe(403);
    expect((await state()).users.map(({ id, role }) => ({ id, role }))).toEqual(roles);
  });

  it('rejects the virtual all-ledgers ID as a physical ledger in restore input', async () => {
    const original = await backup();
    const invalid = structuredClone(original);
    invalid.tables.ledgers.push({
      ...invalid.tables.ledgers[0],
      id: '__all__',
      kind: 'purpose',
      parent_id: null,
    });
    const preview = await previewRestore(invalid);
    expect(preview.issues.some((issue) => issue.includes('전체 보기 전용 ID'))).toBe(true);
    expect((await restore(invalid, preview)).status).toBe(400);
    expect((await backup()).tables).toEqual(original.tables);
  });

  it('keeps transaction-only CSV import available to users without changing hierarchy', async () => {
    const userLogin = await call('/api/auth/demo', 'POST', { userId: 'u2' });
    cookie = userLogin.headers.get('Set-Cookie')!.split(';')[0];
    const before = await state();
    const preview = await importPreview();
    expect(preview.errors).toBe(0);
    expect((await apply(preview)).status).toBe(200);
    const after = await state();
    expect(after.transactions).toHaveLength(before.transactions.length + 1);
    expect(after.hierarchyVersion).toBe(before.hierarchyVersion);
    expect(after.ledgers).toEqual(before.ledgers);
    expect(after.user.role).toBe('user');
  });

  it('serializes an admin restore against concurrent role revocation using current database permissions', async () => {
    const promotion = await call('/api/users/u2/role', 'PATCH', {
      mutationId: 'promote-restore',
      role: 'admin',
      expectedHierarchyVersion: 1,
    });
    expect(promotion.status).toBe(200);
    const otherLogin = await runtime.dispatchFetch('http://localhost/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    });
    const otherCookie = otherLogin.headers.get('Set-Cookie')!.split(';')[0];
    const before = await state();
    const candidate = await backup();
    const preview = await previewRestore(candidate);
    const responses = await Promise.all([
      restore(candidate, preview),
      runtime.dispatchFetch('http://localhost/api/users/u1/role', {
        method: 'PATCH',
        headers: { Cookie: otherCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutationId: 'revoke-restore',
          role: 'user',
          expectedHierarchyVersion: before.hierarchyVersion,
        }),
      }),
    ]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => [403, 409].includes(response.status))).toHaveLength(1);
    const after = await state();
    expect(after.hierarchyVersion).toBe(before.hierarchyVersion! + 1);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.users.some((u) => u.role === 'admin')).toBe(true);
  });

  it('exports only household records and round-trips exact balances/effects without login state', async () => {
    const original = await backup();
    expect(Object.keys(original.tables).sort()).toEqual([...backupTables].sort());
    expect(JSON.stringify(original)).not.toContain('token_hash');
    expect(JSON.stringify(original)).not.toContain('household_id');
    await db.prepare("UPDATE ledgers SET name='바뀐 이름',version=version+1 WHERE id='main'").run();
    await db.prepare("UPDATE households SET revision=revision+1 WHERE id='home'").run();
    const preview = await previewRestore(original);
    expect(preview.issues).toEqual([]);
    const response = await restore(original, preview);
    expect(response.status, await response.clone().text()).toBe(200);
    const result = await backup();
    expect(result.tables.asset_effects).toEqual(original.tables.asset_effects);
    expect(result.tables.transactions.map(({ version, ...row }) => row)).toEqual(
      original.tables.transactions.map(({ version, ...row }) => row),
    );
    expect(result.tables.assets.map(({ version, ...row }) => row)).toEqual(
      original.tables.assets.map(({ version, ...row }) => row),
    );
    expect(result.tables.ledgers.find((l) => l.id === 'main')?.name).toBe(
      original.tables.ledgers.find((l) => l.id === 'main')?.name,
    );
    expect(Number(result.tables.ledgers.find((l) => l.id === 'main')?.version)).toBeGreaterThan(
      Number(original.tables.ledgers.find((l) => l.id === 'main')?.version),
    );
    expect((await state()).user.id).toBe('u1');
  });
  it('rejects changed or malformed backup before deleting any records', async () => {
    const original = await backup(),
      broken = structuredClone(original);
    broken.tables.transactions[0].payment_method_id = 'missing';
    const preview = await previewRestore(broken);
    expect(preview.issues.some((s) => s.includes('payment_method_id'))).toBe(true);
    expect((await restore(broken, preview)).status).toBe(400);
    expect((await backup()).tables).toEqual(original.tables);
    const valid = await previewRestore(original),
      changed = structuredClone(original);
    changed.tables.ledgers[0].name = '다른 파일';
    expect((await restore(changed, valid)).status).toBe(400);
    expect((await backup()).tables).toEqual(original.tables);
  });
  it('guards concurrent changes and replays a successful restore exactly once', async () => {
    const original = await backup(),
      old = await previewRestore(original);
    await call('/api/payment-methods', 'POST', {
      mutationId: crypto.randomUUID(),
      name: '동시 등록',
      type: 'cash',
      ownerId: 'shared',
    });
    expect((await restore(original, old)).status).toBe(409);
    expect((await state()).paymentMethods.some((p) => p.name === '동시 등록')).toBe(true);
    const fresh = await previewRestore(original),
      mutationId = crypto.randomUUID();
    const first = await restore(original, fresh, { mutationId });
    expect(first.status, await first.clone().text()).toBe(200);
    const firstBody = (await first.json()) as { revision: number };
    const replay = await restore(original, fresh, { mutationId });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ revision: firstBody.revision, replayed: true });
  });
  it('rejects stale additive workbook candidates before preview and at apply without overwriting edits', async () => {
    const original = await backup();
    const body = {
      backup: original,
      memberMap: members,
      mode: 'replace',
      baseRevision: original.sourceRevision,
    };
    const response = await call('/api/data/restore/preview', 'POST', body);
    expect(response.status).toBe(200);
    const preview = (await response.json()) as RestorePreview;
    expect(
      (
        await call('/api/payment-methods', 'POST', {
          mutationId: crypto.randomUUID(),
          name: '보존할 동시 수정',
          type: 'cash',
          ownerId: 'shared',
        })
      ).status,
    ).toBe(200);
    expect((await call('/api/data/restore/preview', 'POST', body)).status).toBe(409);
    expect(
      (await restore(original, preview, { baseRevision: original.sourceRevision })).status,
    ).toBe(409);
    expect(
      (
        await restore(original, preview, {
          baseRevision: original.sourceRevision,
          expectedRevision: (await state()).revision,
        })
      ).status,
    ).toBe(409);
    expect((await state()).paymentMethods.some((p) => p.name === '보존할 동시 수정')).toBe(true);
    const foreign = { ...original, sourceHouseholdId: 'another-home' };
    expect(
      (await call('/api/data/restore/preview', 'POST', { ...body, backup: foreign })).status,
    ).toBe(409);
  });
  it('preserves first author through another member edit and retains deletion snapshots exactly once', async () => {
    const createBody = {
      mutationId: crypto.randomUUID(),
      transaction: { ...input(), createdBy: 'u2', createdAt: '1999-01-01T00:00:00Z' },
    };
    const create = await call('/api/transactions', 'POST', createBody);
    expect(create.status).toBe(200);
    const first = (await create.json()) as { transaction: Bootstrap['transactions'][number] };
    expect(first.transaction.createdBy).toBe('u1');
    expect(first.transaction.createdAt).not.toBe('1999-01-01T00:00:00Z');
    const auth = await call('/api/auth/demo', 'POST', { userId: 'u2' });
    cookie = auth.headers.get('Set-Cookie')!.split(';')[0];
    const editBody = {
      mutationId: crypto.randomUUID(),
      expectedVersion: first.transaction.version,
      transaction: {
        ...input(),
        id: first.transaction.id,
        description: '다른 구성원의 수정',
        createdBy: 'u2',
      },
    };
    const edit = await call('/api/transactions', 'POST', editBody);
    expect(edit.status).toBe(200);
    const edited = (await edit.json()) as typeof first;
    expect(edited.transaction).toMatchObject({
      createdBy: 'u1',
      createdAt: first.transaction.createdAt,
      updatedBy: 'u2',
      description: '다른 구성원의 수정',
    });
    expect((await call('/api/transactions', 'POST', editBody)).status).toBe(200);
    const removeBody = {
      mutationId: crypto.randomUUID(),
      expectedVersion: edited.transaction.version,
    };
    expect(
      (await call(`/api/transactions/${first.transaction.id}`, 'DELETE', removeBody)).status,
    ).toBe(200);
    expect(
      (await call(`/api/transactions/${first.transaction.id}`, 'DELETE', removeBody)).status,
    ).toBe(200);
    expect((await state()).transactions.some((t) => t.id === first.transaction.id)).toBe(false);
    const historyResponse = await call('/api/data/history');
    expect(historyResponse.status, await historyResponse.clone().text()).toBe(200);
    const history = (await historyResponse.json()) as RecordHistory[];
    const records = history.filter((r) => r.entityId === first.transaction.id);
    expect(records).toHaveLength(3);
    expect(records.find((r) => r.action === 'create')).toMatchObject({
      actorId: 'u1',
      before: null,
      after: { createdBy: 'u1', description: input().description },
    });
    expect(records.find((r) => r.action === 'update')).toMatchObject({
      actorId: 'u2',
      before: { description: input().description, createdBy: 'u1' },
      after: { description: '다른 구성원의 수정', createdBy: 'u1' },
    });
    expect(records.find((r) => r.action === 'delete')).toMatchObject({
      actorId: 'u2',
      before: { deletedAt: null, description: '다른 구성원의 수정' },
      after: { createdBy: 'u1' },
    });
    expect(records.find((r) => r.action === 'delete')?.after?.deletedAt).toEqual(
      expect.any(String),
    );
    const adminLogin = await call('/api/auth/demo', 'POST', { userId: 'u1' });
    cookie = adminLogin.headers.get('Set-Cookie')!.split(';')[0];
    const archived = await backup(),
      preview = await previewRestore(archived);
    expect(preview.issues).toEqual([]);
    expect((await restore(archived, preview)).status).toBe(200);
    const roundTrip = await backup();
    expect(
      roundTrip.tables.record_history.filter((r) => r.entity_id === first.transaction.id),
    ).toEqual(archived.tables.record_history.filter((r) => r.entity_id === first.transaction.id));
    expect(
      roundTrip.tables.transactions.find((r) => r.id === first.transaction.id)?.created_by,
    ).toBe('u1');
  });
  it('keeps legacy authors unknown and accepts old backups while isolating history by household', async () => {
    const original = await backup();
    expect(
      original.tables.transactions.every((t) => t.created_by === null && t.created_at === null),
    ).toBe(true);
    const legacy = structuredClone(original);
    delete (legacy.tables as Partial<BudgetBackup['tables']>).record_history;
    for (const row of legacy.tables.transactions) {
      delete row.created_by;
      delete row.created_at;
    }
    const preview = await previewRestore(legacy);
    expect(preview.issues).toEqual([]);
    expect((await restore(legacy, preview)).status).toBe(200);
    expect(
      (await state()).transactions.every((t) => t.createdBy === null && t.createdAt === null),
    ).toBe(true);
    await db.prepare("INSERT INTO households(id,name) VALUES('foreign','Foreign')").run();
    await db
      .prepare(
        "INSERT INTO users(id,household_id,name,color) VALUES('foreign-user','foreign','Foreign','#000')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO record_history(id,household_id,revision,entity_type,entity_id,actor_id,created_at,action,before_json,after_json) VALUES('foreign-history','foreign',1,'transaction','secret','foreign-user','2026-09-16T00:00:00Z','create',NULL,'{\"description\":\"private foreign record\"}')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO changes(household_id,revision,entity_type,entity_id,actor_id,created_at) VALUES('home',99,'transaction','legacy-history','u1','2020-01-01T00:00:00Z')",
      )
      .run();
    const history = (await (await call('/api/data/history')).json()) as RecordHistory[];
    expect(history.find((r) => r.entityId === 'legacy-history')).toMatchObject({
      action: 'unknown',
      before: null,
      after: null,
    });
    expect(JSON.stringify(history)).not.toContain('private foreign record');
    expect((await backup()).tables.record_history.every((r) => r.id !== 'foreign-history')).toBe(
      true,
    );
    const tx = (await state()).transactions[0];
    const edit = await call('/api/transactions', 'POST', {
      mutationId: crypto.randomUUID(),
      expectedVersion: tx.version,
      transaction: { ...tx, description: '기존 미확인 기록 수정' },
    });
    expect(edit.status).toBe(200);
    expect((await edit.json()) as unknown).toMatchObject({
      transaction: { createdBy: null, createdAt: null },
    });
  });
  it('rebinds another household backup and preserves every relationship', async () => {
    const original = await backup();
    original.sourceHouseholdId = 'portable-other-household';
    const preview = await previewRestore(original);
    expect(preview.issues).toEqual([]);
    const response = await restore(original, preview);
    expect(response.status, await response.clone().text()).toBe(200);
    const result = await backup();
    expect(result.tables.ledgers.every((r) => String(r.id).startsWith('restore_'))).toBe(true);
    expect(result.tables.asset_effects.map((r) => r.amount).sort()).toEqual(
      original.tables.asset_effects.map((r) => r.amount).sort(),
    );
    expect((await state()).transactions.length).toBe(5);
    const again = await previewRestore(result);
    expect(again.issues).toEqual([]);
  });
  it('atomically imports stable source rows with correct asset effects and skips reimport', async () => {
    const before = await state();
    const preview = await importPreview();
    expect(preview.errors).toBe(0);
    expect(preview.ready).toBe(1);
    const response = await apply(preview);
    expect(response.status, await response.clone().text()).toBe(200);
    const after = await state();
    expect(after.transactions).toHaveLength(before.transactions.length + 1);
    expect(after.assets.find((a) => a.id === 'reserve')!.balance).toBe(
      before.assets.find((a) => a.id === 'reserve')!.balance - 12000,
    );
    const imported = after.transactions.find((t) => t.description === '가져온 지출')!;
    expect(after.assetMovements.filter((m) => m.transactionId === imported.id)).toHaveLength(1);
    expect(imported).toMatchObject({ createdBy: null, createdAt: null });
    const importHistory = (await (await call('/api/data/history')).json()) as RecordHistory[];
    expect(importHistory.find((r) => r.entityId === imported.id)).toMatchObject({
      action: 'import',
      actorId: 'u1',
      before: null,
      after: { createdBy: null, createdAt: null, description: '가져온 지출' },
    });
    const duplicate = await importPreview();
    expect(duplicate.duplicate).toBe(1);
    expect(duplicate.ready).toBe(0);
    expect((await apply(duplicate)).status).toBe(200);
    expect((await state()).transactions).toHaveLength(after.transactions.length);
    const changed = await importPreview([
      {
        rowId: 'sheet1:30',
        transaction: {
          ...input(),
          amount: 13000,
          allocations: [{ assetId: 'reserve', amount: 13000 }],
        },
      },
    ]);
    expect(changed.errors).toBe(1);
  });
  it('fails the entire import for invalid rows or a concurrent revision', async () => {
    const before = await state();
    const invalid = await importPreview([
      { rowId: 'good', transaction: input() },
      { rowId: 'bad', transaction: { ...input(), date: '2026-02-30' } },
    ]);
    expect(invalid.errors).toBe(1);
    expect((await apply(invalid)).status).toBe(400);
    expect((await state()).transactions).toEqual(before.transactions);
    const valid = await importPreview();
    await call('/api/payment-methods', 'POST', {
      mutationId: crypto.randomUUID(),
      name: '다른 변경',
      type: 'cash',
      ownerId: 'shared',
    });
    expect((await apply(valid)).status).toBe(409);
    expect((await state()).transactions).toEqual(before.transactions);
  });
  it('replays uncertain imports without double effects and preserves provenance on backup', async () => {
    const preview = await importPreview(),
      mutationId = crypto.randomUUID();
    const first = await apply(preview, { mutationId });
    expect(first.status).toBe(200);
    const result = (await first.json()) as { revision: number };
    const second = await apply(preview, { mutationId });
    expect(await second.json()).toMatchObject({ revision: result.revision, replayed: true });
    const b = await backup();
    expect(b.tables.import_records).toHaveLength(1);
    expect(b.tables.import_records[0]).toMatchObject({
      source_id: '2026-original',
      row_id: 'sheet1:30',
    });
    const restorePreview = await previewRestore(b);
    expect(restorePreview.issues).toEqual([]);
    expect((await restore(b, restorePreview)).status).toBe(200);
    expect((await importPreview()).duplicate).toBe(1);
    const portable = await backup();
    portable.sourceHouseholdId = 'other-portable-household';
    const portablePreview = await previewRestore(portable);
    expect((await restore(portable, portablePreview)).status).toBe(200);
    const rebased = await backup();
    const rebasedInput = JSON.parse(
      String(rebased.tables.import_records[0].payload_json),
    ) as TransactionInput;
    expect(
      (await importPreview([{ rowId: 'sheet1:30', transaction: rebasedInput }])).duplicate,
    ).toBe(1);
  });
  it('preflights malformed nested data and preserves long legacy tag identifiers', async () => {
    const longId = `category-${'abcd'.repeat(160)}`;
    const group = (await state()).tagGroups.find((g) => g.appliesTo === 'transaction')!;
    await db
      .prepare('INSERT INTO tags(id,household_id,name,color,group_id) VALUES(?,?,?,?,?)')
      .bind(longId, 'home', '긴 기존 분류', '#7972e8', group.id)
      .run();
    const original = await backup();
    const valid = await previewRestore(original);
    expect(valid.issues).toEqual([]);
    expect((await restore(original, valid)).status).toBe(200);
    expect((await state()).tags.some((t) => t.id === longId)).toBe(true);
    const malformed = structuredClone(original);
    malformed.tables.planning_records.push({
      id: 'broken-plan',
      ledger_id: 'main',
      kind: 'payroll',
      payload_json: JSON.stringify({
        title: '오류 계획',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        amount: 100,
        tagIds: [],
        paymentMethodId: null,
        ownerId: null,
        includeLinked: true,
        notes: '',
        rounding: 'none',
        lines: 'invalid',
      }),
      archived: 0,
      version: 1,
      created_at: '2026-09-16T00:00:00Z',
    });
    const invalid = await previewRestore(malformed);
    expect(invalid.issues.some((i) => i.includes('월급 배분'))).toBe(true);
    expect((await restore(malformed, invalid)).status).toBe(400);
    const malformedImport = await call('/api/data/import/preview', 'POST', {
      sourceId: 'bad',
      rows: [{ rowId: '1', transaction: { ...input(), allocations: [null] } }],
    });
    expect(malformedImport.status).toBe(200);
    expect(((await malformedImport.json()) as ImportPreview).errors).toBe(1);
  });
  it('preserves incomplete source evidence and only edits review note/status with guards', async () => {
    const payload = {
      cells: { T30: null, U30: '날짜 없는 원본', V30: 12000 },
      draft: { description: '날짜 없는 원본', date: null },
    };
    await db
      .prepare(
        'INSERT INTO source_records(id,household_id,source_id,source_location,kind,payload_json,note,status) VALUES(?,?,?,?,?,?,?,?)',
      )
      .bind(
        'source-pending',
        'home',
        'workbook-2026',
        '9!T30:Z30',
        'transaction',
        JSON.stringify(payload),
        '날짜 확인 필요',
        'pending',
      )
      .run();
    const before = await state();
    const recordsResponse = await call('/api/data/source-records');
    expect(recordsResponse.status).toBe(200);
    const records = (await recordsResponse.json()) as {
      id: string;
      payload: unknown;
      version: number;
    }[];
    expect(records[0].payload).toEqual(payload);
    const body = {
      mutationId: crypto.randomUUID(),
      expectedRevision: before.revision,
      expectedVersion: 1,
      note: '10월 거래 여부 확인',
      status: 'resolved',
    };
    const response = await call('/api/data/source-records/source-pending', 'PATCH', body);
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await state()).transactions).toEqual(before.transactions);
    const repeat = await call('/api/data/source-records/source-pending', 'PATCH', body);
    expect(await repeat.json()).toMatchObject({ replayed: true });
    expect(
      (
        await call('/api/data/source-records/source-pending', 'PATCH', {
          ...body,
          mutationId: crypto.randomUUID(),
          expectedRevision: (await state()).revision,
          note: '오래된 수정',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call('/api/data/source-records/source-pending', 'PATCH', {
          ...body,
          mutationId: crypto.randomUUID(),
          expectedRevision: (await state()).revision,
          expectedVersion: 2,
          payload: { inventedDate: '2026-09-01' },
        })
      ).status,
    ).toBe(400);
    const history = (await (await call('/api/data/history')).json()) as RecordHistory[];
    expect(history.filter((r) => r.entityId === 'source-pending')).toHaveLength(1);
    expect(history.find((r) => r.entityId === 'source-pending')).toMatchObject({
      action: 'review',
      before: { note: '날짜 확인 필요', status: 'pending' },
      after: { note: '10월 거래 여부 확인', status: 'resolved' },
    });
    const b = await backup();
    expect(b.tables.source_records[0]).toMatchObject({
      status: 'resolved',
      note: '10월 거래 여부 확인',
      payload_json: JSON.stringify(payload),
    });
    const preview = await previewRestore(b);
    expect(preview.issues).toEqual([]);
    expect((await restore(b, preview)).status).toBe(200);
    expect((await backup()).tables.source_records[0].payload_json).toBe(JSON.stringify(payload));
    expect(
      (
        await call('/api/data/source-records/no-access', 'PATCH', {
          ...body,
          mutationId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(404);
  });
  it('rejects forged household references and money/tag relationship violations before restore', async () => {
    const original = await backup();
    await db
      .prepare('INSERT INTO households(id,name) VALUES(?,?)')
      .bind('foreign-household', '다른 가구')
      .run();
    await db
      .prepare(
        'INSERT INTO assets(id,household_id,name,kind,opening_balance,color) VALUES(?,?,?,?,?,?)',
      )
      .bind('foreign-asset', 'foreign-household', '외부 자산', 'asset', 1, '#123456')
      .run();
    const forged = structuredClone(original);
    forged.tables.assets.push({ ...forged.tables.assets[0], id: 'foreign-asset' });
    const foreignPreview = await previewRestore(forged);
    expect(foreignPreview.issues.some((i) => i.includes('다른 가구'))).toBe(true);
    expect((await restore(forged, foreignPreview)).status).toBe(400);
    const single = structuredClone(original),
      category = single.tables.tag_groups.find((g) => g.role === 'category')!,
      options = single.tables.tags.filter((t) => t.group_id === category.id);
    single.tables.transactions[0].tag_ids = JSON.stringify(options.slice(0, 2).map((t) => t.id));
    expect((await previewRestore(single)).issues.some((i) => i.includes('단일 선택'))).toBe(true);
    const child = structuredClone(original),
      parent = child.tables.tags.find((t) => t.group_id === category.id)!,
      childGroup = child.tables.tag_groups.find(
        (g) => g.applies_to === 'transaction' && g.role === 'regular',
      )!;
    child.tables.tags.push({
      id: 'parented-option',
      name: '하위 항목',
      color: '#123456',
      group_id: childGroup.id,
      parent_id: parent.id,
      sort_order: 5,
      archived: 0,
      version: 1,
    });
    child.tables.transactions[0].tag_ids = JSON.stringify(['parented-option']);
    expect((await previewRestore(child)).issues.some((i) => i.includes('상위 옵션'))).toBe(true);
    const applied = await importPreview();
    expect((await apply(applied)).status).toBe(200);
    const financial = await backup();
    const imported = financial.tables.transactions.find((t) => t.description === '가져온 지출')!;
    imported.allocations_json = JSON.stringify([{ assetId: 'reserve', amount: 6000 }]);
    const financialPreview = await previewRestore(financial);
    expect(financialPreview.issues.some((i) => i.includes('배분 합계'))).toBe(true);
    expect(financialPreview.issues.some((i) => i.includes('자산 반영 기록'))).toBe(true);
    expect((await restore(financial, financialPreview)).status).toBe(400);
    expect((await state()).assets.find((a) => a.id === 'reserve')?.balance).toBe(488000);
  });
  it('imports a workbook candidate through the real restore API, preserving plans, observations, pending evidence and dedup', async () => {
    const book = syntheticWorkbook(),
      options = {
        sourceId: 'synthetic-2026-original',
        ledgerId: 'main',
        actorId: 'u1',
        newLedgerName: '검증 원본 가계부',
        payments: { 현금: 'cash' },
      };
    const before = await state(),
      candidate = await buildWorkbookImport(book, await backup(), options);
    expect(candidate.transactions).toMatchObject({ count: 2, income: 400000, expense: 12000 });
    expect(candidate.pending.some((p) => p.source.includes('T31'))).toBe(true);
    expect(candidate.pending.some((p) => p.message.includes('저축'))).toBe(true);
    const preview = await previewRestore(candidate.backup);
    expect(preview.issues).toEqual([]);
    const response = await restore(candidate.backup, preview);
    expect(response.status, await response.clone().text()).toBe(200);
    const imported = await state();
    expect(imported.transactions.length).toBe(before.transactions.length + 2);
    const observed = imported.assets.find((a) => a.name === '검증 관측 자산')!;
    expect(observed.balance).toBe(480000);
    expect(assetBalanceAt(observed, imported.assetMovements, '2026-01-15')).toBeNull();
    expect(assetBalanceAt(observed, imported.assetMovements, '2026-01-31')).toBe(500000);
    expect(
      imported.plans?.filter((p) => p.ledgerId === candidate.ledgerId).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      imported.plans
        ?.filter((p) => p.ledgerId === candidate.ledgerId)
        .every((p) => p.includeLinked === true),
    ).toBe(true);
    const reimport = await buildWorkbookImport(book, await backup(), options);
    expect(reimport.transactions.count).toBe(0);
    expect(reimport.counts.assets).toBe(0);
    expect(reimport.counts.planning_records).toBe(0);
    const reimportPreview = await previewRestore(reimport.backup);
    expect(reimportPreview.issues).toEqual([]);
    expect((await restore(reimport.backup, reimportPreview)).status).toBe(200);
    const pendingBefore = (await backup()).tables.source_records.find(
      (r) => r.source_location === '1!T31:Z31',
    )!;
    const corrected = await buildWorkbookImport(book, await backup(), {
      ...options,
      corrections: { '1!31': { date: '2026-01-18' } },
    });
    expect(corrected.transactions).toMatchObject({ count: 1, expense: 5000 });
    const correctedPreview = await previewRestore(corrected.backup);
    expect(correctedPreview.issues).toEqual([]);
    expect((await restore(corrected.backup, correctedPreview)).status).toBe(200);
    const final = await backup(),
      pendingAfter = final.tables.source_records.find((r) => r.id === pendingBefore.id)!;
    expect(pendingAfter.status).toBe('resolved');
    expect(pendingAfter.payload_json).toBe(pendingBefore.payload_json);
    expect(
      (await state()).transactions.filter((t) => t.description === '검증 원본 날짜 미정'),
    ).toHaveLength(1);
    const roundTrip = await previewRestore(final);
    expect(roundTrip.issues).toEqual([]);
    expect((await restore(final, roundTrip)).status).toBe(200);
    expect((await backup()).tables.asset_effects).toEqual(final.tables.asset_effects);
  });
  it('accepts subtree plan scope and rejects invalid card asset links and adjustment effects in raw workbook candidates', async () => {
    const candidate = await buildWorkbookImport(syntheticWorkbook(), await backup(), {
      sourceId: 'invariants',
      ledgerId: 'main',
      actorId: 'u1',
      newLedgerName: '계획 불변식 검증',
      payments: { 현금: 'cash' },
    });
    const invalidScope = structuredClone(candidate.backup),
      scopePlan = invalidScope.tables.planning_records[0],
      scopePayload = JSON.parse(String(scopePlan.payload_json));
    scopePayload.includeLinked = true;
    scopePlan.payload_json = JSON.stringify(scopePayload);
    expect((await previewRestore(invalidScope)).issues).toEqual([]);
    const invalidBudget = structuredClone(candidate.backup),
      weekly = invalidBudget.tables.planning_records.find((p) => p.kind === 'budget')!,
      weeklyPayload = JSON.parse(String(weekly.payload_json));
    weeklyPayload.cadence = 'week';
    weekly.payload_json = JSON.stringify(weeklyPayload);
    expect((await previewRestore(invalidBudget)).issues.some((i) => i.includes('주간 예산'))).toBe(
      true,
    );
    const invalidEffect = structuredClone(candidate.backup);
    invalidEffect.tables.asset_operations.find((o) =>
      o.description?.toString().includes('월말 관측'),
    )!.amount = 999;
    expect(
      (await previewRestore(invalidEffect)).issues.some((i) => i.includes('잔액 조정과 자산 반영')),
    ).toBe(true);
    const invalidCard = structuredClone(candidate.backup),
      card = invalidCard.tables.payment_methods.find((p) => p.id === 'card-j')!;
    card.details_json = JSON.stringify({
      ...JSON.parse(String(card.details_json)),
      assetId: 'reserve',
    });
    const cardPreview = await previewRestore(invalidCard);
    expect(cardPreview.issues.some((i) => i.includes('통장·현금'))).toBe(true);
    expect((await restore(invalidCard, cardPreview)).status).toBe(400);
  });
  it.runIf(Boolean(process.env.BUDGET_WORKBOOK))(
    'privately verifies supplied workbook transactions, observations and backup round-trip in temporary D1',
    async () => {
      const bytes = new Uint8Array(await readFile(process.env.BUDGET_WORKBOOK!));
      const book = readXlsx(bytes),
        originals = originalTransactions(book),
        management = extractWorkbookManagement(book);
      const sourceId = 'private-verification',
        before = await backup(),
        beforeState = await state();
      const options = {
        sourceId,
        ledgerId: 'main',
        actorId: 'u1',
        newLedgerName: '2026',
        ledgerMode: 'monthly' as const,
        payments: {},
      };
      const candidate = await buildWorkbookImport(book, before, options);
      const archive = await appendWorkbookArchive(
        candidate.backup,
        sourceId,
        'private-workbook.xlsx',
        bytes,
      );
      const metrics = {
        maxQueries: 0,
        maxBatch: 0,
        maxBindingBytes: 0,
        maxSqlBytes: 0,
        maxCompoundTerms: 0,
      };
      const verifyMetrics = (response: { headers: { get(name: string): string | null } }) => {
        const value = JSON.parse(response.headers.get('X-Test-D1-Metrics')!);
        metrics.maxQueries = Math.max(metrics.maxQueries, value.queries);
        for (const key of [
          'maxBatch',
          'maxBindingBytes',
          'maxSqlBytes',
          'maxCompoundTerms',
        ] as const)
          metrics[key] = Math.max(metrics[key], value[key]);
        expect(value.queries, 'Private workbook queries per request').toBeLessThanOrEqual(50);
        expect(
          value.maxBindingBytes,
          'Private workbook maximum UTF-8 binding bytes',
        ).toBeLessThanOrEqual(1_500_000);
        expect(value.maxSqlBytes, 'Private workbook maximum SQL bytes').toBeLessThanOrEqual(
          100_000,
        );
        expect(
          value.maxCompoundTerms,
          'Private workbook maximum compound SELECT terms',
        ).toBeLessThanOrEqual(5);
      };
      const previewResponse = await call('/api/data/restore/preview', 'POST', {
        backup: candidate.backup,
        memberMap: members,
        mode: 'replace',
      });
      verifyMetrics(previewResponse);
      expect(previewResponse.status, 'Private workbook preflight status').toBe(200);
      const preview = (await previewResponse.json()) as RestorePreview;
      expect(
        preview.issues.length,
        'Private workbook preflight issue count; source values are intentionally omitted',
      ).toBe(0);
      const result = await restore(candidate.backup, preview);
      verifyMetrics(result);
      expect(result.status, 'Private workbook restore status').toBe(200);
      const imported = await state(),
        beforeIds = new Set(beforeState.transactions.map((t) => t.id)),
        added = imported.transactions.filter((t) => !beforeIds.has(t.id));
      const valid = originals.filter(
        (row) =>
          (row.kind === 'income' || row.kind === 'expense') &&
          /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
          Number.isFinite(Date.parse(`${row.date}T00:00:00Z`)) &&
          new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) === row.date &&
          row.description.trim().length > 0 &&
          row.description.trim().length <= 240 &&
          row.major.trim() &&
          Number.isSafeInteger(row.amount) &&
          row.amount > 0 &&
          row.amount <= 1_000_000_000_000,
      );
      let transactionMismatches = Number(added.length !== valid.length);
      for (const type of ['income', 'expense'] as const)
        if (
          added.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount, 0) !==
          valid.filter((t) => t.kind === type).reduce((sum, t) => sum + t.amount, 0)
        )
          transactionMismatches++;
      for (const month of new Set(valid.map((t) => t.date.slice(0, 7))))
        for (const type of ['income', 'expense'] as const)
          if (
            added
              .filter((t) => t.type === type && t.date.startsWith(month))
              .reduce((sum, t) => sum + t.amount, 0) !==
            valid
              .filter((t) => t.kind === type && t.date.startsWith(month))
              .reduce((sum, t) => sum + t.amount, 0)
          )
            transactionMismatches++;
      const hex = async (value: unknown) =>
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))),
          ),
          (v) => v.toString(16).padStart(2, '0'),
        ).join('');
      const prefix = `xlsx:${(await hex([before.sourceHouseholdId, sourceId])).slice(0, 20)}`;
      const sourceResponse = await call('/api/data/source-records');
      verifyMetrics(sourceResponse);
      expect(sourceResponse.status).toBe(200);
      const sources = (await sourceResponse.json()) as SourceRecord[];
      const sourceMap = new Map(sources.map((row) => [row.id, row]));
      let sourceMismatches = 0,
        routingMismatches = 0,
        tagMismatches = 0;
      for (const row of originals) {
        const source = sourceMap.get(
          `${prefix}:source:${(await hex(`transaction:${row.rowId}`)).slice(0, 24)}`,
        );
        if (
          !source ||
          !source.payload ||
          typeof source.payload !== 'object' ||
          Object.entries(row).some(
            ([key, value]) =>
              JSON.stringify((source.payload as Record<string, unknown>)[key]) !==
              JSON.stringify(value),
          )
        )
          sourceMismatches++;
      }
      for (const row of valid) {
        const transactionId = `${prefix}:transaction:${(await hex(`transaction:${row.rowId}`)).slice(0, 24)}`;
        const current = added.find((t) => t.id === transactionId);
        if (
          !current ||
          current.date !== row.date ||
          current.type !== row.kind ||
          current.amount !== row.amount ||
          current.description !== row.description.trim()
        )
          transactionMismatches++;
        if (!current || current.ledgerId !== candidate.monthlyLedgerIds?.[row.sheet])
          routingMismatches++;
        for (const name of [row.major, row.minor, row.tag].filter(Boolean))
          if (
            !current ||
            !current.tagIds.some(
              (id) => imported.tags.find((tag) => tag.id === id)?.name === name.trim(),
            )
          )
            tagMismatches++;
      }
      for (const original of candidate.backup.tables.source_records) {
        const source = sourceMap.get(String(original.id));
        if (
          !source ||
          source.sourceId !== original.source_id ||
          source.sourceLocation !== original.source_location ||
          source.status !== original.status ||
          source.kind !== original.kind ||
          source.note !== original.note ||
          JSON.stringify(source.payload) !== original.payload_json
        )
          sourceMismatches++;
      }
      // Verify options on both transaction and amount-less source rows, including pending memos.
      for (const sheet of book.sheets.filter((s) => /^(?:[1-9]|1[0-2])$/.test(s.name)))
        for (const row of [
          ...Array.from({ length: 20 }, (_, i) => i + 7),
          ...Array.from({ length: 300 }, (_, i) => i + 30),
        ])
          for (const column of ['W', 'X', 'Z']) {
            const name = String(sheet.cells[`${column}${row}`]?.value ?? '').trim();
            if (
              name &&
              !imported.tags.some((tag) => tag.name === name && tag.id.startsWith(prefix))
            )
              tagMismatches++;
          }
      expect(
        transactionMismatches,
        'Private workbook transaction count/row/total/month mismatch count',
      ).toBe(0);
      expect(sourceMismatches, 'Private workbook raw source/status/branch mismatch count').toBe(0);
      expect(routingMismatches, 'Private workbook source-sheet ledger routing mismatch count').toBe(
        0,
      );
      expect(tagMismatches, 'Private workbook missing source tag count').toBe(0);
      expect(
        imported.ledgers.filter((l) => l.parentId === candidate.ledgerId).length,
        'Private workbook monthly child ledger count',
      ).toBe(12);
      expect(
        imported.ledgers.find((l) => l.id === candidate.ledgerId)?.parentId === null,
        'Private workbook independent root',
      ).toBe(true);
      expect(
        added.filter((t) => t.paymentMethodId !== null && !t.paymentMethodId.startsWith(prefix))
          .length,
        'Private workbook invented payment mapping count',
      ).toBe(0);
      let observationMismatches = 0,
        observationCount = 0;
      for (const source of management.assets) {
        const id = `${prefix}:asset:${(await hex(source.key)).slice(0, 24)}`,
          asset = imported.assets.find((a) => a.id === id);
        for (const observation of source.observations) {
          observationCount++;
          if (
            !asset ||
            assetBalanceAt(asset, imported.assetMovements, observation.date) !== observation.amount
          )
            observationMismatches++;
        }
      }
      expect(observationCount, 'Private workbook asset observation count').toBe(68);
      expect(observationMismatches, 'Private workbook asset observation mismatch count').toBe(0);
      const restoredBytes = await restoreWorkbookArchive(sources, archive.id);
      expect(
        restoredBytes.length === bytes.length &&
          restoredBytes.every((byte, index) => byte === bytes[index]),
        'Private workbook archive bytes and validated SHA-256 match',
      ).toBe(true);
      const saved = await backup(),
        again = await buildWorkbookImport(book, saved, options);
      const archiveAgain = await appendWorkbookArchive(
        again.backup,
        sourceId,
        'private-workbook.xlsx',
        bytes,
      );
      expect(again.transactions.count, 'Private workbook reimport new transaction count').toBe(0);
      expect(
        Object.values(again.counts).reduce((sum, count) => sum + count, 0),
        'Private workbook reimport new database row count',
      ).toBe(0);
      expect(archiveAgain.added, 'Private workbook reimport new archive row count').toBe(0);
      const roundTrip = await previewRestore(saved);
      expect(roundTrip.issues.length, 'Private workbook round-trip issue count').toBe(0);
      const roundTripResponse = await restore(saved, roundTrip);
      verifyMetrics(roundTripResponse);
      expect(roundTripResponse.status, 'Private workbook round-trip status').toBe(200);
      const restored = await backup();
      let effectMismatches = Number(
        restored.tables.asset_effects.length !== saved.tables.asset_effects.length,
      );
      const oldEffects = new Map(
        saved.tables.asset_effects.map((row) => [row.id, JSON.stringify(row)]),
      );
      for (const row of restored.tables.asset_effects)
        if (oldEffects.get(row.id) !== JSON.stringify(row)) effectMismatches++;
      expect(effectMismatches, 'Private workbook round-trip asset effect mismatch count').toBe(0);
      const afterSources = (await (
        await call('/api/data/source-records')
      ).json()) as SourceRecord[];
      let roundTripSourceMismatches = Number(afterSources.length !== sources.length);
      for (const row of afterSources) {
        const prior = sourceMap.get(row.id);
        if (
          !prior ||
          prior.status !== row.status ||
          prior.note !== row.note ||
          JSON.stringify(prior.payload) !== JSON.stringify(row.payload)
        )
          roundTripSourceMismatches++;
      }
      expect(
        roundTripSourceMismatches,
        'Private workbook round-trip pending/raw source mismatch count',
      ).toBe(0);
      const secondBytes = await restoreWorkbookArchive(afterSources, archive.id);
      expect(
        secondBytes.length === bytes.length &&
          secondBytes.every((byte, index) => byte === bytes[index]),
        'Private workbook round-trip archive integrity',
      ).toBe(true);
      console.info(
        'Private workbook verification counts only',
        JSON.stringify({
          originalRows: originals.length,
          transactions: added.length,
          baselineWithMinor: valid.filter((row) => row.minor).length,
          addedWithoutMinor: valid.filter((row) => !row.minor).length,
          unassignedPayment: added.filter((t) => t.paymentMethodId === null).length,
          monthlyLedgers: Object.keys(candidate.monthlyLedgerIds ?? {}).length,
          observations: observationCount,
          sourceRecords: sources.length,
          pending: sources.filter((row) => row.status === 'pending').length,
          resolved: sources.filter((row) => row.status === 'resolved').length,
          reference: sources.filter((row) => row.status === 'reference').length,
          archiveRecords: sources.filter(isWorkbookArchiveRecord).length,
          ...metrics,
          mismatches:
            transactionMismatches +
            sourceMismatches +
            routingMismatches +
            tagMismatches +
            observationMismatches +
            effectMismatches +
            roundTripSourceMismatches,
          reimportAdded: again.transactions.count + archiveAgain.added,
        }),
      );
    },
    300_000,
  );
  it('parses multiline CSV, rejects unknown mappings and neutralizes formula-like exported text', async () => {
    const data = await state();
    const rows = parseCsv(
      '원본 행 ID,날짜,내역,금액,유형,결제수단\r\na,2026.9.16,"줄1\n줄2","12,000",지출,card-j\r\n',
    );
    const converted = csvImportRows(rows, defaultCsvMapping(rows[0]), 'main', data);
    expect(converted.errors).toEqual([]);
    expect(converted.rows[0].transaction).toMatchObject({
      date: '2026-09-16',
      description: '줄1\n줄2',
      amount: 12000,
    });
    const unknown = structuredClone(rows);
    unknown[1][5] = '알 수 없음';
    expect(
      csvImportRows(unknown, defaultCsvMapping(rows[0]), 'main', data).errors.length,
    ).toBeGreaterThan(0);
    const exportData = {
      ...data,
      transactions: [{ ...data.transactions[0], description: '=1+1' }],
    };
    expect(parseCsv(transactionsCsv(exportData))[1][2]).toBe("'=1+1");
  });
});
