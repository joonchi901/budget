import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import type { Asset, Bootstrap, MutationResult } from '../../src/shared/types';
import { assetBalanceAt, assetSummaryAt, assetYearHistory } from '../../src/shared/assets';

let runtime: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
let cookie = '';
async function sql(path: string) {
  for (const statement of (await readFile(path, 'utf8'))
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(statement).run();
}
async function call(path: string, method = 'GET', body?: unknown) {
  return runtime.dispatchFetch(`http://localhost${path}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function result(path: string, method: string, body: unknown) {
  const response = await call(path, method, body);
  const value = (await response.json()) as MutationResult;
  expect(response.status, JSON.stringify(value)).toBe(200);
  return value;
}
async function snapshot() {
  const response = await call('/api/bootstrap');
  expect(response.status).toBe(200);
  return (await response.json()) as Bootstrap;
}
async function create(fields: Record<string, unknown> = {}): Promise<Asset> {
  return (
    await result('/api/assets', 'POST', {
      mutationId: crypto.randomUUID(),
      name: '날짜별 잔액 검증',
      kind: 'asset',
      openingBalance: 1000,
      openingDate: '2026-01-01',
      color: '#31725f',
      tagIds: [],
      trackSavings: false,
      ...fields,
    })
  ).asset!;
}
async function postTransaction(
  assetId: string,
  date: string,
  amount: number,
  type: 'income' | 'expense',
) {
  return result('/api/transactions', 'POST', {
    mutationId: crypto.randomUUID(),
    transaction: {
      ledgerId: 'main',
      date,
      amount,
      type,
      description: '자산 날짜 검증 거래',
      ownerId: 'shared',
      paymentMethodId: 'account',
      tagIds: [],
      allocations: [{ assetId, amount }],
    },
  });
}
beforeAll(async () => {
  const output = await build({
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
      script: output.outputFiles[0].text,
      compatibilityDate: '2026-09-16',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      durableObjects: { COLLABORATION: { className: 'HouseholdRoom', useSQLite: true } },
      bindings: { DEMO_MODE: 'true' },
    }),
  );
  db = await runtime.getD1Database('DB');
  for (const file of (await readdir('migrations')).filter((f) => f.endsWith('.sql')).sort())
    await sql(`migrations/${file}`);
  await sql('seeds/demo.sql');
  const login = await call('/api/auth/demo', 'POST', { userId: 'u1' });
  cookie = login.headers.get('Set-Cookie')!.split(';')[0];
});
afterAll(async () => {
  await runtime?.dispose();
});

describe('asset metadata and dated valuation API', () => {
  it('persists an observed baseline, keeps earlier history unknown and applies later valuations without savings', async () => {
    const item = await create({
      openingDate: '2026-02-28',
      details: { openingKind: 'observation' },
      trackSavings: true,
    });
    expect(item.details?.openingKind).toBe('observation');
    const saved = await result('/api/asset-operations', 'POST', {
      mutationId: crypto.randomUUID(),
      type: 'adjustment',
      date: '2026-03-31',
      description: '다음 월말 확인 잔액',
      assetId: item.id,
      targetBalance: 1200,
      expectedAssetVersions: { [item.id]: item.version },
    });
    const after = await snapshot();
    const current = after.assets.find((asset) => asset.id === item.id)!;
    const moves = after.assetMovements.filter((movement) => movement.assetId === item.id);
    expect(assetBalanceAt(current, moves, '2026-02-27')).toBeNull();
    expect(assetBalanceAt(current, moves, '2026-02-28')).toBe(1000);
    expect(assetBalanceAt(current, moves, '2026-03-31')).toBe(1200);
    expect(
      moves.find((movement) => movement.operationId === saved.assetOperation!.id),
    ).toMatchObject({ amount: 200, savingsAmount: 0 });
    const history = assetYearHistory({ assets: [current], assetMovements: moves }, '2026');
    expect(history[0].net).toBeNull();
    expect(history[1].net).toBe(1000);
    expect(history[2].net).toBe(1200);
    const patch = {
      mutationId: crypto.randomUUID(),
      expectedVersion: current.version,
      details: { openingKind: 'initial' },
    };
    const updated = (await result(`/api/assets/${item.id}`, 'PATCH', patch)).asset!;
    expect(updated.details?.openingKind).toBe('initial');
    expect(updated.balance).toBe(1200);
    expect(assetBalanceAt(updated, moves, '2026-02-27')).toBe(0);
    expect((await result(`/api/assets/${item.id}`, 'PATCH', patch)).replayed).toBe(true);
    expect(
      (await call(`/api/assets/${item.id}`, 'PATCH', { ...patch, mutationId: crypto.randomUUID() }))
        .status,
    ).toBe(409);
  });
  it('targets a past closing balance without subtracting future movements, replays once and reverses once', async () => {
    const item = await create();
    await postTransaction(item.id, '2026-03-01', 600, 'income');
    await postTransaction(item.id, '2026-02-10', 100, 'expense');
    const before = await snapshot();
    const current = before.assets.find((a) => a.id === item.id)!;
    const body = {
      mutationId: crypto.randomUUID(),
      type: 'adjustment',
      date: '2026-02-28',
      description: '2월말 평가액 확인',
      assetId: item.id,
      targetBalance: 950,
      expectedAssetVersions: { [item.id]: current.version },
    };
    const saved = await result('/api/asset-operations', 'POST', body);
    expect(saved.assetOperation).toMatchObject({
      amount: 50,
      targetBalance: 950,
      date: '2026-02-28',
    });
    const after = await snapshot();
    const updated = after.assets.find((a) => a.id === item.id)!;
    expect(updated.balance).toBe(1550);
    expect(updated.version).toBe(current.version + 1);
    expect(assetBalanceAt(updated, after.assetMovements, '2026-02-28')).toBe(950);
    expect(assetBalanceAt(updated, after.assetMovements, '2026-03-31')).toBe(1550);
    expect(
      after.assetMovements.find((m) => m.operationId === saved.assetOperation!.id),
    ).toMatchObject({ amount: 50, date: '2026-02-28', savingsAmount: 0 });
    expect(after.transactions).toEqual(before.transactions);
    expect((await result('/api/asset-operations', 'POST', body)).replayed).toBe(true);
    expect(
      (
        await call('/api/asset-operations', 'POST', {
          ...body,
          mutationId: crypto.randomUUID(),
          targetBalance: 970,
        })
      ).status,
    ).toBe(409);
    const cancel = {
      mutationId: crypto.randomUUID(),
      expectedVersion: saved.assetOperation!.version,
    };
    await result(`/api/asset-operations/${saved.assetOperation!.id}`, 'DELETE', cancel);
    expect(
      (await result(`/api/asset-operations/${saved.assetOperation!.id}`, 'DELETE', cancel))
        .replayed,
    ).toBe(true);
    const reversed = await snapshot();
    expect(reversed.assets.find((a) => a.id === item.id)!.balance).toBe(1500);
    expect(
      reversed.assetOperations.find((op) => op.id === saved.assetOperation!.id)!.deletedAt,
    ).not.toBeNull();
  });

  it('persists all manual loan information without changing balances and rejects stale settings', async () => {
    const details = {
      ownerId: 'u2',
      institution: '테스트 은행',
      notes: '대출 관리 메모',
      principal: 50000000,
      rate: 3.45,
      rateType: '변동',
      paymentDay: 25,
      monthlyPayment: 420000,
      term: '24개월',
      endDate: '2028-01-31',
      repaymentMethod: '원리금 균등',
      conditions: '급여 이체',
      fees: '중도상환 조건 확인',
      benefits: '우대 0.2%',
    };
    const item = await create({
      name: '전세 대출 상세',
      kind: 'liability',
      openingBalance: 48000000,
      details,
    });
    expect(item.details).toEqual(details);
    const before = await snapshot();
    const body = {
      mutationId: crypto.randomUUID(),
      expectedVersion: item.version,
      details: { rate: 3.2, notes: '금리 변경' },
    };
    const updated = (await result(`/api/assets/${item.id}`, 'PATCH', body)).asset!;
    expect(updated.details).toEqual({ ...details, rate: 3.2, notes: '금리 변경' });
    expect(updated.balance).toBe(48000000);
    expect(updated.version).toBe(2);
    expect((await result(`/api/assets/${item.id}`, 'PATCH', body)).replayed).toBe(true);
    expect(
      (await call(`/api/assets/${item.id}`, 'PATCH', { ...body, mutationId: crypto.randomUUID() }))
        .status,
    ).toBe(409);
    const after = await snapshot();
    expect(after.assetMovements).toEqual(before.assetMovements);
    expect(after.transactions).toEqual(before.transactions);
  });

  it('archives and restores without changing money, preserves history and blocks new operations while archived', async () => {
    const item = await create();
    const peer = await create();
    await postTransaction(item.id, '2026-02-01', 100, 'income');
    const before = await snapshot();
    const current = before.assets.find((a) => a.id === item.id)!;
    const archived = (
      await result(`/api/assets/${item.id}`, 'PATCH', {
        mutationId: crypto.randomUUID(),
        expectedVersion: current.version,
        archived: true,
      })
    ).asset!;
    const after = await snapshot();
    expect(after.assetMovements).toEqual(before.assetMovements);
    expect(assetSummaryAt(after, '2026-02-28').net).toBe(assetSummaryAt(before, '2026-02-28').net);
    expect(
      (
        await call('/api/asset-operations', 'POST', {
          mutationId: crypto.randomUUID(),
          type: 'transfer',
          date: '2026-02-10',
          description: '보관 차단',
          fromAssetId: item.id,
          toAssetId: peer.id,
          amount: 100,
          expectedAssetVersions: { [item.id]: archived.version, [peer.id]: peer.version },
        })
      ).status,
    ).toBe(400);
    const restored = (
      await result(`/api/assets/${item.id}`, 'PATCH', {
        mutationId: crypto.randomUUID(),
        expectedVersion: archived.version,
        archived: false,
      })
    ).asset!;
    expect(restored.archived).toBe(false);
    expect(restored.balance).toBe(1100);
  });

  it('requires a valid opening date and cannot move it after an already recorded effect', async () => {
    const missing = await call('/api/assets', 'POST', {
      mutationId: crypto.randomUUID(),
      name: '기준일 누락',
      kind: 'asset',
      openingBalance: 0,
      color: '#31725f',
      tagIds: [],
      trackSavings: false,
    });
    expect(missing.status).toBe(400);
    const item = await create();
    await postTransaction(item.id, '2026-02-10', 100, 'expense');
    const current = (await snapshot()).assets.find((a) => a.id === item.id)!;
    expect(
      (
        await call(`/api/assets/${item.id}`, 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: current.version,
          openingDate: '2026-02-11',
        })
      ).status,
    ).toBe(400);
    const updated = (
      await result(`/api/assets/${item.id}`, 'PATCH', {
        mutationId: crypto.randomUUID(),
        expectedVersion: current.version,
        openingDate: '2026-02-01',
      })
    ).asset!;
    expect(updated.openingDate).toBe('2026-02-01');
    expect(updated.balance).toBe(900);
    expect(
      (
        await call('/api/asset-operations', 'POST', {
          mutationId: crypto.randomUUID(),
          type: 'adjustment',
          date: '2026-01-31',
          description: '기준일 이전',
          assetId: item.id,
          targetBalance: 900,
          expectedAssetVersions: { [item.id]: updated.version },
        })
      ).status,
    ).toBe(400);
  });

  it('retains unknown legacy baselines until explicitly confirmed and validates loan fields', async () => {
    await db
      .prepare(
        "INSERT INTO assets(id,household_id,name,kind,opening_balance,color) VALUES('legacy-undated','home','기준일 미상','asset',500,'#31725f')",
      )
      .run();
    const legacy = (await snapshot()).assets.find((a) => a.id === 'legacy-undated')!;
    expect(legacy.openingDate).toBeNull();
    expect(assetBalanceAt(legacy, [], '2026-02-28')).toBeNull();
    expect(
      (
        await call('/api/asset-operations', 'POST', {
          mutationId: crypto.randomUUID(),
          type: 'adjustment',
          date: '2026-02-28',
          description: '기준일 없는 조정',
          assetId: legacy.id,
          targetBalance: 600,
          expectedAssetVersions: { [legacy.id]: legacy.version },
        })
      ).status,
    ).toBe(400);
    const confirmed = (
      await result(`/api/assets/${legacy.id}`, 'PATCH', {
        mutationId: crypto.randomUUID(),
        expectedVersion: legacy.version,
        openingDate: '2026-01-01',
      })
    ).asset!;
    expect(assetBalanceAt(confirmed, [], '2026-02-28')).toBe(500);
    for (const fields of [
      { details: { rate: 101 } },
      { details: { paymentDay: 32 } },
      { details: { principal: -1 } },
      { details: { ownerId: 'outsider' } },
      { details: { openingKind: 'invented' } },
      { openingBalance: -1 },
    ]) {
      const response = await call('/api/assets', 'POST', {
        mutationId: crypto.randomUUID(),
        name: '잘못된 대출',
        kind: 'liability',
        openingDate: '2026-01-01',
        openingBalance: 100,
        color: '#31725f',
        tagIds: [],
        trackSavings: false,
        ...fields,
      });
      expect(response.status).toBe(400);
    }
  });
});
