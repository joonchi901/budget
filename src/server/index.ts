/**
 * The ledger API (docs/ledger-baseline.md §6–8). Every request resolves the user and reads
 * their current memberships first; the client never decides what may be seen or changed.
 * The client reads the whole data once (snapshot), then what changed since its cursor: the feed
 * answers polling and every change alike (docs/sync-plan.md §3.4).
 */
import { UGA_ICON_NAMES, UGA_REACTIONS } from '../client/brand/icon-names';
import { ASSET_KINDS, assetProblems, type Asset, type AssetKind } from '../shared/assets';
import type { Snapshot } from '../shared/sync';
import {
  STAT_BUCKETS,
  STAT_CHARTS,
  canNest,
  recordProblems,
  withAddedOptions,
  type AppData,
  type FieldDef,
  type Id,
  type KindOption,
  type Ledger,
  type LedgerRecord,
  type RecurringRule,
  type StatCard,
  type TagOption,
} from '../shared/ledger';
import {
  ApiError,
  change,
  fail,
  invalid,
  isDate,
  isFlag,
  isId,
  isText,
  json,
  list,
  raw,
  unique,
  type Env,
  type Loaded,
} from './common';
import {
  acceptInvite,
  declineInvite,
  deletePhoto,
  findPerson,
  friendAction,
  getPhoto,
  inviteMembers,
  loadPeople,
  loadUser,
  markSeen,
  putPhoto,
  putProfile,
  removeMember,
  renewSignupLink,
  setMemberRole,
} from './people';
import {
  MESSAGE_REACTIONS,
  RECORD_REACTIONS,
  byIds,
  feed,
  latestSeq,
  marks,
  toAsset,
  toLedger,
  toMessage,
  toRecord,
  type Edge,
  type LedgerRow,
  type MessageRow,
  type RecordRow,
} from './sync';

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
const DEV_USER = { id: 'dev', handle: 'dev', name: '개발자', email: 'dev@localhost' };
const devAuth = (request: Request, env: Env) =>
  env.DEV_AUTH === 'true' && LOOPBACK.includes(new URL(request.url).hostname);

// shortcut: the dev account is the only way in until Google login lands; everything else gets 401.
async function signedIn(request: Request, env: Env): Promise<AppData['user']> {
  if (!devAuth(request, env)) fail(401, 'LOGIN_REQUIRED', '로그인이 필요해요.');
  // Loopback only, like the dev account: a second local account for checking sharing (§8).
  const other = request.headers.get('X-Dev-User') ?? '';
  const account = /^[a-z0-9_]{4,20}$/.test(other)
    ? { id: other, handle: other, name: other, email: `${other}@localhost` }
    : DEV_USER;
  await env.DB.prepare(
    'INSERT OR IGNORE INTO users (id, handle, name, created_at, email) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(account.id, account.handle, account.name, new Date().toISOString(), account.email)
    .run();
  await env.DB.prepare('UPDATE users SET email = ? WHERE id = ? AND email IS NULL')
    .bind(account.email, account.id)
    .run();
  return loadUser(env.DB, account.id);
}

/** Changes must come from this app's page (§8.7); the dev client runs on another loopback port. */
function checkOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (!origin || origin === new URL(request.url).origin) return;
  if (devAuth(request, env) && LOOPBACK.includes(new URL(origin).hostname)) return;
  fail(403, 'ORIGIN_DENIED', '허용되지 않은 요청이에요.');
}

/** What a request reads besides the user's ledgers, roles and assets (docs/sync-plan.md §3.6). */
type Scope = {
  /** Records: all the user's, these ledgers' only (at most 90), or none. */
  records: 'all' | Id[] | false;
  /** The records' reactions, as the snapshot shows them; no check looks at them. */
  reactions?: true;
  /** Friends, invitations, members and the signup link; of the changes, invitations use them. */
  people?: true;
};

async function load(
  db: D1Database,
  user: AppData['user'],
  scope: Scope,
): Promise<Loaded & Pick<Snapshot, 'seenAt'>> {
  const ledgerIds = Array.isArray(scope.records) ? scope.records : undefined;
  const only = ledgerIds ? ` AND r.ledger_id IN (${marks(ledgerIds)})` : '';
  const [ledgerRows, edgeRows, recordRows, assetRows, people] = await Promise.all([
    db
      .prepare(
        'SELECT l.*, m.role, m.seen_at FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id WHERE m.user_id = ?',
      )
      .bind(user.id)
      .all<LedgerRow>(),
    // A parent belongs to its owner alone, so only the owner sees its links (§8.1).
    db
      .prepare(
        "SELECT c.parent_id, c.child_id FROM ledger_children c JOIN ledger_members m ON m.ledger_id = c.parent_id AND m.role = 'owner' WHERE m.user_id = ? ORDER BY c.position",
      )
      .bind(user.id)
      .all<Edge>(),
    scope.records === false
      ? undefined
      : db
          .prepare(
            `SELECT r.*, ${scope.reactions ? RECORD_REACTIONS : "'[]' AS reactions"} FROM records r
             JOIN ledger_members m ON m.ledger_id = r.ledger_id
             WHERE m.user_id = ?${only} ORDER BY r.date, r.created_at`,
          )
          .bind(user.id, ...(ledgerIds ?? []))
          .all<RecordRow>(),
    db
      .prepare('SELECT * FROM assets WHERE owner_id = ? ORDER BY created_at')
      .bind(user.id)
      .all<Parameters<typeof toAsset>[0]>(),
    scope.people ? loadPeople(db, user.id, ledgerIds) : {},
  ]);
  const visible = new Set(ledgerRows.results.map((row) => row.id));
  return {
    user,
    roles: new Map(ledgerRows.results.map((row) => [row.id, row.role])),
    seenAt: Object.fromEntries(
      ledgerRows.results.flatMap((row) => (row.seen_at ? [[row.id, row.seen_at]] : [])),
    ),
    ledgers: ledgerRows.results.map((row) => toLedger(row, edgeRows.results, visible)),
    records: recordRows?.results.map(toRecord) ?? [],
    assets: assetRows.results.map(toAsset),
    ...people,
  };
}

/**
 * The whole data with the feed's cursor: all the user's ledgers, or only the given ones (at most
 * 90) that the user belongs to.
 */
async function snapshot(
  db: D1Database,
  user: AppData['user'],
  ledgerIds?: Id[],
): Promise<Snapshot> {
  // The cursor first: whatever changes while the rest is read comes again by the feed.
  const seq = await latestSeq(db);
  const { roles: _, ...data } = await load(db, user, {
    records: ledgerIds ?? 'all',
    reactions: true,
    people: true,
  });
  const ledgers = ledgerIds
    ? data.ledgers.filter((ledger) => ledgerIds.includes(ledger.id))
    : data.ledgers;
  // shortcut: each room's latest 200 messages; older ones come by "이전 글" (GET /api/messages).
  const messages = ledgers.length
    ? (
        await db.batch<MessageRow>(
          ledgers.map((ledger) =>
            db
              .prepare(
                `SELECT g.*, ${MESSAGE_REACTIONS} FROM messages g WHERE g.ledger_id = ? ORDER BY g.created_at DESC LIMIT 200`,
              )
              .bind(ledger.id),
          ),
        )
      )
        .flatMap((result) => result.results.map(toMessage))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    : [];
  // Names for whoever wrote or reacted: members are known; anyone else is looked up by id.
  const names = new Map([[user.id, user.name]]);
  for (const list of Object.values(data.ledgerMembers ?? {}))
    for (const member of list) names.set(member.profile.id, member.profile.name);
  const shown = [...data.records, ...messages].flatMap((item) => [
    'createdBy' in item ? item.createdBy : item.authorId,
    ...Object.values(item.reactions ?? {}).flat(),
  ]);
  const unknown = [...new Set(shown)].filter((id) => !names.has(id));
  for (const row of await byIds<{ id: Id; name: string }>(
    db,
    unknown,
    (list) => `SELECT id, name FROM users WHERE id IN (${list})`,
  ))
    names.set(row.id, row.name);
  const seenAt = ledgerIds
    ? Object.fromEntries(Object.entries(data.seenAt).filter(([id]) => ledgerIds.includes(id)))
    : data.seenAt;
  return {
    ...data,
    ledgers,
    messages,
    members: [...names].map(([id, name]) => ({ id, name })),
    seq,
    seenAt,
  };
}

/** A room's 100 messages before the given time, oldest first, for 이전 글. */
async function olderMessages(db: D1Database, user: AppData['user'], ledgerId: Id, before: string) {
  if (
    !(await db
      .prepare('SELECT 1 FROM ledger_members WHERE ledger_id = ? AND user_id = ?')
      .bind(ledgerId, user.id)
      .first())
  )
    fail(404, 'NOT_FOUND', '없는 가계부예요.');
  const rows = await db
    .prepare(
      `SELECT g.*, ${MESSAGE_REACTIONS} FROM messages g WHERE g.ledger_id = ? AND g.created_at < ?
       ORDER BY g.created_at DESC LIMIT 100`,
    )
    .bind(ledgerId, before)
    .all<MessageRow>();
  return rows.results.map(toMessage).reverse();
}

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

/** A 통계 chart; its axis is a name the client looks up, falling back when it is gone. */
function cleanStatCard(input: unknown): StatCard {
  const card = raw(input);
  if (
    !isId(card.id) ||
    !STAT_CHARTS.includes(card.chart as never) ||
    (card.nature !== 'income' && card.nature !== 'expense') ||
    (card.axis !== undefined && !isText(card.axis, 40)) ||
    (card.bucket !== undefined && !STAT_BUCKETS.includes(card.bucket as never)) ||
    !isFlag(card.wide)
  )
    invalid('통계 차트');
  return {
    id: card.id,
    chart: card.chart as StatCard['chart'],
    nature: card.nature,
    ...(card.axis ? { axis: card.axis as string } : {}),
    ...(card.bucket ? { bucket: card.bucket as StatCard['bucket'] } : {}),
    ...(card.wide ? { wide: true } : {}),
  };
}

/** Rebuilds a ledger from known keys only, so stored JSON holds nothing else (§8.9). */
const BASE_KIND_NAMES = { income: '수입', expense: '지출' } as const;

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
    const { nature, base } = raw(item);
    if (nature !== 'income' && nature !== 'expense') invalid('유형');
    if (!isFlag(base)) invalid('유형');
    const kind: KindOption = { ...cleanOption(item), nature, ...(base ? { base: true } : {}) };
    // 수입 and 지출 are always there to choose, under those names, and never archived.
    if (kind.base && (kind.archived || kind.name !== BASE_KIND_NAMES[kind.nature]))
      invalid('기본 유형');
    return kind;
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
  // Left out, the stored charts stay as they are.
  const statCards =
    value.statCards === undefined ? undefined : list(value.statCards).map(cleanStatCard);
  if (
    !unique(kinds.map((kind) => kind.id)) ||
    !unique(fields.map((field) => field.id)) ||
    !unique(childIds) ||
    (statCards && (statCards.length > 12 || !unique(statCards.map((card) => card.id))))
  )
    invalid('가계부');
  const ledger: Ledger = {
    id: value.id,
    name: value.name.trim(),
    icon: value.icon as string,
    period: { start: period.start, end: period.end },
    kinds,
    fields,
    childIds,
    ...(value.archived ? { archived: true } : {}),
    ...(statCards ? { statCards } : {}),
  };
  // Left out, the stored rules stay as they are.
  if (value.recurring === undefined) return ledger;
  const recurring = list(value.recurring).map((item) => cleanRule(item, ledger));
  if (recurring.length > 50 || !unique(recurring.map((rule) => rule.id))) invalid('반복 내역');
  return { ...ledger, recurring };
}

/** A 반복 내역 rule the ledger accepts: what one of its records would hold, plus its day. */
function cleanRule(input: unknown, ledger: Ledger): RecurringRule {
  const value = raw(input);
  if (
    !isId(value.id) ||
    !Number.isInteger(value.day) ||
    (value.day as number) < 1 ||
    (value.day as number) > 31 ||
    !isFlag(value.variable)
  )
    invalid('반복 내역');
  const { id, title, kindId, amount, values } = cleanRecord(
    { ...value, ledgerId: ledger.id, date: ledger.period.start },
    ledger,
  );
  return {
    id,
    title,
    kindId,
    amount,
    values,
    day: value.day as number,
    ...(value.variable ? { variable: true } : {}),
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
    !isFlag(value.notInAsset) ||
    !isFlag(value.unconfirmed) ||
    (value.recurringId !== undefined && !isId(value.recurringId)) ||
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
    ...(value.notInAsset ? { notInAsset: true } : {}),
    ...(value.recurringId ? { recurringId: value.recurringId } : {}),
    ...(value.unconfirmed ? { unconfirmed: true } : {}),
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
      `INSERT INTO records (id, ledger_id, date, kind_id, title, amount, field_values, created_by, created_at, updated_at, not_in_asset, recurring_id, unconfirmed)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?11, ?12)
       ON CONFLICT (id) DO UPDATE SET ledger_id = ?2, date = ?3, kind_id = ?4, title = ?5, amount = ?6,
         field_values = ?7, updated_at = ?9, not_in_asset = ?10, recurring_id = ?11, unconfirmed = ?12`,
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
      record.notInAsset ? 1 : 0,
      record.recurringId ?? null,
      record.unconfirmed ? 1 : 0,
    );

/**
 * Creates or changes a ledger, its links, and optionally records that come with it: a copy's, or
 * the 예정 records its 반복 내역 write or change.
 */
async function putLedger(db: D1Database, data: Loaded, id: Id, body: unknown) {
  const input = raw(body);
  const ledger = cleanLedger(input.ledger);
  const parentIds = list(input.parentIds).map((item) =>
    isId(item) ? item : invalid('상위 가계부'),
  );
  if (ledger.id !== id || !unique(parentIds)) invalid('가계부');
  const before = data.ledgers.find((item) => item.id === id);
  const role = data.roles.get(id);
  // Editors add tag options while writing records (§7); the rest of a ledger is its owner's.
  // Records come with a copy or a 반복 내역, both the owner's.
  if (before && role === 'editor' && input.records === undefined)
    return addTagOptions(db, id, ledger);
  if (before && role !== 'owner') fail(403, 'FORBIDDEN', '이 가계부를 바꿀 권한이 없어요.');
  // The owner's copy may predate options editors added since. No screen deletes an option (it is
  // 보관), so one missing from the copy comes back; the owner's own changes win.
  if (before) ledger.fields = withAddedOptions(ledger.fields, before.fields);
  if (!before && (await db.prepare('SELECT 1 FROM ledgers WHERE id = ?').bind(id).first()))
    fail(409, 'ID_TAKEN', '이미 있는 가계부예요.');

  // Only this ledger's records are loaded; a parent's are looked up.
  const holdsRecords = async (ledgerId: Id) =>
    ledgerId === id
      ? data.records.length > 0
      : Boolean(
          await db
            .prepare('SELECT 1 FROM records WHERE ledger_id = ? LIMIT 1')
            .bind(ledgerId)
            .first(),
        );
  if (
    data.records.some((record) => record.ledgerId === id && recordProblems(ledger, record).length)
  )
    fail(400, 'IN_USE', '쓰고 있는 유형·필드·옵션은 지울 수 없어요. 보관해 주세요.');
  const copied = (input.records === undefined ? [] : list(input.records)).map((item) =>
    cleanRecord(item, ledger),
  );
  // Each is new, or already this ledger's; none may take over a record elsewhere.
  const unknown = copied.filter((record) => !data.records.some((item) => item.id === record.id));
  if (
    copied.length > 100 ||
    !unique(copied.map((record) => record.id)) ||
    copied.some((record) =>
      data.records.some((item) => item.id === record.id && item.ledgerId !== id),
    ) ||
    (unknown.length &&
      (await db
        .prepare(`SELECT 1 FROM records WHERE id IN (${unknown.map(() => '?').join(', ')})`)
        .bind(...unknown.map((record) => record.id))
        .first()))
  )
    invalid('함께 저장할 내역');
  if (ledger.childIds.length && ((await holdsRecords(id)) || copied.length))
    fail(400, 'HAS_RECORDS', '내역이 있는 가계부에는 하위 가계부를 둘 수 없어요.');
  if (ledger.childIds.some((childId) => !data.roles.has(childId)))
    fail(403, 'FORBIDDEN', '볼 수 없는 가계부는 넣을 수 없어요.');
  for (const parentId of parentIds) {
    if (data.roles.get(parentId) !== 'owner')
      fail(403, 'FORBIDDEN', '내가 만든 상위 가계부에만 넣을 수 있어요.');
    if (await holdsRecords(parentId))
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
  // The user's own parents gaining or losing this ledger: their owner-only childIds change.
  const wereParents = data.ledgers
    .filter((item) => data.roles.get(item.id) === 'owner' && item.childIds.includes(id))
    .map((item) => item.id);
  const relinked = [
    ...parentIds.filter((parentId) => !wereParents.includes(parentId)),
    ...wereParents.filter((parentId) => !parentIds.includes(parentId)),
  ];
  await db.batch([
    db
      .prepare(
        `INSERT INTO ledgers (id, name, icon, period_start, period_end, kinds, fields, archived, created_at, updated_at, stat_cards, recurring)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?11)
         ON CONFLICT (id) DO UPDATE SET name = ?2, icon = ?3, period_start = ?4, period_end = ?5,
           kinds = ?6, fields = ?7, archived = ?8, updated_at = ?9, stat_cards = COALESCE(?10, stat_cards),
           recurring = COALESCE(?11, recurring)`,
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
        ledger.statCards ? JSON.stringify(ledger.statCards) : null,
        ledger.recurring ? JSON.stringify(ledger.recurring) : null,
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
    change(db, { kind: 'ledger', id, ledgerId: id }),
    ...relinked.map((parentId) => change(db, { kind: 'ledger', id: parentId, ledgerId: parentId })),
    ...copied.map((record) => change(db, { kind: 'record', id: record.id, ledgerId: id })),
  ]);
}

/** An editor's save of a ledger: only the tag options it adds are kept (withAddedOptions). */
async function addTagOptions(db: D1Database, id: Id, sent: Ledger) {
  // Written only over the fields it read, so two editors at once do not drop each other's options.
  for (let tries = 0; tries < 3; tries++) {
    const read = await db
      .prepare('SELECT fields FROM ledgers WHERE id = ?')
      .bind(id)
      .first<{ fields: string }>();
    const before: FieldDef[] = JSON.parse(read!.fields);
    const fields = withAddedOptions(before, sent.fields);
    if (fields.every((field, index) => field === before[index])) return;
    const [written] = await db.batch([
      db
        .prepare('UPDATE ledgers SET fields = ?, updated_at = ? WHERE id = ? AND fields = ?')
        .bind(JSON.stringify(fields), new Date().toISOString(), id, read!.fields),
      change(db, { kind: 'ledger', id, ledgerId: id }),
    ]);
    if (written.meta.changes) return;
  }
  fail(409, 'BUSY', '다른 저장과 겹쳤어요. 잠시 후 다시 해 주세요.');
}

/** Where a record is now, read by id: it may be moving in from another ledger. */
const ledgerOf = (db: D1Database, recordId: Id) =>
  db
    .prepare('SELECT ledger_id FROM records WHERE id = ?')
    .bind(recordId)
    .first<{ ledger_id: Id }>()
    .then((row) => row && { ledgerId: row.ledger_id });

async function putRecord(db: D1Database, data: Loaded, id: Id, body: unknown) {
  const ledger = data.ledgers.find((item) => item.id === raw(body).ledgerId);
  const found = await ledgerOf(db, id);
  // A record in a ledger the user cannot see is someone else's id.
  const before = found && data.roles.has(found.ledgerId) ? found : undefined;
  // Moving a record needs the right to write on both sides (§8.2).
  if (!ledger || !writable(data, ledger.id) || (before && !writable(data, before.ledgerId)))
    fail(403, 'FORBIDDEN', '이 가계부에 내역을 쓸 권한이 없어요.');
  const record = cleanRecord(body, ledger);
  if (record.id !== id) invalid('내역');
  if (found && !before) fail(409, 'ID_TAKEN', '이미 있는 내역이에요.');
  await db.batch([
    insertRecord(db, record, data.user.id, new Date().toISOString()),
    // A moved record leaves its old ledger too.
    ...(before && before.ledgerId !== ledger.id
      ? [change(db, { kind: 'record', id, ledgerId: before.ledgerId })]
      : []),
    change(db, { kind: 'record', id, ledgerId: ledger.id }),
  ]);
}

/**
 * Whether a target that is gone changed in the user's scope after their cursor: a DELETE sent
 * again (its first answer lost) succeeds like the first (docs/sync-plan.md §1, 원칙 4). An id the
 * user never could see leaves no such row.
 */
async function goneSince(
  db: D1Database,
  data: Loaded,
  kind: 'record' | 'asset',
  id: Id,
  since: number | undefined,
) {
  if (since === undefined) return false;
  const row = await (
    kind === 'asset'
      ? db
          .prepare(
            `SELECT 1 FROM changes INDEXED BY changes_user
             WHERE user_id = ? AND seq > ? AND kind = 'asset' AND id = ? LIMIT 1`,
          )
          .bind(data.user.id, since, id)
      : db
          .prepare(
            `SELECT 1 FROM changes INDEXED BY changes_ledger
             WHERE ledger_id IN (SELECT ledger_id FROM ledger_members WHERE user_id = ?)
               AND seq > ? AND kind = 'record' AND id = ? LIMIT 1`,
          )
          .bind(data.user.id, since, id)
  ).first();
  return Boolean(row);
}

async function deleteRecord(db: D1Database, data: Loaded, id: Id, since?: number) {
  const before = await ledgerOf(db, id);
  if (!before && (await goneSince(db, data, 'record', id, since))) return;
  if (!before || !data.roles.has(before.ledgerId)) fail(404, 'NOT_FOUND', '없는 내역이에요.');
  if (!writable(data, before.ledgerId)) fail(403, 'FORBIDDEN', '이 내역을 지울 권한이 없어요.');
  await db.batch([
    db.prepare('DELETE FROM record_reactions WHERE record_id = ?').bind(id),
    db.prepare('DELETE FROM records WHERE id = ?').bind(id),
    change(db, { kind: 'record', id, ledgerId: before.ledgerId }),
  ]);
}

const reactionIds: readonly string[] = UGA_REACTIONS.map((item) => item.id);
const assetKinds: readonly string[] = ASSET_KINDS.map((item) => item.value);

/** Creates or changes one of the user's own assets; it may follow any ledger the user can see. */
async function putAsset(db: D1Database, data: Loaded, id: Id, body: unknown) {
  const value = raw(body);
  if (
    value.id !== id ||
    !isText(value.name, 40) ||
    !assetKinds.includes(value.kind as string) ||
    typeof value.balance !== 'number' ||
    !Number.isSafeInteger(value.balance) ||
    Math.abs(value.balance) > 1e13 ||
    !isDate(value.since)
  )
    invalid('자산');
  const ledgerIds = list(value.ledgerIds);
  if (!ledgerIds.every(isId) || !unique(ledgerIds) || ledgerIds.length > 100)
    invalid('연동 가계부');
  if (!ledgerIds.every((ledgerId) => data.roles.has(ledgerId)))
    fail(403, 'FORBIDDEN', '볼 수 없는 가계부는 연동할 수 없어요.');
  const asset: Asset = {
    id,
    name: value.name.trim(),
    kind: value.kind as AssetKind,
    balance: value.balance,
    since: value.since,
    ledgerIds,
  };
  const problems = assetProblems(asset, data.assets ?? [], data.ledgers);
  if (problems.length) fail(400, 'INVALID_ASSET', `확인해 주세요: ${problems.join(', ')}`);
  const owner = await db
    .prepare('SELECT owner_id FROM assets WHERE id = ?')
    .bind(id)
    .first<{ owner_id: Id }>();
  if (owner && owner.owner_id !== data.user.id) fail(409, 'ID_TAKEN', '이미 있는 자산이에요.');
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO assets (id, owner_id, name, kind, balance, since, ledger_ids, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT (id) DO UPDATE SET name = ?3, kind = ?4, balance = ?5, since = ?6, ledger_ids = ?7, updated_at = ?8`,
      )
      .bind(
        id,
        data.user.id,
        asset.name,
        asset.kind,
        asset.balance,
        asset.since,
        JSON.stringify(ledgerIds),
        now,
      ),
    change(db, { kind: 'asset', id, userId: data.user.id }),
  ]);
}

/**
 * Sends a 대화 line to a ledger the user belongs to (a text of up to 1,000 characters or one
 * sticker), or changes the text of one the user wrote. A new one may answer another message of
 * the same 대화 (답장).
 */
async function putMessage(db: D1Database, data: Loaded, id: Id, body: unknown) {
  const value = raw(body);
  const ledgerId = value.ledgerId;
  const text = typeof value.text === 'string' ? value.text.trim() : undefined;
  const sticker = value.sticker;
  const replyTo = value.replyTo;
  if (
    !isId(ledgerId) ||
    (text === undefined) === (sticker === undefined) ||
    (text !== undefined && !isText(text, 1000)) ||
    (sticker !== undefined && !reactionIds.includes(sticker as string)) ||
    (replyTo !== undefined && !isId(replyTo))
  )
    invalid('대화');
  if (!data.roles.has(ledgerId)) fail(403, 'FORBIDDEN', '이 가계부의 대화에 쓸 수 없어요.');
  const before = await db
    .prepare('SELECT ledger_id, author_id, text, sticker, deleted_at FROM messages WHERE id = ?')
    .bind(id)
    .first<{
      ledger_id: Id;
      author_id: Id;
      text: string | null;
      sticker: string | null;
      deleted_at: string | null;
    }>();
  if (before) {
    // Only its author changes a message, and only its text.
    if (before.author_id !== data.user.id || before.ledger_id !== ledgerId)
      fail(403, 'FORBIDDEN', '내가 쓴 글만 고칠 수 있어요.');
    if (before.deleted_at) fail(403, 'FORBIDDEN', '지운 글은 고칠 수 없어요.');
    // The same message sent again changes nothing (재전송).
    if ((before.text ?? undefined) === text && (before.sticker ?? undefined) === sticker) return;
    if (!before.text || !text) fail(403, 'FORBIDDEN', '내가 쓴 글만 고칠 수 있어요.');
    await db.batch([
      db
        .prepare('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?')
        .bind(text, new Date().toISOString(), id),
      change(db, { kind: 'message', id, ledgerId }),
    ]);
    return;
  }
  if (
    replyTo &&
    !(await db
      .prepare('SELECT 1 FROM messages WHERE id = ? AND ledger_id = ?')
      .bind(replyTo, ledgerId)
      .first())
  )
    invalid('답장할 글');
  await db.batch([
    db
      .prepare(
        'INSERT INTO messages (id, ledger_id, author_id, text, sticker, created_at, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        id,
        ledgerId,
        data.user.id,
        text ?? null,
        (sticker as string | undefined) ?? null,
        new Date().toISOString(),
        (replyTo as string | undefined) ?? null,
      ),
    change(db, { kind: 'message', id, ledgerId }),
  ]);
}

/**
 * Deletes a message its author wrote, with its reactions. Its row stays without content, so the
 * answers to it show it as deleted. Deleting it again changes nothing.
 */
async function deleteMessage(db: D1Database, data: Loaded, id: Id) {
  const own = await db
    .prepare('SELECT ledger_id, deleted_at FROM messages WHERE id = ? AND author_id = ?')
    .bind(id, data.user.id)
    .first<{ ledger_id: Id; deleted_at: string | null }>();
  if (!own) fail(404, 'NOT_FOUND', '내가 쓴 글만 지울 수 있어요.');
  // Leaving or being removed ends the right to change the room's 대화 (§8.4, §8.14).
  if (!data.roles.has(own.ledger_id)) fail(403, 'FORBIDDEN', '이 가계부의 대화에 쓸 수 없어요.');
  if (own.deleted_at) return;
  await db.batch([
    db
      .prepare(
        'UPDATE messages SET deleted_at = ?, text = NULL, sticker = NULL WHERE id = ? AND author_id = ?',
      )
      .bind(new Date().toISOString(), id, data.user.id),
    db.prepare('DELETE FROM message_reactions WHERE message_id = ?').bind(id),
    change(db, { kind: 'message', id, ledgerId: own.ledger_id }),
  ]);
}

/** Adds or removes the user's own reaction on a message of a 대화 they belong to. */
async function setMessageReaction(
  db: D1Database,
  data: Loaded,
  id: Id,
  reaction: string,
  on: boolean,
) {
  const message = await db
    .prepare('SELECT ledger_id, deleted_at FROM messages WHERE id = ?')
    .bind(id)
    .first<{ ledger_id: Id; deleted_at: string | null }>();
  if (!message || message.deleted_at || !data.roles.has(message.ledger_id))
    fail(404, 'NOT_FOUND', '없는 글이에요.');
  if (!reactionIds.includes(reaction)) invalid('반응');
  await db.batch([
    on
      ? db
          .prepare(
            'INSERT OR IGNORE INTO message_reactions (message_id, reaction, user_id, created_at) VALUES (?, ?, ?, ?)',
          )
          .bind(id, reaction, data.user.id, new Date().toISOString())
      : db
          .prepare(
            'DELETE FROM message_reactions WHERE message_id = ? AND reaction = ? AND user_id = ?',
          )
          .bind(id, reaction, data.user.id),
    change(db, { kind: 'message', id, ledgerId: message.ledger_id }),
  ]);
}

async function deleteAsset(db: D1Database, data: Loaded, id: Id, since?: number) {
  if (!data.assets?.some((asset) => asset.id === id)) {
    if (await goneSince(db, data, 'asset', id, since)) return;
    fail(404, 'NOT_FOUND', '없는 자산이에요.');
  }
  await db.batch([
    db.prepare('DELETE FROM assets WHERE id = ? AND owner_id = ?').bind(id, data.user.id),
    change(db, { kind: 'asset', id, userId: data.user.id }),
  ]);
}

/** Adds or removes the user's own reaction; any member who can see the record may react. */
async function setReaction(db: D1Database, data: Loaded, id: Id, reaction: string, on: boolean) {
  const record = await ledgerOf(db, id);
  if (!record || !data.roles.has(record.ledgerId)) fail(404, 'NOT_FOUND', '없는 내역이에요.');
  if (!reactionIds.includes(reaction)) invalid('반응');
  await db.batch([
    on
      ? db
          .prepare(
            'INSERT OR IGNORE INTO record_reactions (record_id, reaction, user_id, created_at) VALUES (?, ?, ?, ?)',
          )
          .bind(id, reaction, data.user.id, new Date().toISOString())
      : db
          .prepare(
            'DELETE FROM record_reactions WHERE record_id = ? AND reaction = ? AND user_id = ?',
          )
          .bind(id, reaction, data.user.id),
    change(db, { kind: 'record', id, ledgerId: record.ledgerId }),
  ]);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const [, api, resource, id, extra, reaction, rest] = url.pathname.split('/');
      if (api !== 'api') fail(404, 'NOT_FOUND', '없는 주소예요.');
      const user = await signedIn(request, env);
      // A device holding another account's copy forgets it before anything is read or written
      // (docs/sync-plan.md §4.5).
      const cached = request.headers.get('X-Cached-User');
      if (cached !== null && cached !== user.id)
        fail(409, 'ACCOUNT_CHANGED', '다른 계정으로 로그인했어요.');
      if (request.method !== 'GET') checkOrigin(request, env);
      // Reads: a photo, an exact ID lookup, the snapshot, the feed and a room's older messages.
      if (request.method === 'GET' && resource === 'photos' && isId(id) && extra && !reaction)
        return getPhoto(env.DB, id);
      const query = (name: string) => url.searchParams.get(name) ?? undefined;
      const since = /^\d{1,15}$/.test(query('since') ?? '') ? Number(query('since')) : undefined;
      if (request.method === 'GET' && id === undefined) {
        if (resource === 'people')
          return findPerson(env.DB, { user } as Loaded, query('handle') ?? '');
        if (resource === 'snapshot') {
          const ledgerIds = query('ledgers')?.split(',');
          if (ledgerIds && (!ledgerIds.every(isId) || !unique(ledgerIds) || ledgerIds.length > 90))
            invalid('가계부 목록');
          return json(await snapshot(env.DB, user, ledgerIds));
        }
        if (resource === 'sync') return json(await feed(env.DB, user.id, since));
        if (resource === 'messages') {
          const ledgerId = query('ledger');
          const before = query('before') ?? '9999';
          if (!isId(ledgerId) || before.length > 40) invalid('이전 글');
          return json(await olderMessages(env.DB, user, ledgerId, before));
        }
      }
      // A change reads only what its checks need (§3.6): a ledger's own records for its PUT,
      // the people lists for invitations, and otherwise no records at all.
      const target = isId(id) && extra === undefined ? id : undefined;
      const inviting = (resource === 'ledgers' && extra === 'invites') || resource === 'invites';
      const data = await load(
        env.DB,
        user,
        resource === 'ledgers' && request.method === 'PUT' && target
          ? { records: [target] }
          : { records: false, ...(inviting ? { people: true as const } : {}) },
      );
      if (request.method === 'GET') fail(404, 'NOT_FOUND', '없는 주소예요.');
      else if (resource === 'ledgers' && request.method === 'PUT' && target)
        await putLedger(env.DB, data, target, await request.json());
      else if (resource === 'records' && request.method === 'PUT' && target)
        await putRecord(env.DB, data, target, await request.json());
      else if (resource === 'records' && request.method === 'DELETE' && target)
        await deleteRecord(env.DB, data, target, since);
      else if (resource === 'assets' && request.method === 'PUT' && target)
        await putAsset(env.DB, data, target, await request.json());
      else if (resource === 'assets' && request.method === 'DELETE' && target)
        await deleteAsset(env.DB, data, target, since);
      else if (resource === 'messages' && request.method === 'PUT' && target)
        await putMessage(env.DB, data, target, await request.json());
      else if (resource === 'messages' && request.method === 'DELETE' && target)
        await deleteMessage(env.DB, data, target);
      else if (
        resource === 'records' &&
        isId(id) &&
        extra === 'reactions' &&
        reaction &&
        rest === undefined &&
        (request.method === 'PUT' || request.method === 'DELETE')
      )
        await setReaction(env.DB, data, id, reaction, request.method === 'PUT');
      else if (
        resource === 'messages' &&
        isId(id) &&
        extra === 'reactions' &&
        reaction &&
        rest === undefined &&
        (request.method === 'PUT' || request.method === 'DELETE')
      )
        await setMessageReaction(env.DB, data, id, reaction, request.method === 'PUT');
      else if (resource === 'profile' && id === undefined && request.method === 'PUT')
        await putProfile(env.DB, data, await request.json());
      else if (
        resource === 'profile' &&
        id === 'photo' &&
        extra === undefined &&
        request.method === 'PUT'
      )
        await putPhoto(env.DB, data, request);
      else if (
        resource === 'profile' &&
        id === 'photo' &&
        extra === undefined &&
        request.method === 'DELETE'
      )
        await deletePhoto(env.DB, data);
      else if (resource === 'friends' && request.method === 'PUT' && target)
        await friendAction(env.DB, data, target, await request.json());
      else if (
        resource === 'ledgers' &&
        isId(id) &&
        extra === 'invites' &&
        !reaction &&
        request.method === 'PUT'
      )
        await inviteMembers(env.DB, data, id, await request.json());
      else if (
        resource === 'ledgers' &&
        isId(id) &&
        extra === 'seen' &&
        !reaction &&
        request.method === 'PUT'
      )
        await markSeen(env.DB, data, id);
      else if (
        resource === 'ledgers' &&
        isId(id) &&
        extra === 'members' &&
        isId(reaction) &&
        rest === undefined
      )
        await (request.method === 'PUT'
          ? setMemberRole(env.DB, data, id, reaction, await request.json())
          : request.method === 'DELETE'
            ? removeMember(env.DB, data, id, reaction)
            : fail(404, 'NOT_FOUND', '없는 주소예요.'));
      else if (resource === 'invites' && request.method === 'PUT' && target)
        await acceptInvite(env.DB, data, target, await request.json());
      else if (resource === 'invites' && request.method === 'DELETE' && target)
        await declineInvite(env.DB, data, target);
      else if (resource === 'signup-link' && id === undefined && request.method === 'PUT')
        await renewSignupLink(env.DB, user.id);
      else fail(404, 'NOT_FOUND', '없는 주소예요.');
      // Every change answers with what changed since the client's cursor, its own change included.
      return json(await feed(env.DB, user.id, since));
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
  /** Keeps 30 days of the sync log (docs/sync-plan.md §3.8); a device away longer resyncs. */
  async scheduled(_controller, env) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // Everything before the first row of the last 30 days goes. Finding that row in seq order
    // (`at` has no index) and deleting by seq reads only the rows that go. The newest row always
    // stays, so the log is never empty and its last seq is never lost.
    const last = await env.DB.prepare(
      `SELECT COALESCE((SELECT seq FROM changes WHERE at >= ? ORDER BY seq LIMIT 1),
                       (SELECT max(seq) FROM changes)) - 1 AS seq`,
    )
      .bind(cutoff)
      .first<number>('seq');
    if (!last) return;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM changes WHERE seq <= ?').bind(last),
      env.DB.prepare(
        "UPDATE sync_meta SET value = (SELECT COALESCE(min(seq), 1) - 1 FROM changes) WHERE key = 'pruned_to'",
      ),
    ]);
  },
} satisfies ExportedHandler<Env>;
