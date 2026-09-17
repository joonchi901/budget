import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import type { Bootstrap } from '../../src/shared/types';
import { productionConfiguration } from '../../src/server/auth';
import type { Env } from '../../src/server/env';

const origin = 'https://budget.example.test';
const clientId = 'test-budget-client.apps.googleusercontent.com';
// This is a mock protocol credential, never accepted by a live issuer.
const clientSecret = 'local-oidc-fixture-only';
let runtime: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
let signingKey: CryptoKey;
let wrongKey: CryptoKey;
let jwk: Record<string, unknown>;
let idToken = '';
let tokenRequests: URLSearchParams[] = [];
let networkRequests: string[] = [];
async function sql(path: string) {
  for (const statement of (await readFile(path, 'utf8'))
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(statement).run();
}
async function call(
  path: string,
  options: {
    method?: string;
    cookie?: string;
    origin?: string;
    host?: string;
    body?: unknown;
  } = {},
) {
  return runtime.dispatchFetch(`${options.host ?? origin}${path}`, {
    method: options.method ?? 'GET',
    redirect: 'manual',
    headers: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.origin ? { Origin: options.origin } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}
async function start(cookie?: string) {
  const response = await call('/api/auth/oidc/start', { cookie });
  expect(response.status).toBe(302);
  const url = new URL(response.headers.get('Location')!);
  const browserCookie = response.headers.get('Set-Cookie')!.split(';')[0];
  return {
    response,
    url,
    browserCookie,
    state: url.searchParams.get('state')!,
    nonce: url.searchParams.get('nonce')!,
  };
}
async function sign(nonce: string, claims: JWTPayload = {}, key = signingKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: 'https://accounts.google.com',
    aud: clientId,
    sub: 'google-user-one',
    email: 'first@example.test',
    email_verified: true,
    nonce,
    iat: now,
    exp: now + 300,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'local-signing-key' })
    .sign(key);
}
async function finish(flow: Awaited<ReturnType<typeof start>>, claims: JWTPayload = {}) {
  idToken = await sign(flow.nonce, claims);
  return call(`/api/auth/oidc/callback?state=${flow.state}&code=local-code`, {
    cookie: flow.browserCookie,
  });
}
function appCookie(response: { headers: { get(name: string): string | null } }) {
  const value = response.headers.get('Set-Cookie')!;
  return value.match(/budget_session=[a-f0-9]{64}/)![0];
}
beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  signingKey = pair.privateKey;
  wrongKey = (await generateKeyPair('RS256')).privateKey;
  jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'local-signing-key',
    alg: 'RS256',
    use: 'sig',
  };
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
      bindings: {
        DEMO_MODE: 'true',
        APP_ORIGIN: origin,
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: clientSecret,
        AUTH_ALLOWED_EMAILS: 'first@example.test,second@example.test',
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        networkRequests.push(url.href);
        if (url.href === 'https://www.googleapis.com/oauth2/v3/certs')
          return Response.json({ keys: [jwk] });
        if (url.href === 'https://oauth2.googleapis.com/token') {
          tokenRequests.push(new URLSearchParams(await request.text()));
          return Response.json({
            id_token: idToken,
            access_token: 'discarded-local-access-token',
            token_type: 'Bearer',
          });
        }
        throw new Error('Unexpected outbound authentication request');
      },
    }),
  );
  db = await runtime.getD1Database('DB');
  for (const file of (await readdir('migrations')).filter((f) => f.endsWith('.sql')).sort())
    await sql(`migrations/${file}`);
});
beforeEach(async () => {
  for (const table of [
    'sessions',
    'auth_states',
    'auth_identities',
    'payment_methods',
    'ledgers',
    'users',
    'households',
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
  tokenRequests = [];
  networkRequests = [];
  idToken = '';
});
afterAll(async () => {
  await runtime?.dispose();
});

describe('production Google OIDC with local cryptographic issuer fixtures', () => {
  it('requires one HTTPS origin and exactly two distinct allowlisted emails', () => {
    const config = {
      APP_ORIGIN: origin,
      GOOGLE_CLIENT_ID: clientId,
      GOOGLE_CLIENT_SECRET: clientSecret,
      AUTH_ALLOWED_EMAILS: 'first@example.test,second@example.test',
    } as Env;
    expect(productionConfiguration(config)?.emails).toEqual([
      'first@example.test',
      'second@example.test',
    ]);
    for (const value of [
      { APP_ORIGIN: 'http://budget.example.test' },
      { APP_ORIGIN: origin + '/' },
      { APP_ORIGIN: origin + '/path' },
      { GOOGLE_CLIENT_SECRET: '' },
      { AUTH_ALLOWED_EMAILS: 'first@example.test' },
      { AUTH_ALLOWED_EMAILS: 'first@example.test,first@example.test' },
      { AUTH_ALLOWED_EMAILS: 'first@example.test,second@example.test,third@example.test' },
    ])
      expect(productionConfiguration({ ...config, ...value })).toBeNull();
  });
  it('advertises only configuration flags and provisions an empty shared household for the two allowed identities', async () => {
    const config = await call('/api/config');
    expect(await config.json()).toEqual({
      demoEnabled: false,
      oidcEnabled: true,
      mode: 'production',
    });
    expect((await call('/api/bootstrap')).status).toBe(401);
    expect((await call('/api/auth/demo', { method: 'POST', body: { userId: 'u1' } })).status).toBe(
      404,
    );
    const first = await finish(await start());
    expect(
      first.status,
      JSON.stringify({
        body: await first.clone().text(),
        networkRequests,
        tokenRequests: tokenRequests.length,
      }),
    ).toBe(303);
    expect(first.headers.get('Location')).toBe(origin + '/');
    expect(first.headers.get('Set-Cookie')).toContain('HttpOnly');
    expect(first.headers.get('Set-Cookie')).toContain('Secure');
    expect(first.headers.get('Set-Cookie')).toContain('SameSite=Strict');
    const cookie = appCookie(first);
    const body = (await (await call('/api/bootstrap', { cookie })).json()) as Bootstrap;
    expect(body.mode).toBe('production');
    expect(body.user.id).toBe('u1');
    expect(body.users.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: 'u1', role: 'admin' },
      { id: 'u2', role: 'user' },
    ]);
    expect(body.users.map((user) => user.id)).toEqual(['u1', 'u2']);
    expect(body.ledgers).toHaveLength(1);
    expect(body.ledgers[0]).toMatchObject({ id: 'main', kind: 'main', budget: 0 });
    expect(body.transactions).toEqual([]);
    expect(body.assets).toEqual([]);
    const saved = await db
      .prepare('SELECT token_hash,auth_kind FROM sessions')
      .first<{ token_hash: string; auth_kind: string }>();
    expect(saved!.token_hash).not.toBe(cookie.split('=')[1]);
    expect(saved!.auth_kind).toBe('oidc');
    const second = await finish(await start(), {
      sub: 'google-user-two',
      email: 'second@example.test',
    });
    expect(second.status).toBe(303);
    expect(
      ((await (await call('/api/bootstrap', { cookie: appCookie(second) })).json()) as Bootstrap)
        .user.id,
    ).toBe('u2');
    expect(await db.prepare('SELECT COUNT(*) AS count FROM auth_identities').first('count')).toBe(
      2,
    );
  });

  it('preserves reorganized ledgers, replaced payment methods and changed roles on later logins', async () => {
    expect((await finish(await start())).status).toBe(303);
    await db.prepare("DELETE FROM ledgers WHERE id='main'").run();
    await db.prepare("DELETE FROM payment_methods WHERE id='cash'").run();
    await db
      .prepare(
        "INSERT INTO ledgers(id,household_id,name,icon,kind) VALUES('year','home','2026','📒','purpose')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO payment_methods(id,household_id,name,type,owner_id) VALUES('restored-cash','home','복원한 현금','cash','shared')",
      )
      .run();
    await db.prepare("UPDATE users SET role=CASE id WHEN 'u2' THEN 'admin' ELSE 'user' END").run();
    const again = await finish(await start());
    expect(again.status).toBe(303);
    const body = (await (
      await call('/api/bootstrap', { cookie: appCookie(again) })
    ).json()) as Bootstrap;
    expect(body.ledgers.map((l) => l.id)).toEqual(['year']);
    expect(body.paymentMethods.map((p) => p.id)).toEqual(['restored-cash']);
    expect(body.user.role).toBe('user');
    expect(body.users.find((u) => u.id === 'u2')?.role).toBe('admin');
  });

  it('uses browser-bound one-time state, nonce and S256 PKCE and never exposes the verifier in redirects', async () => {
    const flow = await start();
    expect(flow.url.origin).toBe('https://accounts.google.com');
    expect(flow.url.searchParams.get('scope')).toBe('openid email');
    expect(flow.url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(flow.url.searchParams.has('code_verifier')).toBe(false);
    expect(flow.response.headers.get('Set-Cookie')).toContain('SameSite=Lax');
    const stored = await db
      .prepare('SELECT state_hash,browser_hash,nonce,verifier FROM auth_states')
      .first<{ state_hash: string; browser_hash: string; nonce: string; verifier: string }>();
    expect(stored!.state_hash).not.toBe(flow.state);
    expect(stored!.browser_hash).not.toBe(flow.browserCookie.split('=')[1]);
    expect(stored!.nonce).toBe(flow.nonce);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(stored!.verifier),
    );
    expect(flow.url.searchParams.get('code_challenge')).toBe(
      Buffer.from(digest).toString('base64url'),
    );
    expect((await call(`/api/auth/oidc/callback?state=${flow.state}&code=local-code`)).status).toBe(
      400,
    );
    expect(tokenRequests).toHaveLength(0);
    const accepted = await finish(flow);
    expect(accepted.status).toBe(303);
    expect(tokenRequests).toHaveLength(1);
    expect(tokenRequests[0].get('code_verifier')).toBe(stored!.verifier);
    expect(tokenRequests[0].get('client_secret')).toBe(clientSecret);
    expect(tokenRequests[0].get('redirect_uri')).toBe(origin + '/api/auth/oidc/callback');
    expect((await finish(flow)).status).toBe(400);
    expect(tokenRequests).toHaveLength(1);
    expect(
      networkRequests.every((url) =>
        [
          'https://oauth2.googleapis.com/token',
          'https://www.googleapis.com/oauth2/v3/certs',
        ].includes(url),
      ),
    ).toBe(true);
  });

  it('rejects expired state, a replaced browser flow and hostile start origins before contacting the issuer', async () => {
    expect((await call('/api/auth/oidc/start', { origin: 'https://evil.example' })).status).toBe(
      403,
    );
    const stale = await start();
    await db.prepare('UPDATE auth_states SET expires_at=0').run();
    expect((await finish(stale)).status).toBe(400);
    const replaced = await start();
    const current = await start(replaced.browserCookie);
    expect((await finish(replaced)).status).toBe(400);
    expect(tokenRequests).toHaveLength(0);
    expect((await finish(current)).status).toBe(303);
  });

  it('rejects forged signatures, incorrect issuer/audience/nonce, stale expiry and unverified email', async () => {
    const cases: JWTPayload[] = [
      { iss: 'https://attacker.example' },
      { aud: 'another-client' },
      { nonce: 'wrong-nonce' },
      { exp: Math.floor(Date.now() / 1000) - 60 },
      { iat: Math.floor(Date.now() / 1000) + 120 },
      { email_verified: false },
      { azp: 'another-client' },
      { aud: [clientId, 'other'] },
    ];
    for (const claims of cases) {
      const response = await finish(await start(), claims);
      expect(response.status, JSON.stringify(claims)).toBe(401);
    }
    const forged = await start();
    idToken = await sign(forged.nonce, {}, wrongKey);
    expect(
      (
        await call(`/api/auth/oidc/callback?state=${forged.state}&code=local-code`, {
          cookie: forged.browserCookie,
        })
      ).status,
    ).toBe(401);
    const wrongAlgorithm = await start();
    idToken = await new SignJWT({ nonce: wrongAlgorithm.nonce })
      .setProtectedHeader({ alg: 'HS256', kid: 'local-signing-key' })
      .sign(crypto.getRandomValues(new Uint8Array(32)));
    expect(
      (
        await call(`/api/auth/oidc/callback?state=${wrongAlgorithm.state}&code=local-code`, {
          cookie: wrongAlgorithm.browserCookie,
        })
      ).status,
    ).toBe(401);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM sessions').first('count')).toBe(0);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM users').first('count')).toBe(0);
  });

  it('denies a third email and pins the internal user to issuer plus subject rather than email reuse', async () => {
    expect(
      (await finish(await start(), { email: 'third@example.test', sub: 'third-user' })).status,
    ).toBe(403);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM users').first('count')).toBe(0);
    expect((await finish(await start())).status).toBe(303);
    expect((await finish(await start(), { sub: 'replacement-google-account' })).status).toBe(403);
    expect(
      (await finish(await start(), { sub: 'google-user-one', email: 'second@example.test' }))
        .status,
    ).toBe(403);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM auth_identities').first('count')).toBe(
      1,
    );
  });

  it('rejects remote demo sessions, expired/revoked membership, bad mutation origins and logged-out sessions', async () => {
    const accepted = await finish(await start());
    const cookie = appCookie(accepted);
    expect(
      (await call('/api/auth/logout', { method: 'POST', cookie, origin: 'https://evil.example' }))
        .status,
    ).toBe(403);
    expect((await call('/api/bootstrap', { cookie })).status).toBe(200);
    await db.prepare("UPDATE sessions SET auth_kind='demo'").run();
    expect((await call('/api/bootstrap', { cookie })).status).toBe(401);
    await db.prepare("UPDATE sessions SET auth_kind='oidc'").run();
    await db.prepare('UPDATE auth_identities SET active=0').run();
    expect((await call('/api/bootstrap', { cookie })).status).toBe(401);
    await db.prepare('UPDATE auth_identities SET active=1').run();
    const loggedOut = await call('/api/auth/logout', { method: 'POST', cookie, origin });
    expect(loggedOut.status).toBe(200);
    expect(loggedOut.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await call('/api/bootstrap', { cookie })).status).toBe(401);
    const again = await finish(await start());
    await db.prepare('UPDATE sessions SET expires_at=0').run();
    expect((await call('/api/bootstrap', { cookie: appCookie(again) })).status).toBe(401);
    expect(
      (
        await call('/api/bootstrap', {
          cookie: appCookie(again),
          host: 'https://unconfigured-host.example',
        })
      ).status,
    ).toBe(503);
  });
});
