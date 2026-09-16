import type { Session } from './auth';
import { hash } from './auth';
import { ApiError, requireValue } from './errors';
import { replay } from './storage';
export type ObjectBody = Record<string, unknown>;
export async function readBody(request: Request): Promise<ObjectBody> {
  const text = await request.text();
  if (text.length > 65536)
    throw new ApiError(
      413,
      'REQUEST_TOO_LARGE',
      '한 번에 전송할 수 있는 데이터 크기를 넘었습니다.',
    );
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '요청 형식을 확인해 주세요.');
  }
  requireValue(
    data && typeof data === 'object' && !Array.isArray(data),
    '요청 형식을 확인해 주세요.',
  );
  return data as ObjectBody;
}

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const r = value as ObjectBody;
    return `{${Object.keys(r)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(r[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function text(value: unknown, name: string, max = 100): string {
  requireValue(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    `${name}을(를) 확인해 주세요.`,
  );
  return value.trim().normalize('NFC');
}

export function date(value: unknown, name: string): string {
  const result = text(value, name, 10);
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(result), `${name} 형식은 YYYY-MM-DD입니다.`);
  const parsed = new Date(`${result}T00:00:00Z`);
  requireValue(
    Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result,
    `${name}이(가) 올바르지 않습니다.`,
  );
  return result;
}

export function money(value: unknown, allowZero = false): number {
  requireValue(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= (allowZero ? 0 : 1) &&
      value <= 1_000_000_000_000,
    '금액은 허용 범위 안의 정수 원 단위로 입력해 주세요.',
  );
  return value;
}

export function version(value: unknown): number {
  requireValue(
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
    '수정할 항목의 버전이 필요합니다.',
  );
  return value;
}

export async function identity(db: D1Database, session: Session, body: ObjectBody, scope: string) {
  const mutationId = text(body.mutationId, '저장 요청 번호', 100);
  requireValue(/^[a-zA-Z0-9_-]+$/.test(mutationId), '저장 요청 번호가 올바르지 않습니다.');
  const requestHash = await hash(`${scope}:${stable(body)}`);
  return { mutationId, requestHash, previous: await replay(db, session, mutationId, requestHash) };
}

export function signedMoney(value: unknown): number {
  requireValue(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      Math.abs(value) <= 1_000_000_000_000,
    '잔액은 허용 범위 안의 정수 원 단위로 입력해 주세요.',
  );
  return value;
}
export function bool(value: unknown): boolean {
  requireValue(typeof value === 'boolean', '참/거짓 값을 확인해 주세요.');
  return value;
}
export function color(value: unknown): string {
  requireValue(
    typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value),
    '색상은 #RRGGBB 형식으로 입력해 주세요.',
  );
  return value;
}
export function sortOrder(value: unknown): number {
  requireValue(
    typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) < 1_000_000,
    '정렬 순서를 확인해 주세요.',
  );
  return value;
}

export function checkVersion<T extends { version: number }>(current: T, expected: unknown): number {
  const value = version(expected);
  if (value !== current.version)
    throw new ApiError(
      409,
      'VERSION_CONFLICT',
      '다른 곳에서 수정된 항목입니다. 최신 내용과 내 입력을 비교해 주세요.',
      current,
    );
  return value;
}
