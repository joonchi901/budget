import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import type { Bootstrap, MutationResult } from '../../src/shared/types';

let runtime: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
let cookies: string[];
async function sqlFile(path: string) {
  for (const statement of (await readFile(path, 'utf8'))
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(statement).run();
}
async function call(path: string, method = 'GET', body?: Record<string, unknown>, actor = 0) {
  return runtime.dispatchFetch(`http://localhost${path}`, {
    method,
    headers: { Cookie: cookies?.[actor] ?? '', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function snapshot(actor = 0): Promise<Bootstrap> {
  const response = await call('/api/bootstrap', 'GET', undefined, actor);
  expect(response.status).toBe(200);
  return (await response.json()) as Bootstrap;
}
async function save(
  path: string,
  method: string,
  body: Record<string, unknown>,
  actor = 0,
): Promise<MutationResult> {
  const response = await call(path, method, { mutationId: crypto.randomUUID(), ...body }, actor);
  const data = await response.json();
  expect(response.status, JSON.stringify(data)).toBe(200);
  return data as MutationResult;
}
async function create(name: string, parentId: string | null = null) {
  const state = await snapshot();
  return (
    await save('/api/ledgers', 'POST', {
      name,
      parentId,
      budget: 1000,
      expectedHierarchyVersion: state.hierarchyVersion,
    })
  ).ledger!;
}
async function move(id: string, parentId: string | null, beforeId?: string | null) {
  const state = await snapshot();
  return save(`/api/ledgers/${id}`, 'PATCH', {
    parentId,
    ...(beforeId === undefined ? {} : { beforeId }),
    expectedVersion: state.ledgers.find((l) => l.id === id)!.version,
    expectedHierarchyVersion: state.hierarchyVersion,
  });
}
async function promote() {
  const state = await snapshot();
  return save('/api/users/u2/role', 'PATCH', {
    role: 'admin',
    expectedHierarchyVersion: state.hierarchyVersion,
  });
}

beforeAll(async () => {
  const built = await build({
    entryPoints: ['src/server/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: '2026-09-16',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      durableObjects: { COLLABORATION: { className: 'HouseholdRoom', useSQLite: true } },
      bindings: { DEMO_MODE: 'true' },
    }),
  );
  db = await runtime.getD1Database('DB');
  for (const name of (await readdir('migrations')).filter((n) => n.endsWith('.sql')).sort())
    await sqlFile(`migrations/${name}`);
});
beforeEach(async () => {
  for (const table of [
    'record_history',
    'source_records',
    'import_records',
    'planning_records',
    'changes',
    'mutation_receipts',
    'asset_effects',
    'asset_operations',
    'asset_movements',
    'transactions',
    'rules',
    'tags',
    'tag_groups',
    'payment_methods',
    'assets',
    'ledgers',
    'sessions',
    'users',
    'households',
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
  await sqlFile('seeds/demo.sql');
  cookies = [];
  for (const userId of ['u1', 'u2']) {
    const response = await call('/api/auth/demo', 'POST', { userId }, -1);
    expect(response.status).toBe(200);
    cookies.push(response.headers.get('Set-Cookie')!.split(';')[0]);
  }
});
afterAll(async () => {
  await runtime?.dispose();
});

describe('arbitrary ledger hierarchy and role concurrency', () => {
  test('creates nested ledgers and roots, moves legacy main with its whole subtree and resets only moved mappings', async () => {
    const year = await create('2026');
    const month = await create('1월', year.id);
    const travel = await create('여행', month.id);
    await save('/api/ledgers/main', 'PATCH', {
      expectedVersion: (await snapshot()).ledgers.find((l) => l.id === 'main')!.version,
      tagMappings: { travel: 'daily' },
    });
    const before = await snapshot();
    const moved = await move('main', travel.id);
    expect(moved.ledger).toMatchObject({ kind: 'purpose', parentId: travel.id, tagMappings: {} });
    const after = await snapshot();
    expect(after.ledgers.find((l) => l.id === 'trip')?.parentId).toBe('main');
    expect(after.transactions).toEqual(before.transactions);
    expect(after.assets).toEqual(before.assets);
    expect(after.assetMovements).toEqual(before.assetMovements);
    expect(after.ledgers.find((l) => l.id === year.id)?.budget).toBe(1000);
    await move('main', null);
    expect((await snapshot()).ledgers.find((l) => l.id === 'main')?.parentId).toBeNull();
  });

  test('normalizes sibling ordering atomically and supports root reordering', async () => {
    const a = await create('A'),
      b = await create('B'),
      c = await create('C');
    await move(c.id, null, a.id);
    let roots = (await snapshot()).ledgers
      .filter((l) => l.parentId === null)
      .sort((x, y) => x.sortOrder! - y.sortOrder!);
    expect(roots.map((l) => l.id)).toEqual(['main', c.id, a.id, b.id]);
    expect(roots.map((l) => l.sortOrder)).toEqual([0, 1, 2, 3]);
    await move(a.id, c.id);
    roots = (await snapshot()).ledgers
      .filter((l) => l.parentId === null)
      .sort((x, y) => x.sortOrder! - y.sortOrder!);
    expect(roots.map((l) => l.sortOrder)).toEqual([0, 1, 2]);
    const before = await snapshot();
    const response = await call(`/api/ledgers/${b.id}`, 'PATCH', {
      mutationId: 'foreign-sibling',
      parentId: null,
      beforeId: a.id,
      expectedVersion: before.ledgers.find((l) => l.id === b.id)!.version,
      expectedHierarchyVersion: before.hierarchyVersion,
    });
    expect(response.status).toBe(400);
  });

  test('user can edit metadata and transactions but cannot forge admin or change structure and roles', async () => {
    expect((await snapshot(1)).user.role).toBe('user');
    for (const [path, method, body] of [
      ['/api/ledgers', 'POST', { name: '우회', budget: 1, role: 'admin' }],
      ['/api/ledgers/trip', 'PATCH', { parentId: null }],
      ['/api/ledgers/trip', 'PATCH', { beforeId: null }],
      ['/api/ledgers/trip', 'PATCH', { sortOrder: 0 }],
      ['/api/ledgers/trip', 'PATCH', { archived: true }],
      ['/api/users/u2/role', 'PATCH', { role: 'admin' }],
    ] as const) {
      const response = await call(
        path,
        method,
        {
          mutationId: crypto.randomUUID(),
          expectedVersion: 1,
          expectedHierarchyVersion: 1,
          ...body,
        },
        1,
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'ADMIN_REQUIRED' });
    }
    await save(
      '/api/ledgers/trip',
      'PATCH',
      { expectedVersion: 1, name: '사용자가 수정한 이름', budget: 500 },
      1,
    );
    const state = await snapshot(1);
    const tx = state.transactions[0];
    await save(
      '/api/transactions',
      'POST',
      { expectedVersion: tx.version, transaction: { ...tx, description: '공동 편집' } },
      1,
    );
    expect((await snapshot()).hierarchyVersion).toBe(1);
  });

  test('requires an explicit hierarchy version and rejects cross-household parents and cycles', async () => {
    let response = await call('/api/ledgers', 'POST', {
      mutationId: 'no-version',
      name: '누락',
      budget: 1,
    });
    expect(response.status).toBe(400);
    await db.prepare("INSERT INTO households(id,name) VALUES('other','다른 가구')").run();
    await db
      .prepare(
        "INSERT INTO ledgers(id,household_id,name,icon,kind) VALUES('foreign','other','비공개','📒','purpose')",
      )
      .run();
    for (const parentId of ['main', 'trip', 'foreign']) {
      response = await call('/api/ledgers/main', 'PATCH', {
        mutationId: crypto.randomUUID(),
        parentId,
        expectedVersion: 1,
        expectedHierarchyVersion: 1,
      });
      expect(response.status).toBe(400);
    }
    expect((await snapshot()).hierarchyVersion).toBe(1);
  });

  test('two admins cannot both move different nodes to form a cycle from the same tree version', async () => {
    await promote();
    const a = await create('A'),
      b = await create('B');
    const before = await snapshot();
    const requests = [
      [a.id, b.id],
      [b.id, a.id],
    ].map(([id, parentId], actor) =>
      call(
        `/api/ledgers/${id}`,
        'PATCH',
        {
          mutationId: `cycle-${actor}`,
          parentId,
          expectedVersion: before.ledgers.find((l) => l.id === id)!.version,
          expectedHierarchyVersion: before.hierarchyVersion,
        },
        actor,
      ),
    );
    const responses = await Promise.all(requests);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const bodies = await Promise.all(responses.map((r) => r.json()));
    expect(bodies.find((b: any) => b.code)).toMatchObject({
      code: 'HIERARCHY_CONFLICT',
      current: { hierarchyVersion: before.hierarchyVersion! + 1 },
    });
    const after = await snapshot();
    expect(after.hierarchyVersion).toBe(before.hierarchyVersion! + 1);
    expect(
      after.ledgers.filter((l) => [a.id, b.id].includes(l.id) && l.parentId !== null),
    ).toHaveLength(1);
    const loser = responses.findIndex((r) => r.status === 409);
    const [id, parentId] = [
      [a.id, b.id],
      [b.id, a.id],
    ][loser];
    const retry = await call(
      `/api/ledgers/${id}`,
      'PATCH',
      {
        mutationId: 'reviewed-cycle',
        parentId,
        expectedVersion: after.ledgers.find((l) => l.id === id)!.version,
        expectedHierarchyVersion: after.hierarchyVersion,
      },
      loser,
    );
    expect(retry.status).toBe(400);
  });

  test('simultaneous same-node moves have one winner and retry identity does not apply twice', async () => {
    await promote();
    const before = await snapshot();
    const body = {
      mutationId: 'same-node',
      parentId: null,
      expectedVersion: 1,
      expectedHierarchyVersion: before.hierarchyVersion,
    };
    const responses = await Promise.all([
      call('/api/ledgers/trip', 'PATCH', body),
      call('/api/ledgers/trip', 'PATCH', { ...body, mutationId: 'other-admin' }, 1),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex((r) => r.status === 200);
    const again = await call(
      '/api/ledgers/trip',
      'PATCH',
      winner === 0 ? body : { ...body, mutationId: 'other-admin' },
      winner,
    );
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({
      replayed: true,
      hierarchyVersion: before.hierarchyVersion! + 1,
    });
    expect((await snapshot()).revision).toBe(before.revision + 1);
  });

  test('an unrelated metadata edit preserves hierarchy version and stale record versions are still rejected', async () => {
    const before = await snapshot();
    await save('/api/ledgers/trip', 'PATCH', { expectedVersion: 1, name: '새 이름' }, 1);
    const response = await call('/api/ledgers/trip', 'PATCH', {
      mutationId: 'stale-record',
      parentId: null,
      expectedVersion: 1,
      expectedHierarchyVersion: before.hierarchyVersion,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'VERSION_CONFLICT',
      current: { version: 2 },
    });
    expect((await snapshot()).hierarchyVersion).toBe(before.hierarchyVersion);
  });

  test('protects the last admin and serializes concurrent demotions; existing sessions see current roles', async () => {
    const last = await call('/api/users/u1/role', 'PATCH', {
      mutationId: 'last-admin',
      role: 'user',
      expectedHierarchyVersion: 1,
    });
    expect(last.status).toBe(400);
    expect(await last.json()).toMatchObject({ code: 'LAST_ADMIN' });
    const promotion = await promote();
    expect(promotion.user).toMatchObject({ id: 'u2', role: 'admin' });
    expect((await snapshot(1)).user.role).toBe('admin');
    const responses = await Promise.all(
      [0, 1].map((actor) =>
        call(
          `/api/users/u${actor + 1}/role`,
          'PATCH',
          {
            mutationId: `demote-${actor}`,
            role: 'user',
            expectedHierarchyVersion: promotion.hierarchyVersion,
          },
          actor,
        ),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const state = await snapshot();
    expect(state.users.filter((u) => u.role === 'admin')).toHaveLength(1);
    const demoted = state.users.findIndex((u) => u.role === 'user');
    expect((await snapshot(demoted)).user.role).toBe('user');
    const forbidden = await call(
      '/api/ledgers/trip',
      'PATCH',
      {
        mutationId: 'revoked-session',
        expectedVersion: 1,
        expectedHierarchyVersion: state.hierarchyVersion,
        parentId: null,
      },
      demoted,
    );
    expect(forbidden.status).toBe(403);
    const audit = await db
      .prepare(
        "SELECT before_json,after_json FROM record_history WHERE entity_type='user' ORDER BY revision",
      )
      .all();
    expect(audit.results).toHaveLength(2);
    expect(JSON.parse(String(audit.results[0].before_json)).role).toBe('user');
    expect(JSON.parse(String(audit.results[0].after_json)).role).toBe('admin');
  });

  test('simultaneous role revocation and structure mutation cannot both commit from one hierarchy version', async () => {
    const promotion = await promote();
    const responses = await Promise.all([
      call('/api/users/u2/role', 'PATCH', {
        mutationId: 'revoke-admin',
        role: 'user',
        expectedHierarchyVersion: promotion.hierarchyVersion,
      }),
      call(
        '/api/ledgers/trip',
        'PATCH',
        {
          mutationId: 'revoking-move',
          parentId: null,
          expectedVersion: 1,
          expectedHierarchyVersion: promotion.hierarchyVersion,
        },
        1,
      ),
    ]);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 403 || r.status === 409)).toHaveLength(1);
    expect((await snapshot()).hierarchyVersion).toBe(promotion.hierarchyVersion! + 1);
  });
});
