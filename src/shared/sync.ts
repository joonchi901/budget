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
 * to a ledger missing from `ledgerIds` goes. When the answer says `more`, the caller asks again.
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
        // One older than the room's oldest loaded stays for 이전 글, so no gap opens.
        const oldest = messages.find((message) => message.ledgerId === change.ledgerId);
        if (oldest && change.data.createdAt < oldest.createdAt) break;
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
