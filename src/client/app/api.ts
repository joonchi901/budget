import type { AppData } from '../../shared/ledger';

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

/** Every API call answers with the user's whole data (src/server/index.ts). A Blob goes as is. */
export async function api(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown) {
  const blob = body instanceof Blob;
  const response = await fetch(path, {
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
  return answer as AppData;
}
