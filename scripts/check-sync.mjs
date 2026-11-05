// Checks how the client applies the change feed (docs/sync-plan.md §3.9–3.10). Node 24 runs the
// shared TypeScript as is.
import assert from 'node:assert/strict';
import { unseenCounts } from '../src/shared/ledger.ts';
import { ROOM_LATEST, applyChanges, mergeSnapshot, withOlder } from '../src/shared/sync.ts';

const ledger = (id, childIds = []) => ({
  id,
  name: id,
  icon: 'ledger',
  period: { start: '2026-11-01', end: '2026-11-30' },
  kinds: [],
  fields: [],
  childIds,
});
const record = (id, ledgerId, title = id) => ({
  id,
  ledgerId,
  date: '2026-11-03',
  kindId: 'k',
  title,
  amount: 1000,
  values: {},
  createdBy: 'b',
  createdAt: `2026-11-03T0${id.length}:00:00.000Z`,
});
const message = (id, ledgerId, createdAt, text = id) => ({
  id,
  ledgerId,
  authorId: 'b',
  text,
  createdAt,
});
const profile = (id) => ({ id, handle: id, name: id, avatar: 'happy' });
const base = {
  seq: 10,
  seenAt: { nov: '2026-11-01T00:00:00.000Z', trip: '2026-11-01T00:00:00.000Z' },
  user: { ...profile('a') },
  ledgers: [ledger('y2026', ['nov', 'trip']), ledger('nov'), ledger('trip')],
  records: [record('r1', 'nov'), record('r2', 'trip')],
  messages: [
    message('m1', 'nov', '2026-11-02T00:00:00.000Z'),
    message('m2', 'trip', '2026-11-02T01:00:00.000Z'),
  ],
  members: [{ id: 'a', name: 'a' }],
  ledgerMembers: {
    nov: [{ profile: profile('a'), role: 'owner' }],
    trip: [
      { profile: profile('a'), role: 'editor' },
      { profile: profile('b'), role: 'owner' },
    ],
  },
  friends: [],
  invites: [],
};
const all = ['y2026', 'nov', 'trip'];

// Nothing changed and no `more`: the cursor moves, the data stays.
let next = applyChanges(base, { seq: 11, ledgerIds: all, changes: [] });
assert.equal(next.seq, 11);
assert.equal(next.records, base.records);
assert.equal(next.ledgers, base.ledgers);

// Added, changed and deleted records.
next = applyChanges(base, {
  seq: 12,
  ledgerIds: all,
  changes: [
    { kind: 'record', id: 'r3', ledgerId: 'nov', data: record('r3', 'nov') },
    { kind: 'record', id: 'r1', ledgerId: 'nov', data: record('r1', 'nov', '고침') },
    { kind: 'record', id: 'r2', ledgerId: 'trip' },
  ],
});
assert.deepEqual(
  next.records.map((item) => [item.id, item.title]),
  [
    ['r1', '고침'],
    ['r3', 'r3'],
  ],
);
assert.equal(base.records.length, 2, 'the data passed in stays as it was');

// Messages: a new one joins in time order, a deleted one stays as a tombstone, and 이전 글 join
// before them.
next = applyChanges(base, {
  seq: 13,
  ledgerIds: all,
  changes: [
    {
      kind: 'message',
      id: 'm3',
      ledgerId: 'nov',
      data: message('m3', 'nov', '2026-11-02T00:30:00.000Z'),
    },
    {
      kind: 'message',
      id: 'm1',
      ledgerId: 'nov',
      data: { ...message('m1', 'nov', '2026-11-02T00:00:00.000Z'), text: undefined, deleted: true },
    },
  ],
});
assert.deepEqual(
  next.messages.map((item) => item.id),
  ['m1', 'm3', 'm2'],
);
assert.equal(next.messages[0].deleted, true);
next = withOlder(next, [message('m0', 'nov', '2026-10-01T00:00:00.000Z'), base.messages[0]]);
assert.deepEqual(
  next.messages.map((item) => item.id),
  ['m0', 'm1', 'm3', 'm2'],
);
assert.equal(next.messages[1].deleted, true, '이전 글 keeps what is already here');

// A room holding fewer than the snapshot's latest has all its messages: one written a moment
// before the room's first but logged after it still shows. A full room waits for 이전 글.
next = applyChanges(base, {
  seq: 13,
  ledgerIds: all,
  changes: [
    {
      kind: 'message',
      id: 'm0',
      ledgerId: 'nov',
      data: message('m0', 'nov', '2026-11-01T23:59:59.000Z'),
    },
  ],
});
assert.deepEqual(
  next.messages.map((item) => item.id),
  ['m0', 'm1', 'm2'],
);
const full = {
  ...base,
  messages: Array.from({ length: ROOM_LATEST }, (_, index) =>
    message(
      `f${index}`,
      'nov',
      `2026-11-02T00:00:${String(index % 60).padStart(2, '0')}.${String(index).padStart(3, '0')}Z`,
    ),
  ),
};
next = applyChanges(full, {
  seq: 13,
  ledgerIds: all,
  changes: [
    {
      kind: 'message',
      id: 'm0',
      ledgerId: 'nov',
      data: message('m0', 'nov', '2026-11-01T23:59:59.000Z'),
    },
  ],
});
assert.equal(next.messages.length, ROOM_LATEST);

// A ledger no longer in ledgerIds goes with its records, messages, members and badge, and out
// of its parent.
next = applyChanges(base, {
  seq: 14,
  ledgerIds: ['y2026', 'nov'],
  changes: [{ kind: 'ledger', id: 'trip' }],
});
assert.deepEqual(
  next.ledgers.map((item) => [item.id, item.childIds]),
  [
    ['y2026', ['nov']],
    ['nov', []],
  ],
);
assert.deepEqual(
  next.records.map((item) => item.id),
  ['r1'],
);
assert.deepEqual(
  next.messages.map((item) => item.id),
  ['m1'],
);
assert.deepEqual(Object.keys(next.ledgerMembers), ['nov']);
assert.deepEqual(Object.keys(next.seenAt), ['nov']);

// A target with this device's own unsent change keeps its local state.
next = applyChanges(
  base,
  {
    seq: 15,
    ledgerIds: all,
    changes: [
      { kind: 'record', id: 'r1', ledgerId: 'nov', data: record('r1', 'nov', '서버') },
      { kind: 'record', id: 'r2', ledgerId: 'trip', data: record('r2', 'trip', '서버') },
    ],
  },
  new Set(['record:r1']),
);
assert.deepEqual(
  next.records.map((item) => item.title),
  ['r1', '서버'],
);
assert.equal(next.seq, 15);

// A ledger shared with the user: its role joins the members list; members bring names.
next = applyChanges(base, {
  seq: 16,
  ledgerIds: [...all, 'shared'],
  changes: [
    { kind: 'ledger', id: 'shared', data: ledger('shared'), role: 'viewer' },
    {
      kind: 'members',
      ledgerId: 'trip',
      data: [
        { profile: profile('a'), role: 'editor' },
        { profile: { ...profile('b'), name: '새 이름' }, role: 'owner' },
        { profile: profile('c'), role: 'viewer', invited: true },
      ],
    },
    { kind: 'seen', ledgerId: 'nov', data: '2026-11-05T00:00:00.000Z' },
    { kind: 'friends', data: [{ profile: profile('b'), status: 'friend' }] },
  ],
});
assert.deepEqual(next.ledgerMembers.shared, [{ profile: profile('a'), role: 'viewer' }]);
assert.equal(next.ledgerMembers.trip.length, 3);
assert.deepEqual(next.members, [
  { id: 'a', name: 'a' },
  { id: 'b', name: '새 이름' },
]);
assert.equal(next.seenAt.nov, '2026-11-05T00:00:00.000Z');
assert.equal(next.friends.length, 1);

// A partial snapshot puts a newly shared ledger in whole; the cursor stays.
next = mergeSnapshot(base, {
  ...base,
  seq: 99,
  seenAt: { shared: '2026-11-04T00:00:00.000Z' },
  ledgers: [ledger('shared')],
  records: [record('s1', 'shared')],
  messages: [message('s-m', 'shared', '2026-11-02T00:10:00.000Z')],
  ledgerMembers: { shared: [{ profile: profile('b'), role: 'owner' }] },
  members: [{ id: 'b', name: 'b' }],
});
assert.equal(next.seq, 10);
assert.deepEqual(
  next.ledgers.map((item) => item.id),
  ['y2026', 'nov', 'trip', 'shared'],
);
assert.deepEqual(
  next.messages.map((item) => item.id),
  ['m1', 's-m', 'm2'],
);
assert.equal(next.seenAt.shared, '2026-11-04T00:00:00.000Z');
assert.equal(next.ledgerMembers.nov.length, 1);

// Badges count others' records since the room was last opened, a parent's from below it.
assert.deepEqual(unseenCounts(base.ledgers, base.records, base.seenAt, 'a'), {
  nov: 1,
  trip: 1,
});
assert.deepEqual(
  unseenCounts(base.ledgers, base.records, { ...base.seenAt, y2026: '2026-11-01' }, 'a'),
  { y2026: 2, nov: 1, trip: 1 },
);
assert.deepEqual(unseenCounts(base.ledgers, base.records, base.seenAt, 'b'), {});

console.log('check-sync: ok');
