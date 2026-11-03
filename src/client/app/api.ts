import type { AppData } from '../../shared/ledger';

export class ApiFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Every API call answers with the user's whole data (src/server/index.ts). */
export async function api(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiFailure(0, '서버에 연결하지 못했어요.');
  });
  const answer: unknown = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiFailure(
      response.status,
      (answer as { message?: string }).message ?? '요청을 처리하지 못했어요.',
    );
  return answer as AppData;
}
