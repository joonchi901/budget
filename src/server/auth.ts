import type { User } from '../shared/types';
import type { Env } from './env';
import { ApiError, json } from './errors';

export interface Session {
  user: User;
  householdId: string;
  tokenHash: string;
  expiresAt: number;
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

export async function sessionByHash(db: D1Database, tokenHash: string): Promise<Session | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.color, u.household_id, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, Date.now())
    .first<{
      id: 'u1' | 'u2';
      name: string;
      color: string;
      household_id: string;
      expires_at: number;
    }>();
  return row
    ? {
        user: { id: row.id, name: row.name, color: row.color },
        householdId: row.household_id,
        tokenHash,
        expiresAt: row.expires_at,
      }
    : null;
}

export async function authenticate(request: Request, env: Env): Promise<Session> {
  // No production OIDC has been installed yet. Never reuse demo sessions remotely.
  if (!demoEnabled(request, env))
    throw new ApiError(
      503,
      'AUTH_NOT_CONFIGURED',
      '운영 로그인 설정이 필요합니다. 로컬 데모만 사용할 수 있습니다.',
    );
  const token = cookieToken(request);
  const session = token ? await sessionByHash(env.DB, await hash(token)) : null;
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', '먼저 로그인해 주세요.');
  return session;
}

function sessionCookie(token: string, secure: boolean, maxAge: number): string {
  return `budget_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
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
  const oldToken = cookieToken(request);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = [...raw].map((v) => v.toString(16).padStart(2, '0')).join('');
  const statements: D1PreparedStatement[] = [];
  if (oldToken)
    statements.push(
      env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(oldToken)),
    );
  statements.push(
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(
      await hash(token),
      user.id,
      Date.now() + 86400000,
    ),
  );
  await env.DB.batch(statements);
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
