/**
 * The ledger API (docs/ledger-baseline.md §6–8). Every request resolves the user and reads
 * their current memberships first; the client never decides what may be seen or changed.
 * Each change answers with the user's whole data so the client simply replaces its state.
 */
import { UGA_ICON_NAMES } from '../client/brand/icon-names';
import {
  canNest,
  recordProblems,
  type AppData,
  type FieldDef,
  type Id,
  type KindOption,
  type Ledger,
  type LedgerRecord,
  type TagOption,
} from '../shared/ledger';

interface Env {
  DB: D1Database;
  /** "true" only in .dev.vars: loopback requests act as the dev account without signing in. */
  DEV_AUTH?: string;
}

type Role = 'owner' | 'editor' | 'viewer';
type Loaded = AppData & { roles: Map<Id, Role> };

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

function invalid(what: string): never {
  fail(400, 'INVALID_INPUT', `${what} 값이 올바르지 않아요.`);
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
const DEV_USER = { id: 'dev', handle: 'dev', name: '개발자' };
const devAuth = (request: Request, env: Env) =>
  env.DEV_AUTH === 'true' && LOOPBACK.includes(new URL(request.url).hostname);

// shortcut: the dev account is the only way in until Google login lands; everything else gets 401.
async function signedIn(request: Request, env: Env): Promise<AppData['user']> {
  if (!devAuth(request, env)) fail(401, 'LOGIN_REQUIRED', '로그인이 필요해요.');
  await env.DB.prepare(
    'INSERT OR IGNORE INTO users (id, handle, name, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(DEV_USER.id, DEV_USER.handle, DEV_USER.name, new Date().toISOString())
    .run();
  return DEV_USER;
}

/** Changes must come from this app's page (§8.7); the dev client runs on another loopback port. */
function checkOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (!origin || origin === new URL(request.url).origin) return;
  if (devAuth(request, env) && LOOPBACK.includes(new URL(origin).hostname)) return;
  fail(403, 'ORIGIN_DENIED', '허용되지 않은 요청이에요.');
}

type LedgerRow = {
  id: Id;
  name: string;
  icon: string;
  period_start: string;
  period_end: string;
  kinds: string;
  fields: string;
  archived: number;
  role: Role;
};
type RecordRow = {
  id: Id;
  ledger_id: Id;
  date: string;
  kind_id: Id;
  title: string;
  amount: number;
  field_values: string;
  created_by: Id;
  created_at: string;
};

// shortcut: loads every visible ledger and record at once; page records by period once data grows.
async function load(db: D1Database, user: AppData['user']): Promise<Loaded> {
  const [ledgerRows, edgeRows, recordRows] = await Promise.all([
    db
      .prepare(
        'SELECT l.*, m.role FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id WHERE m.user_id = ?',
      )
      .bind(user.id)
      .all<LedgerRow>(),
    // A parent belongs to its owner alone, so only the owner sees its links (§8.1).
    db
      .prepare(
        "SELECT c.parent_id, c.child_id FROM ledger_children c JOIN ledger_members m ON m.ledger_id = c.parent_id AND m.role = 'owner' WHERE m.user_id = ? ORDER BY c.position",
      )
      .bind(user.id)
      .all<{ parent_id: Id; child_id: Id }>(),
    db
      .prepare(
        'SELECT r.* FROM records r JOIN ledger_members m ON m.ledger_id = r.ledger_id WHERE m.user_id = ? ORDER BY r.date, r.created_at',
      )
      .bind(user.id)
      .all<RecordRow>(),
  ]);
  const visible = new Set(ledgerRows.results.map((row) => row.id));
  return {
    user,
    roles: new Map(ledgerRows.results.map((row) => [row.id, row.role])),
    ledgers: ledgerRows.results.map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      period: { start: row.period_start, end: row.period_end },
      kinds: JSON.parse(row.kinds),
      fields: JSON.parse(row.fields),
      // A child the user can no longer open drops out of their parents.
      childIds: edgeRows.results
        .filter((edge) => edge.parent_id === row.id && visible.has(edge.child_id))
        .map((edge) => edge.child_id),
      ...(row.archived ? { archived: true } : {}),
    })),
    records: recordRows.results.map((row) => ({
      id: row.id,
      ledgerId: row.ledger_id,
      date: row.date,
      kindId: row.kind_id,
      title: row.title,
      amount: row.amount,
      values: JSON.parse(row.field_values),
      createdBy: row.created_by,
      createdAt: row.created_at,
    })),
  };
}

type Raw = Record<string, unknown>;
const raw = (value: unknown): Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid('목록'));
const isId = (value: unknown): value is Id =>
  typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max;
const isDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value));
const isFlag = (value: unknown) => value === undefined || typeof value === 'boolean';
const unique = (ids: Id[]) => new Set(ids).size === ids.length;

function cleanOption(input: unknown): TagOption {
  const value = raw(input);
  if (
    !isId(value.id) ||
    !isText(value.name, 40) ||
    typeof value.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(value.color) ||
    !isFlag(value.archived)
  )
    invalid('태그 옵션');
  return {
    id: value.id,
    name: value.name,
    color: value.color,
    ...(value.archived ? { archived: true } : {}),
  };
}

/** Rebuilds a ledger from known keys only, so stored JSON holds nothing else (§8.9). */
function cleanLedger(input: unknown): Ledger {
  const value = raw(input);
  const period = raw(value.period);
  if (
    !isId(value.id) ||
    !isText(value.name, 40) ||
    !UGA_ICON_NAMES.includes(value.icon as never) ||
    !isDate(period.start) ||
    !isDate(period.end) ||
    period.start > period.end ||
    !isFlag(value.archived)
  )
    invalid('가계부');
  const kinds = list(value.kinds).map((item): KindOption => {
    const nature = raw(item).nature;
    if (nature !== 'income' && nature !== 'expense') invalid('구분');
    return { ...cleanOption(item), nature };
  });
  const fields = list(value.fields).map((item): FieldDef => {
    const field = raw(item);
    if (!isId(field.id) || !isText(field.name, 40) || !isFlag(field.hidden)) invalid('필드');
    const hidden = field.hidden ? { hidden: true } : {};
    if (field.type === 'text') return { id: field.id, name: field.name, type: 'text', ...hidden };
    if (field.type !== 'select' && field.type !== 'multiSelect') invalid('필드 형태');
    if (field.emptyLabel !== undefined && !isText(field.emptyLabel, 40)) invalid('빈 값 이름');
    const options = list(field.options).map(cleanOption);
    if (!unique(options.map((option) => option.id))) invalid('태그 옵션');
    return {
      id: field.id,
      name: field.name,
      type: field.type,
      options,
      ...(field.emptyLabel ? { emptyLabel: field.emptyLabel } : {}),
      ...hidden,
    };
  });
  const childIds = list(value.childIds).map((id) => (isId(id) ? id : invalid('하위 가계부')));
  if (
    !unique(kinds.map((kind) => kind.id)) ||
    !unique(fields.map((field) => field.id)) ||
    !unique(childIds)
  )
    invalid('가계부');
  return {
    id: value.id,
    name: value.name.trim(),
    icon: value.icon as string,
    period: { start: period.start, end: period.end },
    kinds,
    fields,
    childIds,
    ...(value.archived ? { archived: true } : {}),
  };
}

/** A record the ledger accepts; who wrote it and when stay the server's (§7). */
function cleanRecord(input: unknown, ledger: Ledger): LedgerRecord {
  const value = raw(input);
  const values = raw(value.values);
  if (
    !isId(value.id) ||
    !isText(value.title, 100) ||
    !isDate(value.date) ||
    typeof value.amount !== 'number' ||
    value.amount > 1e12 ||
    Object.values(values).some((item) => typeof item === 'string' && item.length > 500)
  )
    invalid('내역');
  const record = {
    id: value.id,
    ledgerId: value.ledgerId,
    date: value.date,
    kindId: value.kindId,
    title: value.title.trim(),
    amount: value.amount,
    values: values as LedgerRecord['values'],
    createdBy: '',
    createdAt: '',
  } as LedgerRecord;
  const problems = recordProblems(ledger, record);
  if (problems.length) fail(400, 'INVALID_RECORD', `확인해 주세요: ${problems.join(', ')}`);
  return record;
}

const writable = (data: Loaded, ledgerId: Id) =>
  ['owner', 'editor'].includes(data.roles.get(ledgerId) ?? '');

const insertRecord = (db: D1Database, record: LedgerRecord, userId: Id, now: string) =>
  db
    .prepare(
      `INSERT INTO records (id, ledger_id, date, kind_id, title, amount, field_values, created_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
       ON CONFLICT (id) DO UPDATE SET ledger_id = ?2, date = ?3, kind_id = ?4, title = ?5, amount = ?6,
         field_values = ?7, updated_at = ?9`,
    )
    .bind(
      record.id,
      record.ledgerId,
      record.date,
      record.kindId,
      record.title,
      record.amount,
      JSON.stringify(record.values),
      userId,
      now,
    );

/** Creates or changes a ledger, its links, and optionally the records copied into a new one. */
async function putLedger(db: D1Database, data: Loaded, id: Id, body: unknown) {
  const input = raw(body);
  const ledger = cleanLedger(input.ledger);
  const parentIds = list(input.parentIds).map((item) =>
    isId(item) ? item : invalid('상위 가계부'),
  );
  if (ledger.id !== id || !unique(parentIds)) invalid('가계부');
  const before = data.ledgers.find((item) => item.id === id);
  // shortcut: editors may also add tag options (§7). No one is an editor until sharing lands, so only owners change ledgers.
  if (before && data.roles.get(id) !== 'owner')
    fail(403, 'FORBIDDEN', '이 가계부를 바꿀 권한이 없어요.');
  if (!before && (await db.prepare('SELECT 1 FROM ledgers WHERE id = ?').bind(id).first()))
    fail(409, 'ID_TAKEN', '이미 있는 가계부예요.');

  const holdsRecords = (ledgerId: Id) =>
    data.records.some((record) => record.ledgerId === ledgerId);
  if (
    data.records.some((record) => record.ledgerId === id && recordProblems(ledger, record).length)
  )
    fail(400, 'IN_USE', '쓰고 있는 구분·필드·옵션은 지울 수 없어요. 보관해 주세요.');
  const copied = (input.records === undefined ? [] : list(input.records)).map((item) =>
    cleanRecord(item, ledger),
  );
  if (before && copied.length) invalid('복사할 내역');
  if (ledger.childIds.length && (holdsRecords(id) || copied.length))
    fail(400, 'HAS_RECORDS', '내역이 있는 가계부에는 하위 가계부를 둘 수 없어요.');
  if (ledger.childIds.some((childId) => !data.roles.has(childId)))
    fail(403, 'FORBIDDEN', '볼 수 없는 가계부는 넣을 수 없어요.');
  for (const parentId of parentIds) {
    if (data.roles.get(parentId) !== 'owner')
      fail(403, 'FORBIDDEN', '내가 만든 상위 가계부에만 넣을 수 있어요.');
    if (holdsRecords(parentId))
      fail(400, 'HAS_RECORDS', '내역이 있는 가계부 아래에는 넣을 수 없어요.');
  }
  // Check the links as they will be, so no ledger ends up under itself.
  const next = data.ledgers
    .filter((item) => item.id !== id)
    .map((item) =>
      data.roles.get(item.id) === 'owner'
        ? {
            ...item,
            childIds: parentIds.includes(item.id)
              ? [...new Set([...item.childIds, id])]
              : item.childIds.filter((childId) => childId !== id),
          }
        : item,
    )
    .concat(ledger);
  const byId = (ledgerId: Id) => next.find((item) => item.id === ledgerId)!;
  const links = [
    ...ledger.childIds.map((childId) => [id, childId]),
    ...parentIds.map((parentId) => [parentId, id]),
  ];
  if (links.some(([parentId, childId]) => !canNest(next, byId(parentId), byId(childId))))
    fail(400, 'CYCLE', '가계부를 자기 아래에 넣을 수 없어요.');

  const now = new Date().toISOString();
  const others = parentIds.map(() => '?').join(', ');
  await db.batch([
    db
      .prepare(
        `INSERT INTO ledgers (id, name, icon, period_start, period_end, kinds, fields, archived, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
         ON CONFLICT (id) DO UPDATE SET name = ?2, icon = ?3, period_start = ?4, period_end = ?5,
           kinds = ?6, fields = ?7, archived = ?8, updated_at = ?9`,
      )
      .bind(
        id,
        ledger.name,
        ledger.icon,
        ledger.period.start,
        ledger.period.end,
        JSON.stringify(ledger.kinds),
        JSON.stringify(ledger.fields),
        ledger.archived ? 1 : 0,
        now,
      ),
    ...(before
      ? []
      : [
          db
            .prepare("INSERT INTO ledger_members (ledger_id, user_id, role) VALUES (?, ?, 'owner')")
            .bind(id, data.user.id),
        ]),
    db.prepare('DELETE FROM ledger_children WHERE parent_id = ?').bind(id),
    ...ledger.childIds.map((childId, position) =>
      db
        .prepare('INSERT INTO ledger_children (parent_id, child_id, position) VALUES (?, ?, ?)')
        .bind(id, childId, position),
    ),
    // Only this user's own parents change; anyone else's parents keep their links.
    db
      .prepare(
        `DELETE FROM ledger_children WHERE child_id = ? AND parent_id IN
           (SELECT ledger_id FROM ledger_members WHERE user_id = ? AND role = 'owner')
           ${parentIds.length ? `AND parent_id NOT IN (${others})` : ''}`,
      )
      .bind(id, data.user.id, ...parentIds),
    ...parentIds.map((parentId) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO ledger_children (parent_id, child_id, position)
           SELECT ?1, ?2, COALESCE(MAX(position) + 1, 0) FROM ledger_children WHERE parent_id = ?1`,
        )
        .bind(parentId, id),
    ),
    ...copied.map((record) => insertRecord(db, record, data.user.id, now)),
  ]);
}

async function putRecord(db: D1Database, data: Loaded, id: Id, body: unknown) {
  const ledger = data.ledgers.find((item) => item.id === raw(body).ledgerId);
  const before = data.records.find((item) => item.id === id);
  // Moving a record needs the right to write on both sides (§8.2).
  if (!ledger || !writable(data, ledger.id) || (before && !writable(data, before.ledgerId)))
    fail(403, 'FORBIDDEN', '이 가계부에 내역을 쓸 권한이 없어요.');
  const record = cleanRecord(body, ledger);
  if (record.id !== id) invalid('내역');
  if (!before && (await db.prepare('SELECT 1 FROM records WHERE id = ?').bind(id).first()))
    fail(409, 'ID_TAKEN', '이미 있는 내역이에요.');
  await insertRecord(db, record, data.user.id, new Date().toISOString()).run();
}

async function deleteRecord(db: D1Database, data: Loaded, id: Id) {
  const before = data.records.find((item) => item.id === id);
  if (!before) fail(404, 'NOT_FOUND', '없는 내역이에요.');
  if (!writable(data, before.ledgerId)) fail(403, 'FORBIDDEN', '이 내역을 지울 권한이 없어요.');
  await db.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const [, api, resource, id, extra] = url.pathname.split('/');
      if (api !== 'api') fail(404, 'NOT_FOUND', '없는 주소예요.');
      const user = await signedIn(request, env);
      if (request.method !== 'GET') checkOrigin(request, env);
      const data = await load(env.DB, user);
      const target = isId(id) && extra === undefined ? id : undefined;
      if (request.method === 'GET' && resource === 'data' && id === undefined) {
        // Fall through to answer with the data.
      } else if (resource === 'ledgers' && request.method === 'PUT' && target)
        await putLedger(env.DB, data, target, await request.json());
      else if (resource === 'records' && request.method === 'PUT' && target)
        await putRecord(env.DB, data, target, await request.json());
      else if (resource === 'records' && request.method === 'DELETE' && target)
        await deleteRecord(env.DB, data, target);
      else fail(404, 'NOT_FOUND', '없는 주소예요.');
      const { roles, ...answer } = request.method === 'GET' ? data : await load(env.DB, user);
      return json(answer satisfies AppData);
    } catch (error) {
      if (error instanceof ApiError)
        return json({ code: error.code, message: error.message }, error.status);
      if (error instanceof SyntaxError)
        return json({ code: 'INVALID_JSON', message: '요청 형식이 올바르지 않아요.' }, 400);
      console.error(error);
      return json(
        { code: 'SERVER_ERROR', message: '저장하지 못했어요. 잠시 후 다시 해 주세요.' },
        500,
      );
    }
  },
} satisfies ExportedHandler<Env>;
