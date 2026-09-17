import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from './env';
import { ApiError } from './errors';
import {
  GOOGLE_ISSUER,
  hash,
  issueSession,
  productionConfiguration,
  randomToken,
  sessionCookie,
  verifyOrigin,
  type ProductionAuth,
} from './auth';

const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration: 5000,
  cooldownDuration: 30000,
  cacheMaxAge: 3600000,
});
const callbackPath = '/api/auth/oidc/callback';
const stateCookie = (token: string, age: number) =>
  `budget_oidc=${token}; Path=/api/auth/oidc; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const browserToken = (request: Request) =>
  request.headers.get('Cookie')?.match(/(?:^|;\s*)budget_oidc=([a-f0-9]{64})(?:;|$)/)?.[1] ?? null;

function configFor(request: Request, env: Env): ProductionAuth {
  const config = productionConfiguration(env);
  if (!config || new URL(request.url).origin !== config.origin)
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '운영 로그인 설정과 접속 주소를 확인해 주세요.');
  return config;
}
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

export async function startOidcLogin(request: Request, env: Env): Promise<Response> {
  const config = configFor(request, env);
  verifyOrigin(request, env);
  const state = randomToken();
  const browser = randomToken();
  const nonce = randomToken();
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  const previousBrowser = browserToken(request);
  await env.DB.prepare('DELETE FROM auth_states WHERE expires_at<=? OR browser_hash=?')
    .bind(Date.now(), previousBrowser ? await hash(previousBrowser) : '')
    .run();
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM auth_states').first<number>(
    'count',
  );
  if (Number(count) >= 1000)
    throw new ApiError(429, 'AUTH_BUSY', '로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  await env.DB.prepare(
    'INSERT INTO auth_states(state_hash,browser_hash,nonce,verifier,expires_at) VALUES(?,?,?,?,?)',
  )
    .bind(await hash(state), await hash(browser), nonce, verifier, Date.now() + 600000)
    .run();
  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.origin + callbackPath,
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.href,
      'Set-Cookie': stateCookie(browser, 600),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function verifyGoogleIdToken(
  token: string,
  config: ProductionAuth,
  nonce: string,
): Promise<JWTPayload & { sub: string; email: string }> {
  try {
    if (token.length > 16384) throw new Error('Token too large');
    const { payload } = await jwtVerify(token, keys, {
      issuer: [GOOGLE_ISSUER, 'accounts.google.com'],
      audience: config.clientId,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'nonce', 'email', 'email_verified'],
      clockTolerance: 5,
      maxTokenAge: '10m',
    });
    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length < 1 ||
      payload.sub.length > 255 ||
      payload.nonce !== nonce ||
      payload.email_verified !== true ||
      typeof payload.email !== 'string' ||
      (payload.azp !== undefined && payload.azp !== config.clientId) ||
      (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId)
    )
      throw new Error('Invalid identity claims');
    return { ...payload, sub: payload.sub, email: payload.email.trim().toLowerCase() };
  } catch {
    throw new ApiError(
      401,
      'INVALID_ID_TOKEN',
      '로그인 정보의 서명 또는 유효성을 확인하지 못했습니다. 다시 로그인해 주세요.',
    );
  }
}

async function bindIdentity(env: Env, userId: 'u1' | 'u2', subject: string, email: string) {
  // Only the configured identities can reach this point. No public signup or client-chosen user ID.
  const incompatible = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM users WHERE id NOT IN ('u1','u2') OR household_id!='home'",
  ).first<number>('count');
  if (incompatible)
    throw new ApiError(503, 'AUTH_DATABASE_MISMATCH', '운영 가구 초기 설정을 확인해 주세요.');
  const existingHousehold = await env.DB.prepare(
    "SELECT id FROM households WHERE id='home'",
  ).first();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO households(id,name) VALUES('home','우리의 가계부')"),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users(id,household_id,name,color,role) VALUES('u1','home','나','#8d77bc','admin')",
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users(id,household_id,name,color,role) VALUES('u2','home','와이프','#c88096','user')",
    ),
    // A restored or reorganized household may have no legacy main/cash IDs.
    // Login must not recreate records that its admins deliberately replaced.
    ...(!existingHousehold
      ? [
          env.DB.prepare(
            "INSERT OR IGNORE INTO ledgers(id,household_id,name,icon,kind,budget) VALUES('main','home','우리의 일상','🏡','main',0)",
          ),
          env.DB.prepare(
            "INSERT OR IGNORE INTO payment_methods(id,household_id,name,type,owner_id) VALUES('cash','home','현금','cash','shared')",
          ),
        ]
      : []),
    env.DB.prepare(
      'INSERT OR IGNORE INTO auth_identities(issuer,subject,user_id,email,created_at) VALUES(?,?,?,?,?)',
    ).bind(GOOGLE_ISSUER, subject, userId, email, new Date().toISOString()),
  ]);
  const bound = await env.DB.prepare(
    'SELECT user_id,active FROM auth_identities WHERE issuer=? AND subject=?',
  )
    .bind(GOOGLE_ISSUER, subject)
    .first<{ user_id: string; active: number }>();
  if (!bound || bound.user_id !== userId || bound.active !== 1)
    throw new ApiError(
      403,
      'IDENTITY_NOT_ALLOWED',
      '등록된 계정과 일치하지 않습니다. 운영자에게 계정 연결을 확인해 주세요.',
    );
  await env.DB.prepare(
    'UPDATE auth_identities SET email=? WHERE issuer=? AND subject=? AND user_id=? AND active=1',
  )
    .bind(email, GOOGLE_ISSUER, subject, userId)
    .run();
}

async function completeOidcLogin(request: Request, env: Env): Promise<Response> {
  const config = configFor(request, env);
  const url = new URL(request.url);
  const browser = browserToken(request);
  const state = url.searchParams.get('state');
  if (
    !browser ||
    !state ||
    !/^[a-f0-9]{64}$/.test(state) ||
    url.searchParams.getAll('state').length !== 1
  )
    throw new ApiError(400, 'INVALID_AUTH_STATE', '이 브라우저에서 로그인을 다시 시작해 주세요.');
  // Atomically consume the browser-bound state before code exchange. Failed/repeated callbacks cannot replay it.
  const pending = await env.DB.prepare(
    'DELETE FROM auth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING nonce,verifier',
  )
    .bind(await hash(state), await hash(browser), Date.now())
    .first<{ nonce: string; verifier: string }>();
  if (!pending)
    throw new ApiError(
      400,
      'INVALID_AUTH_STATE',
      '로그인 요청이 만료되었거나 이미 사용되었습니다. 다시 시작해 주세요.',
    );
  if (url.searchParams.has('error'))
    throw new ApiError(400, 'LOGIN_CANCELLED', '로그인이 취소되었습니다. 다시 시작해 주세요.');
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096 || url.searchParams.getAll('code').length !== 1)
    throw new ApiError(
      400,
      'INVALID_AUTH_CODE',
      '로그인 응답을 확인하지 못했습니다. 다시 시작해 주세요.',
    );
  let idToken: unknown;
  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.origin + callbackPath,
        code,
        code_verifier: pending.verifier,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Code exchange failed');
    idToken = ((await response.json()) as { id_token?: unknown }).id_token;
  } catch {
    throw new ApiError(
      502,
      'OIDC_UNAVAILABLE',
      '로그인 서비스에 연결하지 못했습니다. 다시 시작해 주세요.',
    );
  }
  if (typeof idToken !== 'string')
    throw new ApiError(401, 'INVALID_ID_TOKEN', '로그인 정보가 없습니다. 다시 시작해 주세요.');
  const identity = await verifyGoogleIdToken(idToken, config, pending.nonce);
  const index = config.emails.indexOf(identity.email);
  if (index < 0)
    throw new ApiError(
      403,
      'IDENTITY_NOT_ALLOWED',
      '이 가계부에 등록된 두 계정만 로그인할 수 있습니다.',
    );
  const userId = index === 0 ? 'u1' : 'u2';
  await bindIdentity(env, userId, identity.sub, identity.email);
  const token = await issueSession(request, env, userId, {
    issuer: GOOGLE_ISSUER,
    subject: identity.sub,
  });
  const headers = new Headers({
    Location: config.origin + '/',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  headers.append('Set-Cookie', sessionCookie(token, true, 86400));
  headers.append('Set-Cookie', stateCookie('', 0));
  return new Response(null, { status: 303, headers });
}

export async function finishOidcLogin(request: Request, env: Env): Promise<Response> {
  try {
    return await completeOidcLogin(request, env);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const escape = (value: string) =>
      value.replace(
        /[&<>"']/g,
        (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
      );
    return new Response(
      `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로그인을 확인해 주세요</title><style>body{margin:0;background:#f7f8f3;color:#24372e;font:16px/1.7 system-ui}main{max-width:440px;margin:15vh auto;padding:28px}h1{font-size:26px}a{display:inline-block;padding:12px 16px;margin:8px 10px 0 0;border-radius:8px;background:#31725f;color:white;text-decoration:none}small{display:block;margin-top:20px;color:#69766e}</style><main><h1>로그인을 확인해 주세요</h1><p>${escape(error.message)}</p><a href="/api/auth/oidc/start">다시 로그인</a><a href="/">가계부로 돌아가기</a><small>${escape(error.code)}</small></main></html>`,
      {
        status: error.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
          'Set-Cookie': stateCookie('', 0),
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        },
      },
    );
  }
}
