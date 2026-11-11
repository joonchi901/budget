import type { Id } from '../../shared/ledger';
import type { Sync } from '../../shared/sync';

export class ApiFailure extends Error {
  constructor(
    public status: number,
    message: string,
    /** The server's error code, such as HANDLE_TAKEN. */
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * Calls the API (src/server/index.ts). A change, and `GET /api/sync`, answer with what changed since
 * the device's cursor (docs/sync-plan.md §3.4); other reads say their own type. Given the device's
 * copy, its cursor goes as `since` and its user as `X-Cached-User`, which the server refuses for
 * another account (§4.5). A Blob goes as is.
 */
export async function api<T = Sync>(
  method: 'GET' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  copy?: { seq: number; user: { id: Id } },
): Promise<T> {
  const blob = body instanceof Blob;
  const url = copy ? `${path}${path.includes('?') ? '&' : '?'}since=${copy.seq}` : path;
  const headers: Record<string, string> = {};
  if (copy) headers['X-Cached-User'] = copy.user.id;
  if (body !== undefined) headers['Content-Type'] = blob ? body.type : 'application/json';
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : blob ? body : JSON.stringify(body),
  }).catch(() => {
    throw new ApiFailure(0, '서버에 연결하지 못했어요.');
  });
  const answer: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const { message, code } = answer as { message?: string; code?: string };
    throw new ApiFailure(response.status, message ?? '요청을 처리하지 못했어요.', code);
  }
  return answer as T;
}
