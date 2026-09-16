import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import type {
  Bootstrap,
  MutationResult,
  Transaction,
  TransactionInput,
} from '../../src/shared/types';

let runtime: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
let cookie1: string;
let cookie2: string;
let bundledScript: string;
const sockets: { close(code?: number): void }[] = [];

async function sqlFile(path: string) {
  const sql = await readFile(path, 'utf8');
  for (const statement of sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)) {
    await db.prepare(statement).run();
  }
}

async function call(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie: string | null = cookie1,
  origin?: string,
) {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (origin) headers.Origin = origin;
  return runtime.dispatchFetch(`http://localhost${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function snapshot(cookie = cookie1): Promise<Bootstrap> {
  const response = await call('/api/bootstrap', 'GET', undefined, cookie);
  expect(response.status).toBe(200);
  return (await response.json()) as Bootstrap;
}

function expense(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    ledgerId: 'main',
    date: '2026-09-16',
    description: '동시성 검증 거래',
    amount: 30000,
    type: 'expense',
    category: '생활',
    ownerId: 'shared',
    paymentMethodId: 'card-j',
    tagIds: ['asset-use'],
    assetId: 'reserve',
    toAssetId: null,
    ...overrides,
  };
}

async function create(input = expense(), cookie = cookie1) {
  const response = await call(
    '/api/transactions',
    'POST',
    { mutationId: crypto.randomUUID(), transaction: input },
    cookie,
  );
  const data = (await response.json()) as MutationResult & { error?: string; code?: string };
  expect(response.status, JSON.stringify(data)).toBe(200);
  return data;
}

async function connect(cookie: string, ledgerId: string) {
  const response = await runtime.dispatchFetch(`http://localhost/api/ws?ledgerId=${ledgerId}`, {
    headers: { Upgrade: 'websocket', Cookie: cookie, Origin: 'http://localhost' },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  const events: Record<string, unknown>[] = [];
  socket.addEventListener('message', (event) => {
    if (event.data !== 'pong') events.push(JSON.parse(String(event.data)));
  });
  socket.accept();
  sockets.push(socket);
  return { socket, events };
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
  bundledScript = output.outputFiles[0].text;
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundledScript,
      compatibilityDate: '2026-09-16',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      durableObjects: { COLLABORATION: { className: 'HouseholdRoom', useSQLite: true } },
      bindings: { DEMO_MODE: 'true' },
    }),
  );
  db = await runtime.getD1Database('DB');
  await sqlFile('migrations/0001_schema.sql');
}, 30000);

beforeEach(async () => {
  for (const table of [
    'changes',
    'mutation_receipts',
    'asset_movements',
    'transactions',
    'rules',
    'tags',
    'payment_methods',
    'assets',
    'ledgers',
    'sessions',
    'users',
    'households',
  ]) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
  await sqlFile('seeds/demo.sql');
  const a = await call('/api/auth/demo', 'POST', { userId: 'u1' }, null);
  const b = await call('/api/auth/demo', 'POST', { userId: 'u2' }, null);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  cookie1 = a.headers.get('Set-Cookie')!.split(';')[0];
  cookie2 = b.headers.get('Set-Cookie')!.split(';')[0];
});

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close(1000);
});
afterAll(async () => {
  await runtime?.dispose();
});

describe('real Worker + D1 ledger API', () => {
  test('requires a current session and rejects hostile browser origins', async () => {
    expect((await call('/api/bootstrap', 'GET', undefined, null)).status).toBe(401);
    expect(
      (
        await call(
          '/api/transactions',
          'POST',
          { mutationId: 'unauth', transaction: expense() },
          null,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          '/api/transactions',
          'POST',
          { mutationId: 'origin', transaction: expense() },
          cookie1,
          'https://evil.example',
        )
      ).status,
    ).toBe(403);
    expect((await call('/api/auth/demo', 'POST', { userId: 'u3' }, null)).status).toBe(400);
    expect((await call('/api/auth/demo', 'POST', null, null)).status).toBe(400);
    const data = await snapshot();
    expect(data.user.id).toBe('u1');
    expect(data.mode).toBe('demo');
    expect(JSON.stringify(data)).not.toContain('token_hash');
    await call('/api/auth/logout', 'POST', {});
    expect((await call('/api/bootstrap')).status).toBe(401);
  });

  test('demo routes and demo sessions cannot be used on a public hostname', async () => {
    const response = await runtime.dispatchFetch('https://budget.example/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u1' }),
    });
    expect(response.status).toBe(404);
    const data = await runtime.dispatchFetch('https://budget.example/api/bootstrap', {
      headers: { Cookie: cookie1 },
    });
    expect(data.status).toBe(503);
    expect(await data.json()).toMatchObject({ code: 'AUTH_NOT_CONFIGURED' });
  });

  test('loopback alone does not enable demo login without an explicit true flag', async () => {
    const locked = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundledScript,
        compatibilityDate: '2026-09-16',
        bindings: { DEMO_MODE: 'false' },
      }),
    );
    try {
      const login = await locked.dispatchFetch('http://localhost/api/auth/demo', {
        method: 'POST',
        body: '{"userId":"u1"}',
      });
      expect(login.status).toBe(404);
      const data = await locked.dispatchFetch('http://localhost/api/bootstrap', {
        headers: { Cookie: cookie1 },
      });
      expect(data.status).toBe(503);
      expect(await data.json()).toMatchObject({ code: 'AUTH_NOT_CONFIGURED' });
    } finally {
      await locked.dispose();
    }
  });

  test('two users concurrently debit the same asset through different transactions without losing either change', async () => {
    const [a, b] = await Promise.all([
      create(expense({ amount: 30000, ledgerId: 'main' }), cookie1),
      create(expense({ amount: 20000, ledgerId: 'trip' }), cookie2),
    ]);
    expect(a.transaction!.id).not.toBe(b.transaction!.id);
    const data = await snapshot();
    expect(data.assets.find((asset) => asset.id === 'reserve')!.balance).toBe(450000);
    expect(data.revision).toBe(2);
    expect(
      data.transactions.filter((t) => [a.transaction!.id, b.transaction!.id].includes(t.id)),
    ).toHaveLength(2);
  });

  test('concurrent same-version edits produce one winner and one conflict without extra effects', async () => {
    const original = (await create()).transaction!;
    const responses = await Promise.all(
      [31000, 32000].map((amount) =>
        call(
          '/api/transactions',
          'POST',
          {
            mutationId: crypto.randomUUID(),
            expectedVersion: 1,
            transaction: expense({ id: original.id, amount }),
          },
          amount === 31000 ? cookie1 : cookie2,
        ),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as (MutationResult & {
      code?: string;
      current?: Transaction;
    })[];
    expect(bodies.find((r) => r.code === 'VERSION_CONFLICT')?.current?.version).toBe(2);
    const data = await snapshot();
    const winner = data.transactions.find((t) => t.id === original.id)!;
    expect(bodies.find((r) => r.code === 'VERSION_CONFLICT')?.current).toEqual(winner);
    expect(winner.version).toBe(2);
    expect(data.assets.find((a) => a.id === 'reserve')!.balance).toBe(500000 - winner.amount);
    expect(data.revision).toBe(2);
    expect(
      await db
        .prepare('SELECT COUNT(*) AS n FROM asset_movements WHERE transaction_id = ?')
        .bind(original.id)
        .first('n'),
    ).toBe(1);
  });

  test('simultaneous retries create one transaction and reject reusing an id for different contents', async () => {
    const body = { mutationId: 'same-operation', transaction: expense() };
    const responses = await Promise.all([
      call('/api/transactions', 'POST', body),
      call('/api/transactions', 'POST', body),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const results = (await Promise.all(responses.map((r) => r.json()))) as MutationResult[];
    expect(results[0].transaction!.id).toBe(results[1].transaction!.id);
    expect(results.some((result) => result.replayed)).toBe(true);
    const response = await call('/api/transactions', 'POST', {
      ...body,
      transaction: expense({ amount: 90000 }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'MUTATION_REUSED' });
    const data = await snapshot();
    expect(data.revision).toBe(1);
    expect(data.assets.find((a) => a.id === 'reserve')!.balance).toBe(470000);
  });

  test('editing and deleting replaces the original effect and a repeated delete is harmless', async () => {
    const original = (await create(expense({ amount: 20000 }))).transaction!;
    const updated = await call('/api/transactions', 'POST', {
      mutationId: 'edit-once',
      expectedVersion: 1,
      transaction: expense({ id: original.id, amount: 10000 }),
    });
    expect(updated.status).toBe(200);
    expect((await snapshot()).assets.find((a) => a.id === 'reserve')!.balance).toBe(490000);
    const body = { mutationId: 'delete-once', expectedVersion: 2 };
    expect((await call(`/api/transactions/${original.id}`, 'DELETE', body)).status).toBe(200);
    const repeated = await call(`/api/transactions/${original.id}`, 'DELETE', body);
    expect(await repeated.json()).toMatchObject({ replayed: true });
    const data = await snapshot();
    expect(data.transactions.some((t) => t.id === original.id)).toBe(false);
    expect(data.assets.find((a) => a.id === 'reserve')!.balance).toBe(500000);
    expect(data.revision).toBe(3);
    const stale = await call('/api/transactions', 'POST', {
      mutationId: 'edit-deleted',
      expectedVersion: 2,
      transaction: expense({ id: original.id, amount: 40000 }),
    });
    expect(stale.status).toBe(404);
    expect((await snapshot()).assets.find((a) => a.id === 'reserve')!.balance).toBe(500000);
  });

  test('a retry after a later edit returns its old receipt without overwriting the newer transaction', async () => {
    const request = { mutationId: 'lost-create-response', transaction: expense({ amount: 20000 }) };
    const first = await call('/api/transactions', 'POST', request);
    const original = ((await first.json()) as MutationResult).transaction!;
    const edit = await call(
      '/api/transactions',
      'POST',
      {
        mutationId: 'newer-edit',
        expectedVersion: 1,
        transaction: expense({ id: original.id, amount: 10000 }),
      },
      cookie2,
    );
    expect(edit.status).toBe(200);
    const retry = await call('/api/transactions', 'POST', request);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({
      replayed: true,
      transaction: { id: original.id, version: 1, amount: 20000 },
    });
    const latest = await snapshot();
    expect(latest.transactions.find((t) => t.id === original.id)).toMatchObject({
      version: 2,
      amount: 10000,
    });
    expect(latest.assets.find((a) => a.id === 'reserve')!.balance).toBe(490000);
    expect(latest.revision).toBe(2);
  });

  test('a failure while creating an asset movement rolls back the transaction, revision and receipt', async () => {
    await db
      .prepare(
        "CREATE TRIGGER injected_failure BEFORE INSERT ON asset_movements BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
      )
      .run();
    try {
      const before = await snapshot();
      const response = await call('/api/transactions', 'POST', {
        mutationId: 'failed-operation',
        transaction: expense(),
      });
      expect(response.status).toBe(500);
      const after = await snapshot();
      expect(after.transactions).toEqual(before.transactions);
      expect(after.assets).toEqual(before.assets);
      expect(after.revision).toBe(before.revision);
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM mutation_receipts WHERE mutation_id = 'failed-operation'",
          )
          .first('n'),
      ).toBe(0);
    } finally {
      await db.prepare('DROP TRIGGER injected_failure').run();
    }
  });

  test('ordinary tags never infer asset effects and incompatible rules are rejected', async () => {
    const withoutRule = await call('/api/transactions', 'POST', {
      mutationId: 'ordinary',
      transaction: expense({ tagIds: ['daily'] }),
    });
    expect(withoutRule.status).toBe(400);
    const conflicts = await call('/api/transactions', 'POST', {
      mutationId: 'conflict-rule',
      transaction: expense({ tagIds: ['asset-use', 'move'] }),
    });
    expect(conflicts.status).toBe(400);
    const data = await create(expense({ tagIds: ['daily'], assetId: null }));
    expect(data.transaction!.assetId).toBeNull();
    expect((await snapshot()).assets.find((a) => a.id === 'reserve')!.balance).toBe(500000);
  });

  test('explicit saving and transfer move money between two different assets and preserve their total', async () => {
    await create(
      expense({
        type: 'saving',
        category: '저축',
        tagIds: ['save'],
        assetId: 'checking',
        toAssetId: 'reserve',
        amount: 100000,
      }),
    );
    await create(
      expense({
        type: 'transfer',
        category: '이체',
        tagIds: ['move'],
        assetId: 'reserve',
        toAssetId: 'investment',
        amount: 20000,
      }),
    );
    const data = await snapshot();
    expect(data.assets.find((a) => a.id === 'checking')!.balance).toBe(2700000);
    expect(data.assets.find((a) => a.id === 'reserve')!.balance).toBe(580000);
    expect(data.assets.find((a) => a.id === 'investment')!.balance).toBe(4520000);
    const bad = await call('/api/transactions', 'POST', {
      mutationId: 'bad-transfer',
      transaction: expense({ type: 'transfer', tagIds: ['move'], toAssetId: 'reserve' }),
    });
    expect(bad.status).toBe(400);
  });

  test('unlinking, relinking and changing a purpose budget never recreate transactions or money effects', async () => {
    const created = (await create(expense({ ledgerId: 'trip' }))).transaction!;
    const before = await snapshot();
    const unlinked = await call('/api/ledgers/trip', 'PATCH', {
      mutationId: 'unlink',
      expectedVersion: 1,
      parentId: null,
    });
    expect(unlinked.status).toBe(200);
    const independent = await snapshot();
    expect(independent.ledgers.find((l) => l.id === 'trip')!.parentId).toBeNull();
    expect(independent.transactions.some((t) => t.id === created.id)).toBe(true);
    const relinked = await call('/api/ledgers/trip', 'PATCH', {
      mutationId: 'relink',
      expectedVersion: 2,
      parentId: 'main',
      budget: 9900000,
    });
    expect(relinked.status).toBe(200);
    const after = await snapshot();
    expect(after.transactions).toEqual(before.transactions);
    expect(after.assets).toEqual(before.assets);
    expect(after.ledgers.find((l) => l.id === 'main')!.budget).toBe(2400000);
    expect(after.ledgers.find((l) => l.id === 'trip')!.budget).toBe(9900000);
  });

  test('source ownership cannot be silently moved and invalid foreign references are rejected', async () => {
    await db.prepare("INSERT INTO households (id, name) VALUES ('other-home', '타 가구')").run();
    await db
      .prepare(
        "INSERT INTO ledgers (id, household_id, name, icon, kind) VALUES ('other-ledger', 'other-home', '타 가구 장부', '📒', 'main')",
      )
      .run();
    expect((await snapshot()).ledgers.some((ledger) => ledger.id === 'other-ledger')).toBe(false);
    const created = (await create()).transaction!;
    const moved = await call('/api/transactions', 'POST', {
      mutationId: 'move-owner',
      expectedVersion: 1,
      transaction: expense({ id: created.id, ledgerId: 'trip' }),
    });
    expect(moved.status).toBe(400);
    const unknown = await call('/api/transactions', 'POST', {
      mutationId: 'other-ledger',
      transaction: expense({ ledgerId: 'other-ledger' }),
    });
    expect(unknown.status).toBe(400);
    expect(
      (
        await call('/api/ledgers/other-ledger', 'PATCH', {
          mutationId: 'other-patch',
          expectedVersion: 1,
          budget: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call('/api/transactions/not-my-record', 'DELETE', {
          mutationId: 'other-delete',
          expectedVersion: 1,
        })
      ).status,
    ).toBe(404);
  });

  test('the local seed is repeatable without resetting an edited balance or revision', async () => {
    await create();
    const before = await snapshot();
    await sqlFile('seeds/demo.sql');
    expect(await snapshot()).toEqual(before);
  });

  test('WebSocket presence is ledger-scoped while commits notify all household screens', async () => {
    const a = await connect(cookie1, 'main');
    const b = await connect(cookie2, 'trip');
    b.socket.send(
      JSON.stringify({
        type: 'presence',
        ledgerId: 'trip',
        transactionId: 'demo-flight',
        field: 'amount',
      }),
    );
    await vi.waitFor(() => expect(a.events.some((event) => event.type === 'presence')).toBe(true));
    const mainPresence = a.events.filter((event) => event.type === 'presence').at(-1)!;
    expect(mainPresence.peers).toEqual([]);
    b.socket.send(
      JSON.stringify({
        type: 'presence',
        ledgerId: 'main',
        transactionId: 'demo-market',
        field: 'amount',
      }),
    );
    await vi.waitFor(() =>
      expect(
        a.events.some(
          (event) =>
            event.type === 'presence' &&
            (event.peers as { userId: string; field: string }[]).some(
              (peer) => peer.userId === 'u2' && peer.field === 'amount',
            ),
        ),
      ).toBe(true),
    );
    b.socket.send(
      JSON.stringify({
        type: 'presence',
        ledgerId: 'main',
        transactionId: 'demo-flight',
        field: 'amount',
      }),
    );
    await vi.waitFor(() => expect(b.events.some((event) => event.type === 'error')).toBe(true));
    const validPresence = a.events.filter((event) => event.type === 'presence').at(-1)!;
    expect((validPresence.peers as { transactionId: string }[])[0].transactionId).toBe(
      'demo-market',
    );
    b.socket.send(
      JSON.stringify({ type: 'presence', ledgerId: 'trip', transactionId: null, field: null }),
    );
    await vi.waitFor(() =>
      expect(a.events.filter((event) => event.type === 'presence').at(-1)?.peers).toEqual([]),
    );
    const result = await create(expense({ ledgerId: 'trip' }));
    await vi.waitFor(() => {
      expect(
        a.events.some((event) => event.type === 'revision' && event.revision === result.revision),
      ).toBe(true);
      expect(
        b.events.some((event) => event.type === 'revision' && event.revision === result.revision),
      ).toBe(true);
    });
    expect(await (await call('/api/revision')).json()).toEqual({ revision: result.revision });
    let closed = false;
    b.socket.addEventListener('close', () => {
      closed = true;
    });
    expect((await call('/api/auth/logout', 'POST', {}, cookie2)).status).toBe(200);
    await vi.waitFor(() => expect(closed).toBe(true));
  });

  test('WebSocket upgrades require a valid session, allowed origin and owned ledger', async () => {
    const unauthorized = await runtime.dispatchFetch('http://localhost/api/ws?ledgerId=main', {
      headers: { Upgrade: 'websocket', Origin: 'http://localhost' },
    });
    expect(unauthorized.status).toBe(401);
    const crossOrigin = await runtime.dispatchFetch('http://localhost/api/ws?ledgerId=main', {
      headers: { Upgrade: 'websocket', Cookie: cookie1, Origin: 'https://evil.example' },
    });
    expect(crossOrigin.status).toBe(403);
    const wrongLedger = await runtime.dispatchFetch('http://localhost/api/ws?ledgerId=missing', {
      headers: { Upgrade: 'websocket', Cookie: cookie1, Origin: 'http://localhost' },
    });
    expect(wrongLedger.status).toBe(404);
  });

  test('a silently expired session receives a sign-in notice instead of later financial revisions', async () => {
    const a = await connect(cookie1, 'main');
    const b = await connect(cookie2, 'trip');
    await db.prepare("UPDATE sessions SET expires_at = 0 WHERE user_id = 'u2'").run();
    expect((await call('/api/bootstrap', 'GET', undefined, cookie2)).status).toBe(401);
    const result = await create();
    await vi.waitFor(() => {
      expect(
        b.events.some(
          (event) => event.type === 'error' && String(event.message).includes('로그인 세션'),
        ),
      ).toBe(true);
      expect(
        a.events.some((event) => event.type === 'revision' && event.revision === result.revision),
      ).toBe(true);
    });
    expect(
      b.events.some((event) => event.type === 'revision' && event.revision === result.revision),
    ).toBe(false);
  });
});
