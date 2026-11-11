/** Request plumbing shared by the API modules: errors, JSON answers and input checks. */
import type { AppData, Id } from '../shared/ledger';
import type { Room } from './room';

export interface Env {
  DB: D1Database;
  /**
   * A Durable Object per ledger, to signal its watching members (docs/sync-plan.md §5). Without
   * it changes still go through, with no signals, and clients poll.
   */
  ROOMS?: DurableObjectNamespace<Room>;
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

/** What a sync log row says changed (docs/sync-plan.md §3.2–3.3). */
export type ChangeRow = {
  kind:
    'ledger' | 'record' | 'message' | 'asset' | 'members' | 'friends' | 'invites' | 'seen' | 'me';
  /** The target's id; for members/friends/invites/me, the scope id. */
  id: Id;
  ledgerId?: Id;
  userId?: Id;
};

/** One sync log row, to run in the same batch as the write it records. */
export const change = (db: D1Database, row: ChangeRow) =>
  db
    .prepare('INSERT INTO changes (kind, id, ledger_id, user_id, at) VALUES (?, ?, ?, ?, ?)')
    .bind(row.kind, row.id, row.ledgerId ?? null, row.userId ?? null, new Date().toISOString());
