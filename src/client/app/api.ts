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
 * `since`, the client's cursor (docs/sync-plan.md §3.4); other reads say their own type. A Blob
 * goes as is.
 */
export async function api<T = Sync>(
  method: 'GET' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  since?: number,
): Promise<T> {
  const blob = body instanceof Blob;
  const url = since === undefined ? path : `${path}${path.includes('?') ? '&' : '?'}since=${since}`;
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { 'Content-Type': blob ? body.type : 'application/json' },
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
