/**
 * The ledger API (docs/ledger-baseline.md §6–8). Every request resolves the user and reads
 * their current memberships first; the client never decides what may be seen or changed.
 * Each change answers with the user's whole data so the client simply replaces its state.
 */
import { UGA_ICON_NAMES, UGA_REACTIONS } from '../client/brand/icon-names';
import { ASSET_KINDS, assetProblems, type Asset, type AssetKind } from '../shared/assets';
import {
  STAT_BUCKETS,
  STAT_CHARTS,
  canNest,
  recordProblems,
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
  type Role,
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

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
const DEV_USER = { id: 'dev', handle: 'dev', name: '개발자', email: 'dev@localhost' };
const devAuth = (request: Request, env: Env) =>
  env.DEV_AUTH === 'true' && LOOPBACK.includes(new URL(request.url).hostname);

// shortcut: the dev account is the only way in until Google login lands; everything else gets 401.
async function signedIn(request: Request, env: Env): Promise<AppData['user']> {
  if (!devAuth(request, env)) fail(401, 'LOGIN_REQUIRED', '로그인이 필요해요.');
  await env.DB.prepare(
    'INSERT OR IGNORE INTO users (id, handle, name, created_at, email) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(DEV_USER.id, DEV_USER.handle, DEV_USER.name, new Date().toISOString(), DEV_USER.email)
    .run();
  await env.DB.prepare('UPDATE users SET email = ? WHERE id = ? AND email IS NULL')
    .bind(DEV_USER.email, DEV_USER.id)
    .run();
  return loadUser(env.DB, DEV_USER.id);
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
  stat_cards: string | null;
  recurring: string | null;
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
  not_in_asset: number;
  recurring_id: string | null;
  unconfirmed: number;
};
type MessageRow = {
  id: Id;
  ledger_id: Id;
  author_id: Id;
  text: string | null;
  sticker: string | null;
  created_at: string;
  reply_to: string | null;
  edited_at: string | null;
};
type AssetRow = {
  id: Id;
  name: string;
  kind: AssetKind;
  balance: number;
  since: string;
  ledger_ids: string;
};

// shortcut: loads every visible ledger and record at once; page records by period once data grows.
async function load(db: D1Database, user: AppData['user']): Promise<Loaded> {
  const [
    ledgerRows,
    edgeRows,
    recordRows,
    reactionRows,
    memberRows,
    assetRows,
    messageRows,
    messageReactionRows,
  ] = await Promise.all([
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
    db
      .prepare(
        'SELECT x.record_id, x.reaction, x.user_id FROM record_reactions x JOIN records r ON r.id = x.record_id JOIN ledger_members m ON m.ledger_id = r.ledger_id WHERE m.user_id = ? ORDER BY x.created_at',
      )
      .bind(user.id)
      .all<{ record_id: Id; reaction: string; user_id: Id }>(),
    // People who share a ledger with the user, or wrote or reacted to a visible record.
    db
      .prepare(
        `SELECT id, name FROM users WHERE id IN (
           SELECT o.user_id FROM ledger_members o JOIN ledger_members m ON m.ledger_id = o.ledger_id WHERE m.user_id = ?1
           UNION SELECT r.created_by FROM records r JOIN ledger_members m ON m.ledger_id = r.ledger_id WHERE m.user_id = ?1
           UNION SELECT x.user_id FROM record_reactions x JOIN records r ON r.id = x.record_id
             JOIN ledger_members m ON m.ledger_id = r.ledger_id WHERE m.user_id = ?1)`,
      )
      .bind(user.id)
      .all<{ id: Id; name: string }>(),
    db
      .prepare('SELECT * FROM assets WHERE owner_id = ? ORDER BY created_at')
      .bind(user.id)
      .all<AssetRow>(),
    // shortcut: the latest 500 messages across rooms; page per room once 대화 grows.
    db
      .prepare(
        `SELECT * FROM (SELECT x.* FROM messages x JOIN ledger_members m ON m.ledger_id = x.ledger_id
             WHERE m.user_id = ? ORDER BY x.created_at DESC LIMIT 500) ORDER BY created_at`,
      )
      .bind(user.id)
      .all<MessageRow>(),
    db
      .prepare(
        'SELECT x.message_id, x.reaction, x.user_id FROM message_reactions x JOIN messages g ON g.id = x.message_id JOIN ledger_members m ON m.ledger_id = g.ledger_id WHERE m.user_id = ? ORDER BY x.created_at',
      )
      .bind(user.id)
      .all<{ message_id: Id; reaction: string; user_id: Id }>(),
  ]);
  const reactions = new Map<Id, Record<string, Id[]>>();
  for (const row of reactionRows.results) {
    const byReaction = reactions.get(row.record_id) ?? {};
    byReaction[row.reaction] = [...(byReaction[row.reaction] ?? []), row.user_id];
    reactions.set(row.record_id, byReaction);
  }
  const messageReactions = new Map<Id, Record<string, Id[]>>();
  for (const row of messageReactionRows.results) {
    const byReaction = messageReactions.get(row.message_id) ?? {};
    byReaction[row.reaction] = [...(byReaction[row.reaction] ?? []), row.user_id];
    messageReactions.set(row.message_id, byReaction);
  }
  const visible = new Set(ledgerRows.results.map((row) => row.id));
  const loaded: Loaded = {
    user,
    roles: new Map(ledgerRows.results.map((row) => [row.id, row.role])),
    ledgers: ledgerRows.results.map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      period: { start: row.period_start, end: row.period_end },
      kinds: JSON.parse(row.kinds),
      fields: JSON.parse(row.fields),
      ...(row.stat_cards ? { statCards: JSON.parse(row.stat_cards) } : {}),
      ...(row.recurring ? { recurring: JSON.parse(row.recurring) } : {}),
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
      ...(reactions.has(row.id) ? { reactions: reactions.get(row.id) } : {}),
      ...(row.not_in_asset ? { notInAsset: true as const } : {}),
      ...(row.recurring_id ? { recurringId: row.recurring_id } : {}),
      ...(row.unconfirmed ? { unconfirmed: true as const } : {}),
    })),
    members: memberRows.results,
    assets: assetRows.results.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      balance: row.balance,
      since: row.since,
      ledgerIds: JSON.parse(row.ledger_ids),
    })),
    messages: messageRows.results.map((row) => ({
      id: row.id,
      ledgerId: row.ledger_id,
      authorId: row.author_id,
      ...(row.text ? { text: row.text } : {}),
      ...(row.sticker ? { sticker: row.sticker } : {}),
      createdAt: row.created_at,
      ...(row.reply_to ? { replyTo: row.reply_to } : {}),
      ...(row.edited_at ? { editedAt: row.edited_at } : {}),
      ...(messageReactions.has(row.id) ? { reactions: messageReactions.get(row.id) } : {}),
    })),
  };
  return { ...loaded, ...(await loadPeople(db, loaded)) };
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
  await db.batch([
    insertRecord(db, record, data.user.id, new Date().toISOString()),
    // A moved record leaves its old ledger too.
    ...(before && before.ledgerId !== ledger.id
      ? [change(db, { kind: 'record', id, ledgerId: before.ledgerId })]
      : []),
    change(db, { kind: 'record', id, ledgerId: ledger.id }),
  ]);
}

async function deleteRecord(db: D1Database, data: Loaded, id: Id) {
  const before = data.records.find((item) => item.id === id);
  if (!before) fail(404, 'NOT_FOUND', '없는 내역이에요.');
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

/** Sends a 대화 line to a ledger the user belongs to: a text of up to 1,000 characters or one sticker. */
/**
 * Sends a message, or changes the text of one the user wrote. A new one may answer another
 * message of the same 대화 (답장).
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
    .prepare('SELECT ledger_id, author_id, text FROM messages WHERE id = ?')
    .bind(id)
    .first<{ ledger_id: Id; author_id: Id; text: string | null }>();
  if (before) {
    // Only its author changes a message, and only its text.
    if (before.author_id !== data.user.id || before.ledger_id !== ledgerId || !before.text || !text)
      fail(403, 'FORBIDDEN', '내가 쓴 글만 고칠 수 있어요.');
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

/** Deletes a message its author wrote, with its reactions; answers to it then show it as deleted. */
async function deleteMessage(db: D1Database, data: Loaded, id: Id) {
  const own = await db
    .prepare('SELECT ledger_id FROM messages WHERE id = ? AND author_id = ?')
    .bind(id, data.user.id)
    .first<{ ledger_id: Id }>();
  if (!own) fail(404, 'NOT_FOUND', '내가 쓴 글만 지울 수 있어요.');
  await db.batch([
    db.prepare('DELETE FROM message_reactions WHERE message_id = ?').bind(id),
    db.prepare('DELETE FROM messages WHERE id = ?').bind(id),
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
    .prepare('SELECT ledger_id FROM messages WHERE id = ?')
    .bind(id)
    .first<{ ledger_id: Id }>();
  if (!message || !data.roles.has(message.ledger_id)) fail(404, 'NOT_FOUND', '없는 글이에요.');
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

async function deleteAsset(db: D1Database, data: Loaded, id: Id) {
  if (!data.assets?.some((asset) => asset.id === id)) fail(404, 'NOT_FOUND', '없는 자산이에요.');
  await db.batch([
    db.prepare('DELETE FROM assets WHERE id = ? AND owner_id = ?').bind(id, data.user.id),
    change(db, { kind: 'asset', id, userId: data.user.id }),
  ]);
}

/** Adds or removes the user's own reaction; any member who can see the record may react. */
async function setReaction(db: D1Database, data: Loaded, id: Id, reaction: string, on: boolean) {
  const record = data.records.find((item) => item.id === id);
  if (!record) fail(404, 'NOT_FOUND', '없는 내역이에요.');
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
      if (request.method !== 'GET') checkOrigin(request, env);
      // Answers that are not the whole data: a photo, and an exact ID lookup.
      if (request.method === 'GET' && resource === 'photos' && isId(id) && extra && !reaction)
        return getPhoto(env.DB, id);
      if (request.method === 'GET' && resource === 'people' && id === undefined)
        return findPerson(env.DB, { user } as Loaded, url.searchParams.get('handle') ?? '');
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
      else if (resource === 'assets' && request.method === 'PUT' && target)
        await putAsset(env.DB, data, target, await request.json());
      else if (resource === 'assets' && request.method === 'DELETE' && target)
        await deleteAsset(env.DB, data, target);
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
      const { roles, ...answer } =
        request.method === 'GET' ? data : await load(env.DB, await loadUser(env.DB, user.id));
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
