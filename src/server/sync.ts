/**
 * The change feed (docs/sync-plan.md §3.5) and the row readers it shares with the snapshot.
 * The log says only what changed; each target is read again now, as the requester may see it.
 */
import type { Asset, AssetKind } from '../shared/assets';
import type { ChatMessage, Id, Ledger, LedgerRecord, Reactions } from '../shared/ledger';
import type { Change, Sync } from '../shared/sync';
import type { Role } from './common';
import { loadFriends, loadInvites, loadLedgerMembers, loadSignupLink, loadUser } from './people';

export type LedgerRow = {
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
  seen_at: string | null;
};
export type RecordRow = {
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
  reactions: string;
};
export type MessageRow = {
  id: Id;
  ledger_id: Id;
  author_id: Id;
  text: string | null;
  sticker: string | null;
  created_at: string;
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  reactions: string;
};
type AssetRow = {
  id: Id;
  name: string;
  kind: AssetKind;
  balance: number;
  since: string;
  ledger_ids: string;
};
export type Edge = { parent_id: Id; child_id: Id };

/** A record's (`r`) or message's (`g`) reactions as JSON pairs, oldest first, read with the row. */
export const RECORD_REACTIONS = `(SELECT json_group_array(json_array(reaction, user_id)) FROM
  (SELECT reaction, user_id FROM record_reactions WHERE record_id = r.id ORDER BY created_at)) AS reactions`;
export const MESSAGE_REACTIONS = `(SELECT json_group_array(json_array(reaction, user_id)) FROM
  (SELECT reaction, user_id FROM message_reactions WHERE message_id = g.id ORDER BY created_at)) AS reactions`;

function toReactions(json: string): Reactions | undefined {
  const reactions: Reactions = {};
  for (const [reaction, userId] of JSON.parse(json) as [string, Id][])
    (reactions[reaction] ??= []).push(userId);
  return Object.keys(reactions).length ? reactions : undefined;
}

/** `visible`: the ledgers the user belongs to. A child they can no longer open drops out. */
export const toLedger = (row: LedgerRow, edges: Edge[], visible: Set<Id>): Ledger => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  period: { start: row.period_start, end: row.period_end },
  kinds: JSON.parse(row.kinds),
  fields: JSON.parse(row.fields),
  ...(row.stat_cards ? { statCards: JSON.parse(row.stat_cards) } : {}),
  ...(row.recurring ? { recurring: JSON.parse(row.recurring) } : {}),
  childIds: edges
    .filter((edge) => edge.parent_id === row.id && visible.has(edge.child_id))
    .map((edge) => edge.child_id),
  ...(row.archived ? { archived: true } : {}),
});

export function toRecord(row: RecordRow): LedgerRecord {
  const reactions = toReactions(row.reactions);
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    date: row.date,
    kindId: row.kind_id,
    title: row.title,
    amount: row.amount,
    values: JSON.parse(row.field_values),
    createdBy: row.created_by,
    createdAt: row.created_at,
    ...(reactions ? { reactions } : {}),
    ...(row.not_in_asset ? { notInAsset: true as const } : {}),
    ...(row.recurring_id ? { recurringId: row.recurring_id } : {}),
    ...(row.unconfirmed ? { unconfirmed: true as const } : {}),
  };
}

export function toMessage(row: MessageRow): ChatMessage {
  const reactions = toReactions(row.reactions);
  // A deleted message stays as a tombstone for the answers to it.
  if (row.deleted_at)
    return {
      id: row.id,
      ledgerId: row.ledger_id,
      authorId: row.author_id,
      createdAt: row.created_at,
      ...(row.reply_to ? { replyTo: row.reply_to } : {}),
      deleted: true,
    };
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    authorId: row.author_id,
    ...(row.text ? { text: row.text } : {}),
    ...(row.sticker ? { sticker: row.sticker } : {}),
    createdAt: row.created_at,
    ...(row.reply_to ? { replyTo: row.reply_to } : {}),
    ...(row.edited_at ? { editedAt: row.edited_at } : {}),
    ...(reactions ? { reactions } : {}),
  };
}

export const toAsset = (row: AssetRow): Asset => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  balance: row.balance,
  since: row.since,
  ledgerIds: JSON.parse(row.ledger_ids),
});

/** D1 binds at most 100 values a query. */
const CHUNK = 90;
export const chunks = <T>(items: T[]) =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, at) =>
    items.slice(at * CHUNK, (at + 1) * CHUNK),
  );
export const marks = (items: unknown[]) => items.map(() => '?').join(', ');

/** Rows for any number of ids, 90 at a time; `sql` gets the `?` marks for one chunk. */
export async function byIds<T>(
  db: D1Database,
  ids: Id[],
  sql: (marks: string) => string,
  ...first: unknown[]
): Promise<T[]> {
  if (!ids.length) return [];
  const results = await db.batch<T>(
    chunks(ids).map((chunk) => db.prepare(sql(marks(chunk))).bind(...first, ...chunk)),
  );
  return results.flatMap((result) => result.results);
}

export const latestSeq = (db: D1Database) =>
  db
    .prepare('SELECT COALESCE(max(seq), 0) AS seq FROM changes')
    .first<number>('seq')
    .then((seq) => seq ?? 0);

const LIMIT = 1000;
type LogRow = { seq: number; kind: Change['kind']; id: Id; ledger_id: Id | null };

/** What changed for this user since their cursor, read as they may see it now. */
export async function feed(db: D1Database, me: Id, since: number | undefined): Promise<Sync> {
  const [memberRows, pruned] = await Promise.all([
    db
      .prepare('SELECT ledger_id, role, seen_at FROM ledger_members WHERE user_id = ?')
      .bind(me)
      .all<{ ledger_id: Id; role: Role; seen_at: string | null }>(),
    db.prepare("SELECT value FROM sync_meta WHERE key = 'pruned_to'").first<number>('value'),
  ]);
  const ledgerIds = memberRows.results.map((row) => row.ledger_id);
  const memberships = new Map(memberRows.results.map((row) => [row.ledger_id, row]));
  if (since === undefined || since < (pruned ?? 0))
    return { seq: await latestSeq(db), ledgerIds, changes: [], resync: true };

  // One query reads both indexes (MULTI-INDEX OR); past 90 ledgers the rest go 90 at a time.
  // The newest seq is read in the same batch (one transaction), so nothing slips between them.
  const scopes = chunks(ledgerIds);
  const [top, ...found] = await db.batch<LogRow>([
    db.prepare('SELECT COALESCE(max(seq), 0) AS seq FROM changes'),
    ...(scopes.length ? scopes : [[]]).map((chunk, at) => {
      const where = [
        ...(at ? [] : ['user_id = ?']),
        ...(chunk.length ? [`ledger_id IN (${marks(chunk)})`] : []),
      ].join(' OR ');
      return db
        .prepare(
          `SELECT seq, kind, id, ledger_id FROM changes WHERE seq > ? AND (${where}) ORDER BY seq LIMIT ${LIMIT}`,
        )
        .bind(since, ...(at ? [] : [me]), ...chunk);
    }),
  ]);
  const rows = found
    .flatMap((result) => result.results)
    .sort((a, b) => a.seq - b.seq)
    .filter((row, at, all) => row.seq !== all[at - 1]?.seq)
    .slice(0, LIMIT);
  // Each target once, at its last change.
  const last = new Map<string, LogRow>();
  for (const row of rows) {
    const key = `${row.kind}:${row.id}`;
    last.delete(key);
    last.set(key, row);
  }
  const targets = [...last.values()];
  const idsOf = (kind: Change['kind']) =>
    targets.filter((row) => row.kind === kind).map((row) => row.id);
  const has = (kind: Change['kind']) => targets.some((row) => row.kind === kind);
  const visible = new Set(ledgerIds);
  const ledgerTargets = idsOf('ledger');

  const [ledgers, edges, records, messages, assets, members, friends, invites, user, signupLink] =
    await Promise.all([
      byIds<LedgerRow>(
        db,
        ledgerTargets,
        (list) =>
          `SELECT l.*, m.role, m.seen_at FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id AND m.user_id = ? WHERE l.id IN (${list})`,
        me,
      ),
      // A parent's links show only to its owner (§8.1).
      byIds<Edge>(
        db,
        ledgerTargets.filter((id) => memberships.get(id)?.role === 'owner'),
        (list) =>
          `SELECT parent_id, child_id FROM ledger_children WHERE parent_id IN (${list}) ORDER BY position`,
      ),
      byIds<RecordRow>(
        db,
        idsOf('record'),
        (list) => `SELECT r.*, ${RECORD_REACTIONS} FROM records r WHERE r.id IN (${list})`,
      ),
      byIds<MessageRow>(
        db,
        idsOf('message'),
        (list) => `SELECT g.*, ${MESSAGE_REACTIONS} FROM messages g WHERE g.id IN (${list})`,
      ),
      byIds<AssetRow>(
        db,
        idsOf('asset'),
        (list) => `SELECT * FROM assets WHERE owner_id = ? AND id IN (${list})`,
        me,
      ),
      Promise.all(
        chunks(idsOf('members').filter((id) => visible.has(id))).map((chunk) =>
          loadLedgerMembers(db, me, chunk),
        ),
      ).then(
        (lists) => Object.assign({}, ...lists) as Awaited<ReturnType<typeof loadLedgerMembers>>,
      ),
      has('friends') ? loadFriends(db, me) : undefined,
      has('invites') ? loadInvites(db, me) : undefined,
      has('me') ? loadUser(db, me) : undefined,
      has('me') ? loadSignupLink(db, me) : undefined,
    ]);

  const byId = <T extends { id: Id }>(items: T[]) => new Map(items.map((item) => [item.id, item]));
  const ledgerById = byId(ledgers);
  const recordById = byId(records);
  const messageById = byId(messages);
  const assetById = byId(assets);
  const changes = targets.flatMap((row): Change[] => {
    const { id } = row;
    switch (row.kind) {
      case 'ledger': {
        const found = ledgerById.get(id);
        return [
          found
            ? { kind: 'ledger', id, data: toLedger(found, edges, visible), role: found.role }
            : { kind: 'ledger', id },
        ];
      }
      case 'record': {
        const found = recordById.get(id);
        return [
          found && visible.has(found.ledger_id)
            ? { kind: 'record', id, ledgerId: found.ledger_id, data: toRecord(found) }
            : { kind: 'record', id, ledgerId: row.ledger_id ?? '' },
        ];
      }
      case 'message': {
        // A message never changes ledger; one the user cannot see goes with its ledger.
        const found = messageById.get(id);
        return found && visible.has(found.ledger_id)
          ? [{ kind: 'message', id, ledgerId: found.ledger_id, data: toMessage(found) }]
          : [];
      }
      case 'asset': {
        const found = assetById.get(id);
        return [found ? { kind: 'asset', id, data: toAsset(found) } : { kind: 'asset', id }];
      }
      case 'members':
        return members[id] ? [{ kind: 'members', ledgerId: id, data: members[id] }] : [];
      case 'friends':
        return [{ kind: 'friends', data: friends! }];
      case 'invites':
        return [{ kind: 'invites', data: invites! }];
      case 'seen': {
        const seen = memberships.get(id)?.seen_at;
        return seen ? [{ kind: 'seen', ledgerId: id, data: seen }] : [];
      }
      case 'me':
        return [{ kind: 'me', data: { user: user!, signupLink: signupLink! } }];
    }
  });
  return {
    seq: rows.length ? rows[rows.length - 1].seq : top.results[0].seq,
    ledgerIds,
    changes,
    ...(rows.length === LIMIT ? { more: true as const } : {}),
  };
}
