import type { MutationResult } from '../shared/types';
import { authenticate, demoEnabled, login, logout, verifyOrigin, type Session } from './auth';
import type { Env } from './env';
import { ApiError, json } from './errors';
import {
  createLedger,
  deleteTransaction,
  patchLedger,
  readBody,
  saveTransaction,
} from './mutations';
import { bootstrap, getRevision } from './storage';

export { HouseholdRoom } from '../realtime/HouseholdRoom';

async function notify(env: Env, session: Session, result: MutationResult): Promise<void> {
  if (result.replayed) return;
  try {
    const room = env.COLLABORATION.get(env.COLLABORATION.idFromName(session.householdId));
    await room.fetch('https://internal/notify', {
      method: 'POST',
      body: JSON.stringify({ revision: result.revision }),
    });
  } catch {
    // The committed D1 result remains valid. /revision + /bootstrap recover a lost notification.
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (!url.pathname.startsWith('/api/')) {
        return env.ASSETS
          ? await env.ASSETS.fetch(request)
          : new Response('Our Budget API', { status: 200 });
      }
      if (url.pathname === '/api/config' && request.method === 'GET') {
        return json({
          demoEnabled: demoEnabled(request, env),
          mode: demoEnabled(request, env) ? 'demo' : 'production',
        });
      }
      if (url.pathname === '/api/auth/demo' && request.method === 'POST')
        return await login(request, env);
      if (url.pathname === '/api/auth/logout' && request.method === 'POST')
        return await logout(request, env);
      if (request.method !== 'GET' && request.method !== 'HEAD') verifyOrigin(request, env);
      const session = await authenticate(request, env);
      if (url.pathname === '/api/bootstrap' && request.method === 'GET')
        return json(await bootstrap(env.DB, session));
      if (url.pathname === '/api/revision' && request.method === 'GET')
        return json({ revision: await getRevision(env.DB, session.householdId) });
      if (url.pathname === '/api/ws' && request.method === 'GET') {
        verifyOrigin(request, env);
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
          throw new ApiError(426, 'WEBSOCKET_REQUIRED', 'WebSocket 연결이 필요합니다.');
        const target = new URL('https://internal/connect');
        target.searchParams.set('ledgerId', url.searchParams.get('ledgerId') ?? 'main');
        const headers = new Headers(request.headers);
        headers.set('X-Budget-Session', session.tokenHash);
        headers.set('X-Budget-Household', session.householdId);
        const room = env.COLLABORATION.get(env.COLLABORATION.idFromName(session.householdId));
        return await room.fetch(target, { headers });
      }
      let result: MutationResult | undefined;
      if (url.pathname === '/api/transactions' && request.method === 'POST') {
        result = await saveTransaction(env.DB, session, await readBody(request));
      } else if (/^\/api\/transactions\/[^/]+$/.test(url.pathname) && request.method === 'DELETE') {
        result = await deleteTransaction(
          env.DB,
          session,
          decodeURIComponent(url.pathname.split('/').at(-1)!),
          await readBody(request),
        );
      } else if (url.pathname === '/api/ledgers' && request.method === 'POST') {
        result = await createLedger(env.DB, session, await readBody(request));
      } else if (/^\/api\/ledgers\/[^/]+$/.test(url.pathname) && request.method === 'PATCH') {
        result = await patchLedger(
          env.DB,
          session,
          decodeURIComponent(url.pathname.split('/').at(-1)!),
          await readBody(request),
        );
      }
      if (!result) throw new ApiError(404, 'NOT_FOUND', '요청한 경로를 찾을 수 없습니다.');
      ctx.waitUntil(notify(env, session, result));
      return json(result);
    } catch (error) {
      if (error instanceof ApiError)
        return json(
          {
            error: error.message,
            code: error.code,
            ...(error.current !== undefined ? { current: error.current } : {}),
          },
          error.status,
        );
      if (error instanceof SyntaxError || error instanceof URIError)
        return json({ error: '요청 형식을 확인해 주세요.', code: 'INVALID_INPUT' }, 400);
      // Do not send database details or transaction payloads to logs or clients.
      return json(
        {
          error: '처리하지 못했습니다. 저장 상태를 확인한 뒤 다시 시도해 주세요.',
          code: 'SERVER_ERROR',
        },
        500,
      );
    }
  },
} satisfies ExportedHandler<Env>;
