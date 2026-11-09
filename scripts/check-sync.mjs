// Checks how the client applies the change feed and replays its outbox (docs/sync-plan.md §3.9,
// §3.10, §4.2). Node 24 runs the shared TypeScript as is.
import assert from 'node:assert/strict';
import { unseenCounts, withAddedOptions } from '../src/shared/ledger.ts';
import {
  ROOM_LATEST,
  applyChanges,
  isSnapshot,
  mergeSnapshot,
  patchOf,
  patched,
  pendingKeys,
  replay,
  withOlder,
  withUnsent,
} from '../src/shared/sync.ts';

const ledger = (id, childIds = []) => ({
  id,
  name: id,
  icon: 'ledger',
  period: { start: '2026-11-01', end: '2026-11-30' },
  // A ledger that holds records has the 유형 its records use; a parent has none.
  kinds: childIds.length
    ? []
    : [{ id: 'k', name: '지출', color: '#AE393B', nature: 'expense', base: true }],
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

// The outbox's targets, in the feed's kind:id terms.
assert.deepEqual(
  [
    ...pendingKeys([
      { path: '/api/records/r1' },
      { path: '/api/records/r2/reactions/aha' },
      { path: '/api/messages/m1' },
      { path: '/api/messages/m2/reactions/agree' },
      { path: '/api/assets/a1' },
      { path: '/api/ledgers/new', body: { ledger: {}, parentIds: [], records: [{ id: 'r9' }] } },
      { path: '/api/ledgers/nov/seen' },
      { path: '/api/ledgers/trip/members/b' },
      { path: '/api/ledgers/trip/invites' },
      { path: '/api/friends/b' },
      { path: '/api/invites/i1' },
      { path: '/api/signup-link' },
    ]),
  ],
  [
    'record:r1',
    'record:r2',
    'message:m1',
    'message:m2',
    'asset:a1',
    'ledger:new',
    'record:r9',
    'seen:nov',
    'members:trip',
    'friends:',
    'invites:',
    'me:',
  ],
);

// A ledger made here and not sent yet stays, though the feed does not know it.
next = applyChanges(
  {
    ...base,
    ledgers: [...base.ledgers, ledger('new')],
    records: [...base.records, record('n1', 'new')],
  },
  { seq: 17, ledgerIds: all, changes: [] },
  pendingKeys([{ path: '/api/ledgers/new' }, { path: '/api/records/n1' }]),
);
assert.deepEqual(
  next.ledgers.map((item) => item.id),
  ['y2026', 'nov', 'trip', 'new'],
);
assert.deepEqual(
  next.records.map((item) => item.id),
  ['r1', 'r2', 'n1'],
);

// The outbox goes in order, one at a time; each answer keeps what is still waiting, a change
// added meanwhile goes in the same run, a refused one goes with the caller told, and a DELETE of
// something already gone counts as sent.
const outbox = (paths) => paths.map(([method, path], index) => ({ key: index + 1, method, path }));
const run = async (queued, answer) => {
  const log = [];
  let added = false;
  const sent = await replay({
    read: async () => queued,
    async send(item) {
      log.push(`send ${item.method} ${item.path}`);
      if (!added && item.key === 1) {
        added = true;
        queued = [...queued, { key: 9, method: 'PUT', path: '/api/records/late' }];
      }
      return answer(item);
    },
    async remove(key) {
      queued = queued.filter((item) => item.key !== key);
    },
    async accept(sync, skip) {
      log.push(`accept ${sync.seq} skip ${[...skip].join(' ')}`);
    },
    async refused(failure) {
      log.push(`refused ${failure.status}`);
    },
  });
  return { sent, log, left: queued.map((item) => item.key) };
};
const failure = (status) => Object.assign(new Error(String(status)), { status });
let result = await run(
  outbox([
    ['PUT', '/api/records/r1'],
    ['PUT', '/api/records/r2'],
    ['DELETE', '/api/records/r1'],
    ['PUT', '/api/records/bad'],
  ]),
  async (item) => {
    if (item.key === 3) throw failure(404);
    if (item.key === 4) throw failure(403);
    return { seq: item.key * 10, ledgerIds: all, changes: [] };
  },
);
assert.equal(result.sent, true);
assert.deepEqual(result.left, []);
assert.deepEqual(result.log, [
  'send PUT /api/records/r1',
  'accept 10 skip record:r2 record:r1 record:bad record:late',
  'send PUT /api/records/r2',
  'accept 20 skip record:r1 record:bad record:late',
  'send DELETE /api/records/r1',
  'send PUT /api/records/bad',
  'refused 403',
  'send PUT /api/records/late',
  'accept 90 skip ',
]);

// Without a connection, on a server error, or told to try later (429 and the like), the run
// stops and the change waits.
for (const status of [0, 503, 408, 425, 429]) {
  result = await run(
    outbox([
      ['PUT', '/api/records/r1'],
      ['PUT', '/api/records/r2'],
    ]),
    async (item) => {
      if (item.key === 2) throw failure(status);
      return { seq: 10, ledgerIds: all, changes: [] };
    },
  );
  assert.equal(result.sent, false);
  assert.deepEqual(result.left, [2, 9]);
}

// A change kept as data (§4.3): only what it changed, by id or key, though it copied the rest.
// Made over a newer copy, it leaves others' changes there alone, in the same item too.
const changed = {
  ...base,
  ledgers: [
    ...base.ledgers.map((item) => ({
      ...item,
      childIds: item.id === 'y2026' ? [...item.childIds, 'new'] : [...item.childIds],
    })),
    ledger('new'),
  ],
  records: [...base.records.filter((item) => item.id !== 'r2'), record('r3', 'nov')],
  messages: base.messages.map((item) => (item.id === 'm1' ? { ...item, text: '고침' } : item)),
  seenAt: { ...base.seenAt, nov: '2026-11-05T00:00:00.000Z' },
};
const patch = patchOf(base, changed);
assert.deepEqual(Object.keys(patch).sort(), ['ledgers', 'messages', 'records', 'seenAt']);
assert.deepEqual(patch.ledgers, {
  put: [ledger('new')],
  edit: [['y2026', [['childIds', [...base.ledgers[0].childIds, 'new']]]]],
  gone: [],
});
assert.deepEqual(patch.records, { put: [record('r3', 'nov')], edit: [], gone: ['r2'] });
assert.deepEqual(patch.messages.edit, [['m1', [['text', '고침']]]]);
assert.deepEqual(patch.seenAt, { keys: [['nov', '2026-11-05T00:00:00.000Z']] });
assert.deepEqual(patchOf(base, { ...base }), {}, 'a change that only shows nothing keeps nothing');
const newer = {
  ...base,
  seq: 30,
  // renamed on another device while the change waited: the parent the change added a child to
  ledgers: base.ledgers.map((item) =>
    item.id === 'trip'
      ? { ...item, name: '여행' }
      : item.id === 'y2026'
        ? { ...item, name: '2026년' }
        : item,
  ),
  records: [record('r0', 'nov'), ...base.records],
  seenAt: { ...base.seenAt, trip: '2026-11-04T00:00:00.000Z' },
};
next = patched(newer, patch);
assert.equal(next.seq, 30);
assert.deepEqual(
  next.ledgers.map((item) => [item.id, item.name, item.childIds.length]),
  [
    ['y2026', '2026년', 3],
    ['nov', 'nov', 0],
    ['trip', '여행', 0],
    ['new', 'new', 0],
  ],
);
assert.deepEqual(
  next.records.map((item) => item.id),
  ['r0', 'r1', 'r3'],
);
assert.equal(next.messages[0].text, '고침');
assert.deepEqual(next.seenAt, {
  nov: '2026-11-05T00:00:00.000Z',
  trip: '2026-11-04T00:00:00.000Z',
});
assert.deepEqual(patched(newer, undefined), newer, 'an item made before patches were kept');
assert.deepEqual(patched({ ...newer, messages: [] }, patch).messages, [], 'an edit of one gone');
// A key taken out of a map goes.
const { trip: _, ...seenNov } = base.seenAt;
assert.deepEqual(patched(newer, patchOf(base, { ...base, seenAt: seenNov })).seenAt, {
  nov: base.seenAt.nov,
});

// Over a copy read afresh: the page's own made again, others' from their patch, but only the
// account's own (§4.5) and only at the copy's schema (§4.3).
const outgoing = (key, extra) => ({
  key,
  userId: 'a',
  method: 'PUT',
  path: `/api/ledgers/${key}`,
  schema: 1,
  ...extra,
});
const adding = (id) => ({ patch: { ledgers: { put: [ledger(id)], edit: [], gone: [] } } });
const unsentIds = (queued, own) =>
  withUnsent(newer, queued, 1, own)
    .ledgers.map((item) => item.id)
    .slice(newer.ledgers.length);
assert.deepEqual(unsentIds([outgoing(1, adding('mine')), outgoing(2, adding('also'))]), [
  'mine',
  'also',
]);
assert.deepEqual(
  unsentIds([outgoing(1, { ...adding('theirs'), userId: 'b' })]),
  [],
  'another account',
);
assert.deepEqual(unsentIds([outgoing(1, { ...adding('old'), schema: 0 })]), [], 'another schema');
assert.deepEqual(
  unsentIds([outgoing(1, { ...adding('old'), schema: undefined })]),
  [],
  'no schema',
);
assert.deepEqual(
  unsentIds([outgoing(1, adding('stored'))], (key) =>
    key === 1 ? (data) => ({ ...data, ledgers: [...data.ledgers, ledger('again')] }) : undefined,
  ),
  ['again'],
  "the page's own change is made again, not its patch",
);
// One whose patch went with a copy the screen failed to draw is only sent (§4.1).
assert.deepEqual(withUnsent(newer, [outgoing(1)], 1), newer, 'patch dropped');

// A stored copy broken with its schema number unchanged counts as none (§4.1).
assert.equal(isSnapshot(base), true);
const { ledgers: __, ...noLedgers } = base;
assert.equal(isSnapshot(noLedgers), false);
assert.equal(isSnapshot({ ...base, messages: {} }), false);
assert.equal(isSnapshot({ ...base, user: {} }), false);
assert.equal(isSnapshot(undefined), false);

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

// An editor's ledger save keeps only the tag options it adds, after the ones there now.
const tag = (id) => ({ id, name: id, color: '#AE393B' });
const now = [
  { id: 'pay', name: '결제', type: 'select', options: [tag('card'), tag('cash')] },
  { id: 'memo', name: '비고', type: 'text' },
];
assert.deepEqual(
  withAddedOptions(now, [
    // Renamed, 'cash' dropped and a stale order: only 'bank' is taken.
    { id: 'pay', name: '바뀐 이름', type: 'select', options: [tag('bank'), tag('card')] },
    { id: 'extra', name: '새 필드', type: 'select', options: [tag('x')] },
  ]),
  [{ ...now[0], options: [tag('card'), tag('cash'), tag('bank')] }, now[1]],
);
// Nothing added: the same fields, so nothing is written.
assert.ok(withAddedOptions(now, now).every((field, index) => field === now[index]));

console.log('check-sync: ok');
