import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
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

async function sqlFile(path: string, target = db) {
  const sql = await readFile(path, 'utf8');
  for (const statement of sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)) {
    await target.prepare(statement).run();
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
    ownerId: 'shared',
    paymentMethodId: 'card-j',
    tagIds: ['asset-use'],
    allocations: [{ assetId: 'reserve', amount: overrides.amount ?? 30000 }],
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
  for (const name of (await readdir('migrations')).filter((n) => n.endsWith('.sql')).sort())
    await sqlFile(`migrations/${name}`);
}, 30000);

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
        .prepare('SELECT COUNT(*) AS n FROM asset_effects WHERE transaction_id = ?')
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
        "CREATE TRIGGER injected_failure BEFORE INSERT ON asset_effects BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
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

  test('labels never infer money effects and only explicit complete allocations affect assets', async () => {
    const data = await create(expense({ tagIds: ['asset-use', 'move', 'save'], allocations: [] }));
    expect(data.transaction!.allocations).toEqual([]);
    expect((await snapshot()).assets.find((a) => a.id === 'reserve')!.balance).toBe(500000);
    const split = await create(
      expense({
        amount: 300,
        allocations: [
          { assetId: 'reserve', amount: 250 },
          { assetId: 'checking', amount: 50 },
        ],
      }),
    );
    expect(split.transaction!.allocations).toHaveLength(2);
    const after = await snapshot();
    expect(after.assets.find((a) => a.id === 'reserve')!.balance).toBe(499750);
    expect(after.assets.find((a) => a.id === 'checking')!.balance).toBe(2799950);
    for (const allocations of [
      [{ assetId: 'reserve', amount: 299 }],
      [
        { assetId: 'reserve', amount: 150 },
        { assetId: 'reserve', amount: 150 },
      ],
      [{ assetId: 'loan', amount: 300 }],
    ]) {
      expect(
        (
          await call('/api/transactions', 'POST', {
            mutationId: crypto.randomUUID(),
            transaction: expense({ amount: 300, allocations }),
          })
        ).status,
      ).toBe(400);
    }
    expect((await snapshot()).assets).toEqual(after.assets);
  });

  test('transfers preserve total assets, stay out of the ledger and void exactly once', async () => {
    const before = await snapshot();
    const body = {
      mutationId: 'transfer-once',
      type: 'transfer',
      date: '2026-09-16',
      description: '예비금 이동',
      fromAssetId: 'checking',
      toAssetId: 'reserve',
      amount: 100000,
      expectedAssetVersions: { checking: 1, reserve: 1 },
    };
    const response = await call('/api/asset-operations', 'POST', body);
    expect(response.status).toBe(200);
    const result = (await response.json()) as MutationResult;
    expect(await (await call('/api/asset-operations', 'POST', body)).json()).toMatchObject({
      replayed: true,
      assetOperation: { id: result.assetOperation!.id },
    });
    const after = await snapshot();
    expect(after.transactions).toEqual(before.transactions);
    expect(after.assets.find((a) => a.id === 'checking')!.balance).toBe(2700000);
    expect(after.assets.find((a) => a.id === 'reserve')!.balance).toBe(600000);
    expect(after.assets.reduce((n, a) => n + a.balance, 0)).toBe(
      before.assets.reduce((n, a) => n + a.balance, 0),
    );
    expect(after.assetMovements.reduce((n, m) => n + m.savingsAmount, 0)).toBe(0);
    const del = { mutationId: 'void-transfer', expectedVersion: 1 };
    expect(
      (await call(`/api/asset-operations/${result.assetOperation!.id}`, 'DELETE', del)).status,
    ).toBe(200);
    expect(
      await (
        await call(`/api/asset-operations/${result.assetOperation!.id}`, 'DELETE', del)
      ).json(),
    ).toMatchObject({ replayed: true });
    const final = await snapshot();
    expect(final.assetOperations[0].deletedAt).not.toBeNull();
    expect(final.assetMovements).toEqual([]);
    expect(final.assets.map((a) => a.balance)).toEqual(before.assets.map((a) => a.balance));
    expect(final.assets.find((a) => a.id === 'reserve')!.version).toBe(3);
    expect(
      (
        await call('/api/asset-operations', 'POST', {
          ...body,
          mutationId: 'bad-transfer',
          toAssetId: 'checking',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/api/asset-operations', 'POST', {
          ...body,
          mutationId: 'debt-transfer',
          toAssetId: 'loan',
          expectedAssetVersions: { checking: 3, loan: 1 },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/api/transactions', 'POST', {
          mutationId: 'legacy-type',
          transaction: { ...expense(), type: 'saving' },
        })
      ).status,
    ).toBe(400);
  });

  test('unlinking, relinking and changing a purpose budget never recreate transactions or money effects', async () => {
    const created = (await create(expense({ ledgerId: 'trip' }))).transaction!;
    const before = await snapshot();
    const unlinked = await call('/api/ledgers/trip', 'PATCH', {
      mutationId: 'unlink',
      expectedVersion: 1,
      expectedHierarchyVersion: before.hierarchyVersion,
      parentId: null,
    });
    expect(unlinked.status).toBe(200);
    const independent = await snapshot();
    expect(independent.ledgers.find((l) => l.id === 'trip')!.parentId).toBeNull();
    expect(independent.transactions.some((t) => t.id === created.id)).toBe(true);
    const relinked = await call('/api/ledgers/trip', 'PATCH', {
      mutationId: 'relink',
      expectedVersion: 2,
      expectedHierarchyVersion: independent.hierarchyVersion,
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
    for (const ledgerId of ['main', '__all__']) {
      const unauthorized = await runtime.dispatchFetch(
        `http://localhost/api/ws?ledgerId=${ledgerId}`,
        {
          headers: { Upgrade: 'websocket', Origin: 'http://localhost' },
        },
      );
      expect(unauthorized.status).toBe(401);
      const crossOrigin = await runtime.dispatchFetch(
        `http://localhost/api/ws?ledgerId=${ledgerId}`,
        {
          headers: { Upgrade: 'websocket', Cookie: cookie1, Origin: 'https://evil.example' },
        },
      );
      expect(crossOrigin.status).toBe(403);
    }
    const wrongLedger = await runtime.dispatchFetch('http://localhost/api/ws?ledgerId=missing', {
      headers: { Upgrade: 'websocket', Cookie: cookie1, Origin: 'http://localhost' },
    });
    expect(wrongLedger.status).toBe(404);
  });

  test('the virtual overall view joins presence and receives household revisions without claiming original edit cursors', async () => {
    expect((await snapshot()).ledgers.some((ledger) => ledger.id === '__all__')).toBe(false);
    const a = await connect(cookie1, '__all__');
    const b = await connect(cookie2, '__all__');
    await vi.waitFor(() => {
      const peers = a.events.filter((event) => event.type === 'presence').at(-1)?.peers;
      expect(peers).toEqual([
        expect.objectContaining({ userId: 'u2', ledgerId: '__all__', transactionId: null }),
      ]);
    });
    b.socket.send(
      JSON.stringify({
        type: 'presence',
        ledgerId: '__all__',
        transactionId: 'demo-flight',
        field: 'amount',
      }),
    );
    await vi.waitFor(() => expect(b.events.some((event) => event.type === 'error')).toBe(true));
    const peers = a.events.filter((event) => event.type === 'presence').at(-1)?.peers;
    expect(peers).toEqual([
      expect.objectContaining({ userId: 'u2', ledgerId: '__all__', transactionId: null }),
    ]);
    const saved = await create(expense({ ledgerId: 'trip' }));
    await vi.waitFor(() => {
      for (const connection of [a, b])
        expect(
          connection.events.some(
            (event) => event.type === 'revision' && event.revision === saved.revision,
          ),
        ).toBe(true);
    });
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

  async function mutate(
    path: string,
    body: Record<string, unknown>,
    method = 'POST',
  ): Promise<MutationResult> {
    const response = await call(path, method, { mutationId: crypto.randomUUID(), ...body });
    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    return data as MutationResult;
  }
  async function group(overrides: Record<string, unknown> = {}) {
    return (
      await mutate('/api/tag-groups', {
        name: '사용자 유형',
        selectionMode: 'multiple',
        appliesTo: 'transaction',
        ledgerIds: null,
        ...overrides,
      })
    ).tagGroup!;
  }
  async function option(groupId: string, name: string) {
    return (await mutate('/api/tags', { groupId, name, color: '#123456' })).tag!;
  }

  test('custom groups and options are editable, same-group names are unique, and labels do not change money', async () => {
    const before = await snapshot();
    const g = await group({ sortOrder: -2 });
    const a = await option(g.id, '개인 활동');
    const b = await option(g.id, '공동 활동');
    const item = (await create(expense({ allocations: [], tagIds: [a.id, b.id] }))).transaction!;
    const renamed = await mutate(
      `/api/tags/${a.id}`,
      { expectedVersion: 1, name: '자유 활동', color: '#abcdef', sortOrder: -3 },
      'PATCH',
    );
    expect(renamed.tag).toMatchObject({ id: a.id, name: '자유 활동', version: 2, sortOrder: -3 });
    const duplicate = await call('/api/tags', 'POST', {
      mutationId: 'duplicate-tag',
      groupId: g.id,
      name: '자유 활동',
      color: '#123456',
    });
    expect(duplicate.status).toBe(409);
    const dupRename = await call(`/api/tags/${b.id}`, 'PATCH', {
      mutationId: 'dup-rename',
      expectedVersion: 1,
      name: '자유 활동',
    });
    expect(dupRename.status).toBe(409);
    const renamedGroup = await mutate(
      `/api/tag-groups/${g.id}`,
      { expectedVersion: 1, name: '새 유형', sortOrder: -9 },
      'PATCH',
    );
    expect(renamedGroup.tagGroup).toMatchObject({ name: '새 유형', sortOrder: -9 });
    const after = await snapshot();
    expect(after.assets).toEqual(before.assets);
    expect(after.transactions.find((t) => t.id === item.id)!.tagIds).toEqual([a.id, b.id]);
    expect(after.assetMovements).toEqual([]);
  });

  test('group cardinality is enforced and conversion cannot invalidate existing selections', async () => {
    const g = await group(),
      a = await option(g.id, '첫째'),
      b = await option(g.id, '둘째');
    const item = (await create(expense({ tagIds: [a.id, b.id], allocations: [] }))).transaction!;
    expect(
      (
        await call(`/api/tag-groups/${g.id}`, 'PATCH', {
          mutationId: 'unsafe-single',
          expectedVersion: 1,
          selectionMode: 'single',
        })
      ).status,
    ).toBe(400);
    expect((await snapshot()).tagGroups.find((x) => x.id === g.id)!.selectionMode).toBe('multiple');
    await mutate('/api/transactions', {
      expectedVersion: 1,
      transaction: expense({ id: item.id, tagIds: [a.id], allocations: [] }),
    });
    await mutate(
      `/api/tag-groups/${g.id}`,
      { expectedVersion: 1, selectionMode: 'single' },
      'PATCH',
    );
    expect(
      (
        await call('/api/transactions', 'POST', {
          mutationId: 'too-many',
          transaction: expense({ tagIds: [a.id, b.id], allocations: [] }),
        })
      ).status,
    ).toBe(400);
    // The original category role is reserved but its name/selection behavior are editable.
    const category = (await snapshot()).tagGroups.find((x) => x.role === 'category')!;
    const renamed = await mutate(
      `/api/tag-groups/${category.id}`,
      { expectedVersion: category.version, name: '내 분류', selectionMode: 'multiple' },
      'PATCH',
    );
    expect(renamed.tagGroup).toMatchObject({
      name: '내 분류',
      role: 'category',
      selectionMode: 'multiple',
    });
  });

  test('deleted and migrated legacy records preserve tags without permanently blocking single selection', async () => {
    const g = await group(),
      a = await option(g.id, '과거 첫째'),
      b = await option(g.id, '과거 둘째');
    const item = (await create(expense({ tagIds: [a.id, b.id], allocations: [] }))).transaction!;
    await mutate(`/api/transactions/${item.id}`, { expectedVersion: 1 }, 'DELETE');
    await db
      .prepare(
        "INSERT INTO transactions(id,household_id,ledger_id,date,description,amount,type,category,owner_id,payment_method_id,tag_ids,updated_at,updated_by) SELECT 'legacy-hidden',household_id,ledger_id,date,description,amount,'saving',category,owner_id,payment_method_id,tag_ids,updated_at,updated_by FROM transactions WHERE id=?",
      )
      .bind(item.id)
      .run();
    const updated = await mutate(
      `/api/tag-groups/${g.id}`,
      { expectedVersion: 1, selectionMode: 'single' },
      'PATCH',
    );
    expect(updated.tagGroup!.selectionMode).toBe('single');
    const deletedTags = await db
      .prepare('SELECT tag_ids FROM transactions WHERE id=?')
      .bind(item.id)
      .first<string>('tag_ids');
    const legacyTags = await db
      .prepare("SELECT tag_ids FROM transactions WHERE id='legacy-hidden'")
      .first<string>('tag_ids');
    expect(JSON.parse(deletedTags!)).toEqual([a.id, b.id]);
    expect(JSON.parse(legacyTags!)).toEqual([a.id, b.id]);
  });

  test('maximum tag, allocation and scope lists fit D1 parameter limits through JSON guards', async () => {
    const g = await group();
    const tags = Array.from({ length: 100 }, (_, i) => `many-tag-${i}`);
    const assets = Array.from({ length: 30 }, (_, i) => `many-asset-${i}`);
    await db.batch(
      tags.map((id, i) =>
        db
          .prepare(
            "INSERT INTO tags(id,household_id,group_id,name,color) VALUES(?,'home',?,?,'#123456')",
          )
          .bind(id, g.id, `태그 ${i}`),
      ),
    );
    await db.batch(
      assets.map((id, i) =>
        db
          .prepare(
            "INSERT INTO assets(id,household_id,name,kind,opening_balance,color,track_savings) VALUES(?,'home',?,'asset',1000,'#123456',?)",
          )
          .bind(id, id, i % 2),
      ),
    );
    const tx = (
      await create(
        expense({
          amount: 300,
          tagIds: tags,
          allocations: assets.map((assetId) => ({ assetId, amount: 10 })),
        }),
      )
    ).transaction!;
    expect(tx.tagIds).toHaveLength(100);
    expect(tx.allocations).toHaveLength(30);
    const snap = await snapshot();
    expect(snap.assetMovements.filter((m) => m.transactionId === tx.id)).toHaveLength(30);
    expect(
      snap.assets
        .filter((a) => assets.includes(a.id))
        .every((a) => a.balance === 990 && a.version === 2),
    ).toBe(true);
    const ledgers = Array.from({ length: 100 }, (_, i) => `many-ledger-${i}`);
    await db.batch(
      ledgers.map((id) =>
        db
          .prepare(
            "INSERT INTO ledgers(id,household_id,name,icon,kind) VALUES(?,'home',?,'📒','purpose')",
          )
          .bind(id, id),
      ),
    );
    expect((await group({ ledgerIds: ledgers })).ledgerIds).toHaveLength(100);
  });

  test('archived tags and changed scopes preserve existing history but cannot be newly attached', async () => {
    const g = await group({ ledgerIds: ['main'] }),
      a = await option(g.id, '유지할 태그');
    const original = (await create(expense({ tagIds: [a.id], allocations: [] }))).transaction!;
    expect(
      (
        await call('/api/transactions', 'POST', {
          mutationId: 'scope-first',
          transaction: expense({ ledgerId: 'trip', tagIds: [a.id], allocations: [] }),
        })
      ).status,
    ).toBe(400);
    await mutate(`/api/tag-groups/${g.id}`, { expectedVersion: 1, ledgerIds: ['trip'] }, 'PATCH');
    await mutate(`/api/tags/${a.id}`, { expectedVersion: 1, archived: true }, 'PATCH');
    const retained = await mutate('/api/transactions', {
      expectedVersion: 1,
      transaction: expense({
        id: original.id,
        tagIds: [a.id],
        description: '보관된 선택 유지',
        allocations: [],
      }),
    });
    expect(retained.transaction!.tagIds).toEqual([a.id]);
    expect(
      (
        await call('/api/transactions', 'POST', {
          mutationId: 'archived-new',
          transaction: expense({ ledgerId: 'trip', tagIds: [a.id], allocations: [] }),
        })
      ).status,
    ).toBe(400);
    await mutate(`/api/tags/${a.id}`, { expectedVersion: 2, archived: false }, 'PATCH');
    expect(
      (
        await call('/api/transactions', 'POST', {
          mutationId: 'out-of-scope-new',
          transaction: expense({ tagIds: [a.id], allocations: [] }),
        })
      ).status,
    ).toBe(400);
    await create(expense({ ledgerId: 'trip', tagIds: [a.id], allocations: [] }));
    await mutate(`/api/tag-groups/${g.id}`, { expectedVersion: 2, archived: true }, 'PATCH');
    expect(
      (
        await call('/api/tags', 'POST', {
          mutationId: 'archived-group',
          groupId: g.id,
          name: '새 옵션',
          color: '#123456',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/api/transactions', 'POST', {
          mutationId: 'archived-group-new',
          transaction: expense({ ledgerId: 'trip', tagIds: [a.id], allocations: [] }),
        })
      ).status,
    ).toBe(400);
    const after = await snapshot();
    expect(after.tags.find((x) => x.id === a.id)).toBeDefined();
    expect(after.transactions.find((x) => x.id === original.id)!.tagIds).toEqual([a.id]);
  });

  test('asset tag applicability, memberships, and liability savings restrictions are enforced', async () => {
    const g = await group({ appliesTo: 'asset' }),
      a = await option(g.id, '목돈');
    const created = (
      await mutate('/api/assets', {
        name: '새 저축통장',
        kind: 'asset',
        openingBalance: 1000,
        openingDate: '2026-01-01',
        color: '#987654',
        tagIds: [a.id],
        trackSavings: true,
      })
    ).asset!;
    expect(created).toMatchObject({
      balance: 1000,
      trackSavings: true,
      tagIds: [a.id],
      version: 1,
    });
    expect((await snapshot()).assetMovements).toEqual([]);
    expect(
      (
        await call('/api/transactions', 'POST', {
          mutationId: 'asset-tag-on-tx',
          transaction: expense({ tagIds: [a.id] }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(`/api/assets/${created.id}`, 'PATCH', {
          mutationId: 'tx-tag-on-asset',
          expectedVersion: 1,
          tagIds: ['daily'],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/api/assets', 'POST', {
          mutationId: 'bad-savings-debt',
          name: '부채',
          kind: 'liability',
          openingBalance: 1000,
          openingDate: '2026-01-01',
          color: '#123456',
          tagIds: [],
          trackSavings: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/api/tag-groups', 'POST', {
          mutationId: 'asset-scope',
          name: '자산 범위',
          selectionMode: 'single',
          appliesTo: 'asset',
          ledgerIds: ['main'],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/api/tag-groups', 'POST', {
          mutationId: 'foreign-scope',
          name: '범위',
          selectionMode: 'single',
          appliesTo: 'transaction',
          ledgerIds: ['missing'],
        })
      ).status,
    ).toBe(400);
    await mutate(`/api/tags/${a.id}`, { expectedVersion: 1, archived: true }, 'PATCH');
    const changed = await mutate(
      `/api/assets/${created.id}`,
      { expectedVersion: 1, name: '이름 수정', tagIds: [a.id] },
      'PATCH',
    );
    expect(changed.asset!.balance).toBe(1000);
    expect(changed.asset!.version).toBe(2);
  });

  test('savings snapshots use current configuration for new effects and retain the policy on same-asset edits', async () => {
    const untracked = (
      await create(
        expense({
          type: 'income',
          amount: 100,
          allocations: [{ assetId: 'reserve', amount: 100 }],
        }),
      )
    ).transaction!;
    await mutate('/api/assets/reserve', { expectedVersion: 2, trackSavings: true }, 'PATCH');
    // Editing an existing allocation retains its old untracked policy.
    await mutate('/api/transactions', {
      expectedVersion: 1,
      transaction: expense({
        id: untracked.id,
        type: 'income',
        amount: 200,
        allocations: [{ assetId: 'reserve', amount: 200 }],
      }),
    });
    const tracked = (
      await create(
        expense({
          type: 'income',
          amount: 300,
          allocations: [{ assetId: 'reserve', amount: 300 }],
        }),
      )
    ).transaction!;
    await create(expense({ amount: 50, allocations: [{ assetId: 'reserve', amount: 50 }] }));
    let snap = await snapshot();
    expect(snap.assetMovements.reduce((n, m) => n + m.savingsAmount, 0)).toBe(250);
    let reserve = snap.assets.find((a) => a.id === 'reserve')!;
    await mutate(
      '/api/assets/reserve',
      { expectedVersion: reserve.version, trackSavings: false },
      'PATCH',
    );
    await mutate('/api/transactions', {
      expectedVersion: 1,
      transaction: expense({
        id: tracked.id,
        type: 'income',
        amount: 400,
        allocations: [{ assetId: 'reserve', amount: 400 }],
      }),
    });
    snap = await snapshot();
    expect(snap.assetMovements.reduce((n, m) => n + m.savingsAmount, 0)).toBe(350);
    await mutate(`/api/transactions/${tracked.id}`, { expectedVersion: 2 }, 'DELETE');
    expect((await snapshot()).assetMovements.reduce((n, m) => n + m.savingsAmount, 0)).toBe(-50);
  });

  test('normal-to-tracked and tracked-to-normal transfers have signed savings while tracked-to-tracked nets zero', async () => {
    await mutate('/api/assets/reserve', { expectedVersion: 1, trackSavings: true }, 'PATCH');
    await mutate('/api/assets/investment', { expectedVersion: 1, trackSavings: true }, 'PATCH');
    async function transfer(fromAssetId: string, toAssetId: string, amount: number) {
      const snap = await snapshot();
      const expectedAssetVersions = Object.fromEntries(snap.assets.map((a) => [a.id, a.version]));
      await mutate('/api/asset-operations', {
        type: 'transfer',
        date: '2026-09-16',
        description: '저축 집계 테스트',
        fromAssetId,
        toAssetId,
        amount,
        expectedAssetVersions,
      });
    }
    await transfer('checking', 'reserve', 100);
    expect((await snapshot()).assetMovements.reduce((n, m) => n + m.savingsAmount, 0)).toBe(100);
    await transfer('reserve', 'investment', 50);
    expect((await snapshot()).assetMovements.reduce((n, m) => n + m.savingsAmount, 0)).toBe(100);
    const between = (await snapshot()).assetOperations.find(
      (o) => o.fromAssetId === 'reserve' && o.toAssetId === 'investment',
    )!;
    expect(
      (await snapshot()).assetMovements
        .filter((m) => m.operationId === between.id)
        .map((m) => m.savingsAmount),
    ).toEqual([0, 0]);
    await transfer('investment', 'checking', 20);
    expect((await snapshot()).assetMovements.reduce((n, m) => n + m.savingsAmount, 0)).toBe(80);
    const snap = await snapshot(),
      reserve = snap.assets.find((a) => a.id === 'reserve')!;
    const op = await mutate('/api/asset-operations', {
      type: 'adjustment',
      date: '2026-09-16',
      description: '잔액 정정',
      assetId: 'reserve',
      targetBalance: 900000,
      expectedAssetVersions: { reserve: reserve.version },
    });
    expect(op.assetOperation!.amount).toBe(900000 - reserve.balance);
    expect((await snapshot()).assetMovements.reduce((n, m) => n + m.savingsAmount, 0)).toBe(80);
  });

  test('two stale balance adjustments cannot both commit and an intervening transaction invalidates a balance edit', async () => {
    const body = {
      type: 'adjustment',
      date: '2026-09-16',
      description: '잔액 확인',
      assetId: 'reserve',
      targetBalance: 600000,
      expectedAssetVersions: { reserve: 1 },
    };
    const responses = await Promise.all([
      call('/api/asset-operations', 'POST', { ...body, mutationId: 'adjust-a' }),
      call(
        '/api/asset-operations',
        'POST',
        { ...body, mutationId: 'adjust-b', targetBalance: 700000 },
        cookie2,
      ),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as (MutationResult & {
      code?: string;
      current?: { assets: { version: number }[] };
    })[];
    expect(bodies.find((b) => b.code === 'VERSION_CONFLICT')!.current!.assets[0].version).toBe(2);
    const after = await snapshot();
    expect(after.assetOperations).toHaveLength(1);
    expect(after.assetMovements).toHaveLength(1);
    expect(after.revision).toBe(1);
    await create(expense({ amount: 100 }));
    const stale = await call('/api/asset-operations', 'POST', {
      ...body,
      mutationId: 'after-tx',
      expectedAssetVersions: { reserve: 2 },
    });
    expect(stale.status).toBe(409);
    expect((await snapshot()).assetOperations).toHaveLength(1);
    const debt = await mutate('/api/asset-operations', {
      type: 'adjustment',
      date: '2026-09-16',
      description: '대출 잔액',
      assetId: 'loan',
      targetBalance: 49000000,
      expectedAssetVersions: { loan: 1 },
    });
    expect(debt.assetOperation).toMatchObject({ amount: -1000000, targetBalance: 49000000 });
  });

  test('operation rollback preserves both balances, versions, audit revision and retry identity', async () => {
    await db
      .prepare(
        "CREATE TRIGGER operation_failure BEFORE INSERT ON asset_effects WHEN NEW.asset_id='reserve' BEGIN SELECT RAISE(ABORT,'injected failure'); END",
      )
      .run();
    const body = {
      mutationId: 'retry-operation',
      type: 'transfer',
      date: '2026-09-16',
      description: '원자성',
      fromAssetId: 'checking',
      toAssetId: 'reserve',
      amount: 100,
      expectedAssetVersions: { checking: 1, reserve: 1 },
    };
    const before = await snapshot();
    try {
      expect((await call('/api/asset-operations', 'POST', body)).status).toBe(500);
      const after = await snapshot();
      expect(after.assets).toEqual(before.assets);
      expect(after.assetOperations).toEqual([]);
      expect(after.assetMovements).toEqual([]);
      expect(after.revision).toBe(before.revision);
      expect(
        await db
          .prepare("SELECT COUNT(*) n FROM mutation_receipts WHERE mutation_id='retry-operation'")
          .first('n'),
      ).toBe(0);
    } finally {
      await db.prepare('DROP TRIGGER operation_failure').run();
    }
    expect((await call('/api/asset-operations', 'POST', body)).status).toBe(200);
    expect(await (await call('/api/asset-operations', 'POST', body)).json()).toMatchObject({
      replayed: true,
    });
    expect((await snapshot()).assetOperations).toHaveLength(1);
  });

  test('v1 migration preserves IDs, category history and balances while moving saving/transfer records out of the ledger', async () => {
    const legacy = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundledScript,
        compatibilityDate: '2026-09-16',
        d1Databases: ['DB'],
        bindings: { DEMO_MODE: 'true' },
      }),
    );
    try {
      const old = await legacy.getD1Database('DB');
      await sqlFile('migrations/0001_schema.sql', old);
      await sqlFile('tests/server/fixtures/v1-demo.sql', old);
      for (const [id, type, amount, from, to, rule] of [
        ['old-expense', 'expense', 300, 'reserve', null, 'rule-expense'],
        ['old-saving', 'saving', 1000, 'checking', 'reserve', 'rule-saving'],
        ['old-transfer', 'transfer', 200, 'reserve', 'investment', 'rule-transfer'],
      ] as const) {
        await old
          .prepare(
            "INSERT INTO transactions(id,household_id,ledger_id,date,description,amount,type,category,owner_id,payment_method_id,tag_ids,asset_id,to_asset_id,updated_at,updated_by) VALUES(?,'home','main','2026-08-01','이관 기록',?,?,'기존 분류','u2','account','[\"daily\"]',?,?,'2026-08-01T00:00:00Z','u2')",
          )
          .bind(id, amount, type, from, to)
          .run();
        await old
          .prepare(
            "INSERT INTO asset_movements(id,household_id,transaction_id,asset_id,amount,rule_id,rule_version) VALUES(?,'home',?,?,?,?,1)",
          )
          .bind(`${id}:0`, id, from, -amount, rule)
          .run();
        if (to)
          await old
            .prepare(
              "INSERT INTO asset_movements(id,household_id,transaction_id,asset_id,amount,rule_id,rule_version) VALUES(?,'home',?,?,?,?,1)",
            )
            .bind(`${id}:1`, id, to, amount, rule)
            .run();
      }
      const longCategory = '긴'.repeat(80);
      await old
        .prepare("UPDATE transactions SET category=? WHERE id='old-expense'")
        .bind(longCategory)
        .run();
      const balances = await old
        .prepare(
          'SELECT a.id,a.opening_balance+COALESCE(SUM(m.amount),0) AS balance FROM assets a LEFT JOIN asset_movements m ON m.asset_id=a.id GROUP BY a.id ORDER BY a.id',
        )
        .all();
      const oldIds = (await old.prepare('SELECT id FROM tags ORDER BY id').all()).results.map(
        (r) => r.id,
      );
      for (const name of (await readdir('migrations'))
        .filter((n) => n.endsWith('.sql') && n > '0001_schema.sql')
        .sort())
        await sqlFile(`migrations/${name}`, old);
      const login = await legacy.dispatchFetch('http://localhost/api/auth/demo', {
        method: 'POST',
        body: '{"userId":"u1"}',
      });
      expect(login.status).toBe(200);
      const response = await legacy.dispatchFetch('http://localhost/api/bootstrap', {
        headers: { Cookie: login.headers.get('Set-Cookie')!.split(';')[0] },
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as Bootstrap;
      expect(
        data.assets
          .map((a) => ({ id: a.id, balance: a.balance }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      ).toEqual(balances.results);
      expect(oldIds.every((id) => data.tags.some((t) => t.id === id))).toBe(true);
      expect(data.transactions.every((t) => t.type === 'income' || t.type === 'expense')).toBe(
        true,
      );
      expect(data.transactions.some((t) => t.id === 'old-saving' || t.id === 'old-transfer')).toBe(
        false,
      );
      expect(data.assetOperations).toHaveLength(2);
      expect(data.assetOperations.find((o) => o.id === 'legacy-old-saving')).toMatchObject({
        date: '2026-08-01',
        createdBy: 'u2',
        type: 'transfer',
      });
      const oldExpense = data.transactions.find((t) => t.id === 'old-expense')!;
      expect(oldExpense.allocations).toEqual([{ assetId: 'reserve', amount: 300 }]);
      expect(oldExpense.tagIds).toContain('daily');
      expect(
        data.tags.find((t) => t.id === oldExpense.tagIds.find((id) => id !== 'daily'))!.name,
      ).toBe(longCategory);
      const retained = await legacy.dispatchFetch('http://localhost/api/transactions', {
        method: 'POST',
        headers: { Cookie: login.headers.get('Set-Cookie')!.split(';')[0] },
        body: JSON.stringify({
          mutationId: 'edit-long-category',
          expectedVersion: 1,
          transaction: { ...oldExpense, description: '긴 분류 태그 유지' },
        }),
      });
      expect(retained.status).toBe(200);
      expect(data.assetMovements.reduce((n, m) => n + m.savingsAmount, 0)).toBe(1000);
      expect(await old.prepare('SELECT COUNT(*) n FROM asset_movements').first('n')).toBe(5);
      expect(
        await old
          .prepare("SELECT COUNT(*) n FROM transactions WHERE type IN ('saving','transfer')")
          .first('n'),
      ).toBe(2);
    } finally {
      await legacy.dispose();
    }
  }, 30000);
  test('ledger settings preserve independent periods, names, archive history and tag mapping', async () => {
    const before = await snapshot();
    const update = await mutate(
      '/api/ledgers/main',
      { expectedVersion: 1, name: '가족 기록', periodStartDay: 25, fixedExpenseTagIds: ['daily'] },
      'PATCH',
    );
    expect(update.ledger).toMatchObject({
      name: '가족 기록',
      periodStartDay: 25,
      fixedExpenseTagIds: ['daily'],
    });
    const child = await mutate(
      '/api/ledgers/trip',
      {
        expectedVersion: 1,
        name: '여행 기록',
        expectedHierarchyVersion: before.hierarchyVersion,
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        archived: true,
        tagMappings: { travel: 'daily' },
      },
      'PATCH',
    );
    expect(child.ledger).toMatchObject({
      archived: true,
      parentId: 'main',
      tagMappings: { travel: 'daily' },
    });
    const after = await snapshot();
    expect(after.transactions).toEqual(before.transactions);
    expect(after.assetMovements).toEqual(before.assetMovements);
    expect(
      (
        await call('/api/ledgers/main', 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 2,
          archived: true,
          expectedHierarchyVersion: after.hierarchyVersion,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call('/api/ledgers/main', 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 2,
          periodStartDay: 32,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/api/ledgers/main', 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 1,
          name: '이전 버전',
        })
      ).status,
    ).toBe(409);
  });
  test('dependent options require their parent, reject cycles and protect existing classifications', async () => {
    const parentGroup = await group({ name: '상위 분류', selectionMode: 'single' });
    const childGroup = await group({ name: '하위 분류', selectionMode: 'single' });
    const parent = await option(parentGroup.id, '식비');
    const child = (
      await mutate('/api/tags', {
        groupId: childGroup.id,
        name: '장보기',
        color: '#123456',
        parentId: parent.id,
      })
    ).tag!;
    expect(child.parentId).toBe(parent.id);
    expect(
      (
        await call('/api/transactions', 'POST', {
          mutationId: crypto.randomUUID(),
          transaction: expense({ tagIds: [child.id] }),
        })
      ).status,
    ).toBe(400);
    const saved = await create(expense({ tagIds: [parent.id, child.id] }));
    expect(saved.transaction!.tagIds).toEqual([parent.id, child.id]);
    expect(
      (
        await call(`/api/tags/${parent.id}`, 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 1,
          parentId: child.id,
        })
      ).status,
    ).toBe(400);
    const other = await option(parentGroup.id, '교통');
    const sameLabel = await mutate('/api/tags', {
      groupId: childGroup.id,
      name: '장보기',
      color: '#123456',
      parentId: other.id,
    });
    expect(sameLabel.tag!.id).not.toBe(child.id);
    expect(sameLabel.tag!.parentId).toBe(other.id);
    expect(
      (
        await call(`/api/tags/${child.id}`, 'PATCH', {
          mutationId: crypto.randomUUID(),
          expectedVersion: 1,
          parentId: other.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (await snapshot()).transactions.find((t) => t.id === saved.transaction!.id)?.tagIds,
    ).toEqual([parent.id, child.id]);
  });
});
