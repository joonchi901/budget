/**
 * The sync contract (docs/sync-plan.md §3.4): the client gets the whole data once as a snapshot,
 * then only lists of what changed since its cursor.
 */
import type { Asset } from './assets';
import type { AppData, ChatMessage, Id, Ledger, LedgerRecord } from './ledger';
import type { Friend, LedgerMember, MemberRole, RoomInvite } from './people';

export type Change =
  // data가 없으면 더는 볼 수 없다(삭제, 멤버에서 빠짐): 기기에서 지운다.
  | { kind: 'ledger'; id: Id; data?: Ledger; role?: MemberRole }
  | { kind: 'record'; id: Id; ledgerId: Id; data?: LedgerRecord }
  | { kind: 'message'; id: Id; ledgerId: Id; data: ChatMessage } // 삭제는 data.deleted
  | { kind: 'asset'; id: Id; data?: Asset }
  | { kind: 'members'; ledgerId: Id; data: LedgerMember[] }
  | { kind: 'friends'; data: Friend[] }
  | { kind: 'invites'; data: RoomInvite[] }
  | { kind: 'seen'; ledgerId: Id; data: string }
  | { kind: 'me'; data: Pick<AppData, 'user' | 'signupLink'> };

export type Sync = {
  seq: number;
  /** 지금 멤버인 가계부. 여기 없는 가계부의 데이터는 기기에서 지운다. */
  ledgerIds: Id[];
  changes: Change[];
  /** 로그가 잘려 since부터 이어 줄 수 없다: 스냅숏을 다시 받는다. */
  resync?: true;
  /** 1,000행을 넘어 더 있다: 같은 주소를 seq로 다시 부른다. */
  more?: true;
};

export type Snapshot = AppData & { seq: number; seenAt: { [ledgerId: Id]: string } };

/** The snapshot's messages per room, the latest ones; a room holding fewer has them all. */
export const ROOM_LATEST = 200;

/** The list with `item` in place of the one with its id (or added), or without that id. */
const put = <T extends { id: Id }>(items: T[], id: Id, item?: T) =>
  !item
    ? items.filter((each) => each.id !== id)
    : items.some((each) => each.id === id)
      ? items.map((each) => (each.id === id ? item : each))
      : [...items, item];

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;

/** Names for who wrote or reacted, updated from profiles that came in. */
const named = (members: AppData['members'] = [], people: { id: Id; name: string }[]) => {
  const byId = new Map(members.map((member) => [member.id, member]));
  for (const { id, name } of people) byId.set(id, { id, name });
  return [...byId.values()];
};

/** The key `skip` holds: a change's kind and target. */
export const changeKey = (change: Change) =>
  `${change.kind}:${'id' in change ? change.id : 'ledgerId' in change ? change.ledgerId : ''}`;

/**
 * The data with a feed answer applied (docs/sync-plan.md §3.9). A target in `skip` (`kind:id`)
 * keeps its local state: a change of this device's own to it is still unsent. Whatever belongs
 * to a ledger missing from `ledgerIds` goes, unless the ledger is in `skip` (made here, not sent
 * yet). When the answer says `more`, the caller asks again.
 */
export function applyChanges(data: Snapshot, sync: Sync, skip = new Set<string>()): Snapshot {
  let next: Snapshot = { ...data, seq: sync.seq };
  const me = next.user.id;
  for (const change of sync.changes) {
    if (skip.has(changeKey(change))) continue;
    switch (change.kind) {
      case 'ledger': {
        next = { ...next, ledgers: put(next.ledgers, change.id, change.data) };
        // The user's own role shows in the members list, as everyone else's does.
        const { role } = change;
        if (!change.data || !role) break;
        const list = next.ledgerMembers?.[change.id] ?? [];
        const profile = {
          id: me,
          handle: next.user.handle,
          name: next.user.name,
          avatar: next.user.avatar ?? 'happy',
          ...(next.user.photo ? { photo: next.user.photo } : {}),
        };
        next = {
          ...next,
          ledgerMembers: {
            ...next.ledgerMembers,
            [change.id]: list.some((member) => member.profile.id === me && !member.invited)
              ? list.map((member) => (member.profile.id === me ? { ...member, role } : member))
              : [...list.filter((member) => member.profile.id !== me), { profile, role }],
          },
        };
        break;
      }
      case 'record':
        next = { ...next, records: put(next.records, change.id, change.data) };
        break;
      case 'message': {
        const messages = next.messages ?? [];
        if (messages.some((message) => message.id === change.id)) {
          next = { ...next, messages: put(messages, change.id, change.data) };
          break;
        }
        // One older than the room's oldest loaded stays for 이전 글, so no gap opens. A room with
        // fewer than the snapshot's latest has all its messages here: two first messages may
        // come in either order.
        const room = messages.filter((message) => message.ledgerId === change.ledgerId);
        if (room.length >= ROOM_LATEST && change.data.createdAt < room[0].createdAt) break;
        next = { ...next, messages: [...messages, change.data].sort(byTime) };
        break;
      }
      case 'asset':
        next = { ...next, assets: put(next.assets ?? [], change.id, change.data) };
        break;
      case 'members':
        next = {
          ...next,
          ledgerMembers: { ...next.ledgerMembers, [change.ledgerId]: change.data },
          members: named(
            next.members,
            change.data.filter((member) => !member.invited).map((member) => member.profile),
          ),
        };
        break;
      case 'friends':
        next = { ...next, friends: change.data };
        break;
      case 'invites':
        next = { ...next, invites: change.data };
        break;
      case 'seen':
        next = { ...next, seenAt: { ...next.seenAt, [change.ledgerId]: change.data } };
        break;
      case 'me':
        next = { ...next, ...change.data, members: named(next.members, [change.data.user]) };
        break;
    }
  }
  const visible = new Set(sync.ledgerIds);
  for (const key of skip) if (key.startsWith('ledger:')) visible.add(key.slice('ledger:'.length));
  // A ledger may have gone by its own change already; what belongs to it goes all the same.
  if ([...data.ledgers, ...next.ledgers].every((ledger) => visible.has(ledger.id))) return next;
  const keep = <T>(entries: { [id: Id]: T } = {}) =>
    Object.fromEntries(Object.entries(entries).filter(([id]) => visible.has(id)));
  return {
    ...next,
    ledgers: next.ledgers
      .filter((ledger) => visible.has(ledger.id))
      .map((ledger) => ({ ...ledger, childIds: ledger.childIds.filter((id) => visible.has(id)) })),
    records: next.records.filter((record) => visible.has(record.ledgerId)),
    messages: next.messages?.filter((message) => visible.has(message.ledgerId)),
    ledgerMembers: keep(next.ledgerMembers),
    seenAt: keep(next.seenAt),
  };
}

/**
 * The data with the ledgers of a partial snapshot (`GET /api/snapshot?ledgers=`) put in whole.
 * The cursor stays: the feed brings again whatever changed meanwhile.
 */
export function mergeSnapshot(data: Snapshot, part: Snapshot): Snapshot {
  const ids = new Set(part.ledgers.map((ledger) => ledger.id));
  return {
    ...data,
    ledgers: [...data.ledgers.filter((ledger) => !ids.has(ledger.id)), ...part.ledgers],
    records: [...data.records.filter((record) => !ids.has(record.ledgerId)), ...part.records],
    messages: [
      ...(data.messages ?? []).filter((message) => !ids.has(message.ledgerId)),
      ...(part.messages ?? []),
    ].sort(byTime),
    ledgerMembers: { ...data.ledgerMembers, ...part.ledgerMembers },
    seenAt: { ...data.seenAt, ...part.seenAt },
    members: named(data.members, part.members ?? []),
  };
}

/** A room's 이전 글 put in, oldest first; ones already here stay as they are. */
export function withOlder(data: Snapshot, older: ChatMessage[]): Snapshot {
  const known = new Set((data.messages ?? []).map((message) => message.id));
  return {
    ...data,
    messages: [...older.filter((message) => !known.has(message.id)), ...(data.messages ?? [])].sort(
      byTime,
    ),
  };
}

/**
 * Whether a stored copy has the snapshot's shape, at least as far as the screen relies on it: one
 * broken while its schema number stayed is taken as none (docs/sync-plan.md §4.1).
 */
export function isSnapshot(value: unknown): value is Snapshot {
  const data = value as { [part: string]: unknown } | undefined;
  const optional = [data?.members, data?.assets, data?.messages, data?.friends, data?.invites];
  return (
    typeof data?.seq === 'number' &&
    typeof (data.user as { id?: unknown } | undefined)?.id === 'string' &&
    Array.isArray(data.ledgers) &&
    Array.isArray(data.records) &&
    typeof data.seenAt === 'object' &&
    data.seenAt !== null &&
    optional.every((list) => list === undefined || Array.isArray(list))
  );
}

/**
 * What a change did to the copy, as data, so that a tab other than the one that made it, or a
 * later page, makes it again (docs/sync-plan.md §4.3). Per part of the data: the list items put
 * and the ids gone, the keys set (to undefined: gone), or the new value.
 */
export type Patch = {
  [part: string]:
    { put: { id: Id }[]; gone: Id[] } | { keys: [string, unknown][] } | { value: unknown };
};

type Parts = { [part: string]: unknown };
const listed = (value: unknown): value is { id: Id }[] =>
  Array.isArray(value) && value.every((item) => typeof item?.id === 'string');
const keyed = (value: unknown): value is Parts =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
// A change may copy what it does not change (a saved ledger maps every other one): equal is same.
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The patch that takes `before` to `after`, a copy and that copy with a change made. */
export function patchOf(before: Snapshot, after: Snapshot): Patch {
  const [was, now] = [before as unknown as Parts, after as unknown as Parts];
  const patch: Patch = {};
  for (const part of new Set([...Object.keys(was), ...Object.keys(now)])) {
    const [a, b] = [was[part], now[part]];
    if (a === b) continue;
    if (listed(a) && listed(b)) {
      const old = new Map(a.map((item) => [item.id, item]));
      const ids = new Set(b.map((item) => item.id));
      const changed = b.filter((item) => !same(old.get(item.id), item));
      const gone = a.filter((item) => !ids.has(item.id)).map((item) => item.id);
      if (changed.length || gone.length) patch[part] = { put: changed, gone };
    } else if (keyed(a) && keyed(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((key) => !same(a[key], b[key]))
        .map((key): [string, unknown] => [key, b[key]]);
      if (keys.length) patch[part] = { keys };
    } else patch[part] = { value: b };
  }
  return patch;
}

/** The copy with a patch made over it: list items keep their place, new ones go last. */
export function patched(data: Snapshot, patch: Patch = {}): Snapshot {
  const next: Parts = { ...data };
  for (const [part, change] of Object.entries(patch)) {
    if ('put' in change) {
      let list = (next[part] ?? []) as { id: Id }[];
      for (const item of change.put) list = put(list, item.id, item);
      for (const id of change.gone) list = put(list, id);
      next[part] = list;
    } else if ('keys' in change) {
      const map: Parts = { ...(next[part] as Parts) };
      for (const [key, value] of change.keys)
        if (value === undefined) delete map[key];
        else map[key] = value;
      next[part] = map;
    } else next[part] = change.value;
  }
  return next as unknown as Snapshot;
}

/**
 * A change waiting in the outbox (docs/sync-plan.md §4.2); `key` keeps the order it was made in,
 * `userId` the account it was made in, which it goes as (§4.5), `patch` what it did to the copy
 * (§4.3; none in items made before it was kept).
 */
export type Outgoing = {
  key: number;
  userId: Id;
  method: 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  patch?: Patch;
  createdAt: string;
};

/**
 * The `skip` for a feed answer: the targets of the changes still in the outbox, read from their
 * paths in the feed's `kind:id` terms (a reaction is its record's or message's; a ledger's
 * records sent with it count too).
 */
export function pendingKeys(queued: Pick<Outgoing, 'path' | 'body'>[]): Set<string> {
  const keys = queued.flatMap(({ path, body }) => {
    const [, , resource, id, extra] = path.split('/');
    if (resource === 'records') return [`record:${id}`];
    if (resource === 'messages') return [`message:${id}`];
    if (resource === 'assets') return [`asset:${id}`];
    if (resource === 'friends') return ['friends:'];
    if (resource === 'invites') return ['invites:'];
    if (resource !== 'ledgers') return ['me:'];
    if (extra === 'seen') return [`seen:${id}`];
    if (extra) return [`members:${id}`];
    const records = (body as { records?: { id: Id }[] } | undefined)?.records ?? [];
    return [`ledger:${id}`, ...records.map((record) => `record:${record.id}`)];
  });
  return new Set(keys);
}

/** Answers that refuse for now, not for good: the change goes again like after a server error. */
const LATER = [408, 425, 429];

/**
 * Sends the outbox one change at a time, oldest first (docs/sync-plan.md §4.2); a change added
 * meanwhile goes in the same run. Each answer is taken in keeping the targets of the changes
 * still waiting. A refused change (4xx) goes and the caller hears of it, except a DELETE of
 * something already gone (404), which counts as sent. Without a connection, on a server error or
 * an answer to try again later (408, 425, 429) the run stops with the rest waiting, and resolves
 * false.
 */
export async function replay(io: {
  read(): Promise<Outgoing[]>;
  send(item: Outgoing): Promise<Sync>;
  remove(key: number): Promise<void>;
  accept(answer: Sync, skip: Set<string>): Promise<void>;
  refused(failure: unknown): unknown;
}): Promise<boolean> {
  for (let queued = await io.read(); queued.length; queued = await io.read()) {
    const [item] = queued;
    const sent = await io.send(item).then(
      (answer) => ({ answer, status: 200 }),
      (failure: { status?: number }) => ({ failure, status: failure?.status ?? 0 }),
    );
    if (!sent.status || sent.status >= 500 || LATER.includes(sent.status)) return false;
    await io.remove(item.key);
    if ('answer' in sent) await io.accept(sent.answer, pendingKeys(await io.read()));
    else if (sent.status !== 404 || item.method !== 'DELETE') await io.refused(sent.failure);
  }
  return true;
}
