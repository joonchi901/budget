import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import type { Bootstrap, MutationResult } from '../../src/shared/types';
import type { Plan } from '../../src/shared/planning';
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
const base = {
  ledgerId: 'main',
  title: '월 예산',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  amount: 1000000,
  tagIds: [],
  paymentMethodId: null,
  ownerId: null,
  includeLinked: true,
  notes: '계획용',
  archived: false,
  kind: 'budget',
  budgetScope: 'total',
  cadence: 'month',
};
async function create(fields: Record<string, unknown> = {}) {
  const response = await call('/api/plans', 'POST', {
    ...base,
    mutationId: crypto.randomUUID(),
    ...fields,
  });
  const result = (await response.json()) as MutationResult & { plan: Plan };
  expect(response.status, JSON.stringify(result)).toBe(200);
  return result.plan;
}
async function snapshot() {
  const response = await call('/api/bootstrap');
  expect(response.status).toBe(200);
  return (await response.json()) as Bootstrap;
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
describe('planning records Worker API', () => {
  it('persists all five plan kinds without creating expenses or asset effects', async () => {
    const before = await snapshot();
    const budget = await create();
    const goal = await create({
      kind: 'goal',
      title: '저축 목표',
      metric: 'savings',
      direction: 'atLeast',
      assetId: 'investment',
    });
    const payroll = await create({
      kind: 'payroll',
      title: '월급 배분',
      rounding: 'floor10000',
      amount: 3456789,
      lines: [
        {
          id: 'a',
          title: '이자',
          amount: 34567,
          rounding: 'ceil10000',
          purpose: 'expense',
          assetId: null,
        },
        {
          id: 'b',
          title: '적금',
          amount: 500000,
          rounding: 'none',
          purpose: 'savings',
          assetId: 'investment',
        },
      ],
    });
    const event = await create({
      kind: 'event',
      title: '가족 행사',
      actualMode: 'manual',
      actualAmount: 123000,
      evaluation: '예산 이내',
    });
    const schedule = await create({
      kind: 'schedule',
      title: '보험료',
      startDate: '2026-01-31',
      endDate: '2026-12-31',
      repeat: 'monthly',
      paymentMethodId: 'account',
      payments: [],
    });
    const after = await snapshot();
    expect(after.plans?.map((p) => p.id)).toEqual(
      expect.arrayContaining([budget.id, goal.id, payroll.id, event.id, schedule.id]),
    );
    expect(after.plans?.find((p) => p.id === event.id)).toMatchObject({
      actualAmount: 123000,
      evaluation: '예산 이내',
      version: 1,
    });
    expect(after.transactions).toEqual(before.transactions);
    expect(after.assetMovements).toEqual(before.assetMovements);
    expect(after.assets).toEqual(before.assets);
  });
  it('replays a mutation exactly and rejects stale or reused writes', async () => {
    const plan = await create({
      kind: 'event',
      title: '수정 검증',
      actualMode: 'transactions',
      actualAmount: null,
      evaluation: '',
    });
    const body = { mutationId: crypto.randomUUID(), expectedVersion: 1, notes: '변경' };
    const first = await call(`/api/plans/${plan.id}`, 'PATCH', body);
    expect(first.status).toBe(200);
    const result = (await first.json()) as MutationResult & { plan: Plan };
    expect(result.plan.version).toBe(2);
    const second = await call(`/api/plans/${plan.id}`, 'PATCH', body);
    expect(await second.json()).toMatchObject({
      replayed: true,
      revision: result.revision,
      plan: { version: 2 },
    });
    expect(
      (await call(`/api/plans/${plan.id}`, 'PATCH', { ...body, notes: '다른 내용' })).status,
    ).toBe(409);
    expect(
      (await call(`/api/plans/${plan.id}`, 'PATCH', { ...body, mutationId: crypto.randomUUID() }))
        .status,
    ).toBe(409);
  });
  it('archives and restores retained plans and disallows duplicate total budgets', async () => {
    const existing = (await snapshot()).plans!.find((p) => p.kind === 'budget')!;
    expect(
      (await call('/api/plans', 'POST', { ...base, mutationId: crypto.randomUUID() })).status,
    ).toBe(400);
    expect(
      (
        await call(`/api/plans/${existing.id}`, 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 1,
          archived: true,
        })
      ).status,
    ).toBe(200);
    expect((await snapshot()).plans!.find((p) => p.id === existing.id)?.archived).toBe(true);
    expect(
      (
        await call(`/api/plans/${existing.id}`, 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 2,
          archived: false,
        })
      ).status,
    ).toBe(200);
    const unique = await create({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(unique.amount).toBe(1000000);
  });
  it('validates relationships against the current household and rejects invalid amounts or filters', async () => {
    await db.prepare("INSERT INTO households(id,name) VALUES('plan-other','Other')").run();
    await db
      .prepare(
        "INSERT INTO payment_methods(id,household_id,name,type,owner_id) VALUES('plan-foreign-account','plan-other','Other','account','shared')",
      )
      .run();
    for (const fields of [
      { ledgerId: 'missing' },
      { kind: 'goal', metric: 'savings', direction: 'atLeast', assetId: 'missing' },
      { budgetScope: 'category', tagIds: ['missing'] },
      { budgetScope: 'category', tagIds: [] },
      { paymentMethodId: 'plan-foreign-account' },
      { amount: -1 },
      { amount: 1.5 },
      { cadence: 'week' },
      { endDate: '2026-02-30' },
      { kind: 'goal', metric: 'savings', direction: 'atLeast', assetId: null, ownerId: 'u1' },
    ]) {
      const response = await call('/api/plans', 'POST', {
        ...base,
        mutationId: crypto.randomUUID(),
        ...fields,
      });
      expect(response.status, JSON.stringify(fields)).toBe(400);
    }
  });
  it('accepts OR filters even for single-select tag types and guards invalid category scope', async () => {
    const state = await snapshot();
    const group = state.tagGroups.find(
      (g) => g.appliesTo === 'transaction' && g.selectionMode === 'single',
    )!;
    const ids = state.tags
      .filter((t) => t.groupId === group.id)
      .slice(0, 2)
      .map((t) => t.id);
    expect(ids).toHaveLength(2);
    const plan = await create({ budgetScope: 'category', tagIds: ids });
    expect(plan.tagIds).toEqual([...ids].sort());
    expect(
      (
        await call(`/api/plans/${plan.id}`, 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 1,
          budgetScope: 'total',
        })
      ).status,
    ).toBe(400);
  });
  it('stores monthly payment confirmations, validates due dates, and leaves expenses unchanged', async () => {
    const schedule = await create({
      kind: 'schedule',
      repeat: 'monthly',
      startDate: '2027-01-31',
      endDate: '2027-04-30',
      payments: [],
    });
    const before = await snapshot();
    const body = {
      mutationId: crypto.randomUUID(),
      expectedVersion: 1,
      payments: [{ date: '2027-02-28', paidDate: '2027-03-02', amount: 98000, note: '확인 완료' }],
    };
    const paid = await call(`/api/plans/${schedule.id}`, 'PATCH', body);
    expect(paid.status).toBe(200);
    expect(await paid.json()).toMatchObject({ plan: { payments: body.payments, version: 2 } });
    for (const payments of [
      [{ ...body.payments[0], date: '2027-02-27' }],
      [body.payments[0], body.payments[0]],
      [{ ...body.payments[0], paidDate: '2027-02-30' }],
    ])
      expect(
        (
          await call(`/api/plans/${schedule.id}`, 'PATCH', {
            mutationId: crypto.randomUUID(),
            expectedVersion: 2,
            payments,
          })
        ).status,
      ).toBe(400);
    expect((await snapshot()).transactions).toEqual(before.transactions);
    expect((await snapshot()).assetMovements).toEqual(before.assetMovements);
  });
});
