/** Request plumbing shared by the API modules: errors, JSON answers and input checks. */
import type { AppData, Id } from '../shared/ledger';

export interface Env {
  DB: D1Database;
  /** "true" only in .dev.vars: loopback requests act as the dev account without signing in. */
  DEV_AUTH?: string;
}

export type Role = 'owner' | 'editor' | 'viewer';
export type Loaded = AppData & { roles: Map<Id, Role> };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

export function invalid(what: string): never {
  fail(400, 'INVALID_INPUT', `${what} 값이 올바르지 않아요.`);
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export type Raw = Record<string, unknown>;
export const raw = (value: unknown): Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {};
export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid('목록'));
export const isId = (value: unknown): value is Id =>
  typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
export const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max;
export const isDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value));
export const isFlag = (value: unknown) => value === undefined || typeof value === 'boolean';
export const unique = (ids: Id[]) => new Set(ids).size === ids.length;
