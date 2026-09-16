import type { User } from '../shared/types';
import type { Env } from './env';
import { ApiError, json } from './errors';

export interface Session {
  user: User;
  householdId: string;
  tokenHash: string;
  expiresAt: number;
  authKind: 'demo' | 'oidc';
}

export const GOOGLE_ISSUER = 'https://accounts.google.com';
export interface ProductionAuth {
  origin: string;
  clientId: string;
  clientSecret: string;
  emails: [string, string];
}

export function productionConfiguration(env: Env): ProductionAuth | null {
  if (
    !env.APP_ORIGIN ||
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.AUTH_ALLOWED_EMAILS
  )
    return null;
  try {
    const origin = new URL(env.APP_ORIGIN);
    const emails = env.AUTH_ALLOWED_EMAILS.split(',').map((value) => value.trim().toLowerCase());
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== env.APP_ORIGIN ||
      origin.username ||
      origin.password ||
      emails.length !== 2 ||
      new Set(emails).size !== 2 ||
      emails.some((email) => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))
    )
      return null;
    return {
      origin: origin.origin,
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      emails: emails as [string, string],
    };
  } catch {
    return null;
  }
}

export function authConfiguration(request: Request, env: Env) {
  const demo = demoEnabled(request, env);
  const config = productionConfiguration(env);
  return {
    demoEnabled: demo,
    oidcEnabled: Boolean(config && new URL(request.url).origin === config.origin && !demo),
    mode: demo ? ('demo' as const) : ('production' as const),
  };
}

export function isLoopback(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

export function demoEnabled(request: Request, env: Env): boolean {
  return env.DEMO_MODE === 'true' && isLoopback(new URL(request.url).hostname);
}

export function verifyOrigin(request: Request, env: Env): void {
  const origin = request.headers.get('Origin');
  if (!origin) return; // CLI tests have no browser Origin and still need a session.
  let incoming: URL;
  try {
    incoming = new URL(origin);
  } catch {
    throw new ApiError(403, 'ORIGIN_DENIED', '허용되지 않은 요청입니다.');
  }
  const expected = new URL(request.url);
  if (incoming.origin === expected.origin) return;
  if (
    demoEnabled(request, env) &&
    ['http:', 'https:'].includes(incoming.protocol) &&
    isLoopback(incoming.hostname)
  )
    return;
  throw new ApiError(403, 'ORIGIN_DENIED', '허용되지 않은 요청입니다.');
}

export async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function cookieToken(request: Request): string | null {
  const match = request.headers
    .get('Cookie')
    ?.match(/(?:^|;\s*)budget_session=([a-f0-9]{64})(?:;|$)/);
  return match?.[1] ?? null;
}

export async function sessionByHash(
  db: D1Database,
  tokenHash: string,
  env?: Env,
): Promise<Session | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.color, u.household_id, s.expires_at, s.auth_kind, i.issuer, i.email
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN auth_identities i ON i.user_id=u.id AND i.issuer=s.identity_issuer AND i.subject=s.identity_subject AND i.active=1
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.id IN ('u1','u2')
    AND (s.auth_kind='demo' OR (s.auth_kind='oidc' AND i.user_id IS NOT NULL))`,
    )
    .bind(tokenHash, Date.now())
    .first<{
      id: 'u1' | 'u2';
      name: string;
      color: string;
      household_id: string;
      expires_at: number;
      auth_kind: 'demo' | 'oidc';
      issuer: string | null;
      email: string | null;
    }>();
  if (row && env) {
    if (row.auth_kind === 'demo' && env.DEMO_MODE !== 'true') return null;
    if (row.auth_kind === 'oidc') {
      const config = productionConfiguration(env);
      if (
        !config ||
        row.issuer !== GOOGLE_ISSUER ||
        row.email !== config.emails[row.id === 'u1' ? 0 : 1]
      )
        return null;
    }
  }
  return row
    ? {
        user: { id: row.id, name: row.name, color: row.color },
        householdId: row.household_id,
        tokenHash,
        expiresAt: row.expires_at,
        authKind: row.auth_kind,
      }
    : null;
}

export async function authenticate(request: Request, env: Env): Promise<Session> {
  const config = authConfiguration(request, env);
  if (!config.demoEnabled && !config.oidcEnabled)
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '운영 로그인 설정이 필요합니다.');
  const token = cookieToken(request);
  const session = token ? await sessionByHash(env.DB, await hash(token), env) : null;
  if (!session || (session.authKind === 'demo' ? !config.demoEnabled : !config.oidcEnabled))
    throw new ApiError(401, 'UNAUTHENTICATED', '먼저 로그인해 주세요.');
  return session;
}

export function sessionCookie(token: string, secure: boolean, maxAge: number): string {
  return `budget_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}

export async function issueSession(
  request: Request,
  env: Env,
  userId: string,
  identity?: { issuer: string; subject: string },
): Promise<string> {
  const token = randomToken();
  const old = cookieToken(request);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(Date.now()),
  ];
  if (old)
    statements.push(
      env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(old)),
    );
  statements.push(
    env.DB.prepare(
      'INSERT INTO sessions(token_hash,user_id,expires_at,auth_kind,identity_issuer,identity_subject) VALUES(?,?,?,?,?,?)',
    ).bind(
      await hash(token),
      userId,
      Date.now() + 86400000,
      identity ? 'oidc' : 'demo',
      identity?.issuer ?? null,
      identity?.subject ?? null,
    ),
  );
  await env.DB.batch(statements);
  return token;
}

export async function login(request: Request, env: Env): Promise<Response> {
  if (!demoEnabled(request, env))
    throw new ApiError(404, 'NOT_FOUND', '사용할 수 없는 경로입니다.');
  verifyOrigin(request, env);
  const body = (await request.json()) as { userId?: unknown } | null;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiError(400, 'INVALID_USER', '로컬 데모 계정을 선택해 주세요.');
  if (body.userId !== 'u1' && body.userId !== 'u2')
    throw new ApiError(400, 'INVALID_USER', '로컬 데모 계정을 선택해 주세요.');
  const user = await env.DB.prepare('SELECT id, name, color FROM users WHERE id = ?')
    .bind(body.userId)
    .first<User>();
  if (!user) throw new ApiError(400, 'INVALID_USER', '데모 초기 데이터를 먼저 준비해 주세요.');
  const token = await issueSession(request, env, user.id);
  return json({ user, mode: 'demo' }, 200, {
    'Set-Cookie': sessionCookie(token, new URL(request.url).protocol === 'https:', 86400),
  });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  verifyOrigin(request, env);
  const session = await authenticate(request, env);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash).run();
  try {
    const room = env.COLLABORATION.get(env.COLLABORATION.idFromName(session.householdId));
    await room.fetch('https://internal/revoke', {
      method: 'POST',
      body: JSON.stringify({ tokenHash: session.tokenHash }),
    });
  } catch {
    /* Revoked sessions also fail every later room permission check. */
  }
  return json({ ok: true }, 200, {
    'Set-Cookie': sessionCookie('', new URL(request.url).protocol === 'https:', 0),
  });
}
