import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import type { Bootstrap, MutationResult } from '../../src/shared/types';
import type { ManagedPayment } from '../../src/shared/payments';
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
async function create(fields: Record<string, unknown> = {}) {
  const response = await call('/api/payment-methods', 'POST', {
    mutationId: crypto.randomUUID(),
    name: '새 통장',
    type: 'account',
    ownerId: 'shared',
    ...fields,
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as MutationResult & { paymentMethod: ManagedPayment })
    .paymentMethod;
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
describe('payment method management API', () => {
  it('persists account details and informational card relations without adding expenses', async () => {
    const before = (await (await call('/api/bootstrap')).json()) as Bootstrap;
    const account = await create({
      institution: '테스트은행',
      accountKind: '입출금',
      accountNumber: '000-1234-5678',
      assetId: 'checking',
      notes: '생활비',
    });
    const card = await create({
      type: 'card',
      name: '새 카드',
      cardKind: 'credit',
      closingDay: 31,
      paymentDay: 15,
      linkedAccountId: account.id,
      institution: '테스트카드',
      purpose: '생활비',
      monthlyBudget: 500000,
      annualFee: 20000,
      creditLimit: 3000000,
      performanceTarget: 300000,
      expiry: '2029-12',
      benefits: '교통 혜택',
    });
    expect(card.linkedAccountId).toBe(account.id);
    expect(card.monthlyBudget).toBe(500000);
    expect(card.version).toBe(1);
    const after = (await (await call('/api/bootstrap')).json()) as Bootstrap;
    expect(after.paymentMethods.find((p) => p.id === account.id)).toMatchObject({
      institution: '테스트은행',
      assetId: 'checking',
      closingDay: null,
      paymentDay: null,
    });
    expect(after.transactions).toEqual(before.transactions);
    expect(after.assetMovements).toEqual(before.assetMovements);
  });
  it('replays saves and rejects stale or reused mutations', async () => {
    const item = await create();
    const body = { mutationId: crypto.randomUUID(), expectedVersion: 1, name: '수정한 통장' };
    const response = await call(`/api/payment-methods/${item.id}`, 'PATCH', body);
    expect(response.status).toBe(200);
    const result = (await response.json()) as MutationResult & { paymentMethod: ManagedPayment };
    expect(result.paymentMethod.version).toBe(2);
    const replay = (await (
      await call(`/api/payment-methods/${item.id}`, 'PATCH', body)
    ).json()) as MutationResult;
    expect(replay.replayed).toBe(true);
    expect(replay.revision).toBe(result.revision);
    expect(
      (await call(`/api/payment-methods/${item.id}`, 'PATCH', { ...body, name: '다른 요청' }))
        .status,
    ).toBe(409);
    expect(
      (
        await call(`/api/payment-methods/${item.id}`, 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 1,
          name: '오래된 수정',
        })
      ).status,
    ).toBe(409);
  });
  it('archives and restores cards while preserving historical references', async () => {
    const before = (await (await call('/api/bootstrap')).json()) as Bootstrap;
    const card = before.paymentMethods.find((p) => p.id === 'card-j') as ManagedPayment;
    const archived = await call('/api/payment-methods/card-j', 'PATCH', {
      mutationId: crypto.randomUUID(),
      expectedVersion: card.version,
      archived: true,
    });
    expect(archived.status).toBe(200);
    const state = (await (await call('/api/bootstrap')).json()) as Bootstrap;
    expect(state.transactions).toEqual(before.transactions);
    expect(state.paymentMethods.find((p) => p.id === card.id)).toMatchObject({ archived: true });
    const restored = await call('/api/payment-methods/card-j', 'PATCH', {
      mutationId: crypto.randomUUID(),
      expectedVersion: (card.version ?? 1) + 1,
      archived: false,
    });
    expect(restored.status).toBe(200);
  });
  it('rejects foreign household links, missing accounts and invalid amounts', async () => {
    await db
      .prepare("INSERT INTO households(id,name) VALUES('other-payment-household','Other')")
      .run();
    await db
      .prepare(
        "INSERT INTO payment_methods(id,household_id,name,type,owner_id) VALUES('foreign-account','other-payment-household','Other','account','shared')",
      )
      .run();
    for (const fields of [
      { type: 'card', linkedAccountId: 'foreign-account' },
      { type: 'card', linkedAccountId: 'missing' },
      { monthlyBudget: -1 },
      { expiry: '2029-13' },
      { closingDay: 32, type: 'card' },
      { assetId: 'missing' },
    ]) {
      const response = await call('/api/payment-methods', 'POST', {
        mutationId: crypto.randomUUID(),
        name: '잘못된 항목',
        type: 'account',
        ownerId: 'shared',
        ...fields,
      });
      expect(response.status).toBe(400);
    }
  });
  it('retains archived linked accounts but blocks new links to them', async () => {
    const account = await create();
    const card = await create({ type: 'card', linkedAccountId: account.id });
    expect(
      (
        await call(`/api/payment-methods/${account.id}`, 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 1,
          archived: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(`/api/payment-methods/${card.id}`, 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 1,
          notes: '기존 연결 유지',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call('/api/payment-methods', 'POST', {
          mutationId: crypto.randomUUID(),
          type: 'card',
          name: '새 연결',
          ownerId: 'shared',
          linkedAccountId: account.id,
        })
      ).status,
    ).toBe(400);
  });
});
