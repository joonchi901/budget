/**
 * Profiles, friends, ledger membership and invitations (docs/ledger-baseline.md §7–8). Being
 * friends grants nothing: a ledger opens only through membership, after the invitee accepts.
 */
import { UGA_MOODS } from '../client/brand/icon-names';
import { leafLedgers, type AppData, type Id } from '../shared/ledger';
import {
  handleProblem,
  type Friend,
  type InviteRole,
  type LedgerMember,
  type Profile,
  type RoomInvite,
  type SignupLink,
} from '../shared/people';
import {
  change,
  fail,
  invalid,
  isId,
  isText,
  json,
  list,
  raw,
  unique,
  type Loaded,
} from './common';

type UserRow = {
  id: Id;
  handle: string;
  name: string;
  avatar: string;
  photo_version: number | null;
  email: string | null;
  handle_changed_at: string | null;
};

const DAY = 24 * 60 * 60 * 1000;
const HANDLE_DAYS = 30;
const LINK_DAYS = 30;
const LINK_LIMIT = 20;
const PHOTO_MAX_BYTES = 1024 * 1024;
const PHOTO_MAX_SIDE = 1024;
const roles: readonly string[] = ['editor', 'viewer'];
const moods: readonly string[] = UGA_MOODS;

export const toProfile = (row: UserRow): Profile => ({
  id: row.id,
  handle: row.handle,
  name: row.name,
  avatar: moods.includes(row.avatar) ? row.avatar : 'happy',
  ...(row.photo_version ? { photo: `/api/photos/${row.id}/${row.photo_version}.webp` } : {}),
});

/** The signed-in user's own account: profile, email and when the handle may change again. */
export async function loadUser(db: D1Database, id: Id): Promise<AppData['user']> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!row) fail(401, 'LOGIN_REQUIRED', '로그인이 필요해요.');
  const changeable = row.handle_changed_at
    ? new Date(Date.parse(row.handle_changed_at) + HANDLE_DAYS * DAY).toISOString().slice(0, 10)
    : undefined;
  return {
    ...toProfile(row),
    ...(row.email ? { email: row.email } : {}),
    ...(changeable && changeable > new Date().toISOString().slice(0, 10)
      ? { handleChangeableFrom: changeable }
      : {}),
  };
}

const token = () =>
  [...crypto.getRandomValues(new Uint8Array(18))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

/** The user's friend list, from their own side. */
export async function loadFriends(db: D1Database, me: Id): Promise<Friend[]> {
  const rows = await db
    .prepare(
      'SELECT f.status, u.* FROM friendships f JOIN users u ON u.id = f.other_id WHERE f.user_id = ? ORDER BY f.created_at',
    )
    .bind(me)
    .all<UserRow & { status: Friend['status'] }>();
  return rows.results.map((row) => ({ profile: toProfile(row), status: row.status }));
}

/** Ledger invitations waiting for the user's answer. */
export async function loadInvites(db: D1Database, me: Id): Promise<RoomInvite[]> {
  const rows = await db
    .prepare(
      `SELECT i.id AS invite_id, i.role AS invite_role, i.created_at AS sent_at, l.id AS ledger_id,
         l.name AS ledger_name, l.icon AS ledger_icon, l.period_start, l.period_end, u.*
       FROM ledger_invites i JOIN ledgers l ON l.id = i.ledger_id JOIN users u ON u.id = i.inviter_id
       WHERE i.invitee_id = ? ORDER BY i.created_at DESC`,
    )
    .bind(me)
    .all<
      UserRow & {
        invite_id: Id;
        invite_role: InviteRole;
        sent_at: string;
        ledger_id: Id;
        ledger_name: string;
        ledger_icon: string;
        period_start: string;
        period_end: string;
      }
    >();
  return rows.results.map((row) => ({
    id: row.invite_id,
    ledger: {
      id: row.ledger_id,
      name: row.ledger_name,
      icon: row.ledger_icon,
      period: { start: row.period_start, end: row.period_end },
    },
    from: toProfile(row),
    role: row.invite_role,
    sentAt: row.sent_at,
  }));
}

/**
 * Members of the user's ledgers (all, or the given ones: at most 90), with pending invitees on
 * the ledgers the user owns.
 */
export async function loadLedgerMembers(db: D1Database, me: Id, ledgerIds?: Id[]) {
  const only = ledgerIds ? ` AND m.ledger_id IN (${ledgerIds.map(() => '?').join(', ')})` : '';
  const [memberRows, pendingRows] = await Promise.all([
    db
      .prepare(
        `SELECT o.ledger_id, o.role, u.* FROM ledger_members o
         JOIN ledger_members m ON m.ledger_id = o.ledger_id JOIN users u ON u.id = o.user_id
         WHERE m.user_id = ?${only}`,
      )
      .bind(me, ...(ledgerIds ?? []))
      .all<UserRow & { ledger_id: Id; role: LedgerMember['role'] }>(),
    db
      .prepare(
        `SELECT i.ledger_id, i.role, u.* FROM ledger_invites i
         JOIN ledger_members m ON m.ledger_id = i.ledger_id AND m.role = 'owner'
         JOIN users u ON u.id = i.invitee_id WHERE m.user_id = ?${only}`,
      )
      .bind(me, ...(ledgerIds ?? []))
      .all<UserRow & { ledger_id: Id; role: InviteRole }>(),
  ]);
  const ledgerMembers: NonNullable<AppData['ledgerMembers']> = {};
  for (const row of memberRows.results)
    (ledgerMembers[row.ledger_id] ??= []).push({ profile: toProfile(row), role: row.role });
  for (const row of pendingRows.results)
    (ledgerMembers[row.ledger_id] ??= []).push({
      profile: toProfile(row),
      role: row.role,
      invited: true,
    });
  return ledgerMembers;
}

/** The user's signup link, made on first use. */
export async function loadSignupLink(db: D1Database, me: Id): Promise<SignupLink> {
  const link =
    (await db
      .prepare('SELECT * FROM signup_links WHERE owner_id = ?')
      .bind(me)
      .first<{ token: string; expires_at: string; joined: number }>()) ??
    (await renewSignupLink(db, me));
  return {
    // A path: the client adds its own origin.
    url: `/join/${link.token}`,
    expiresAt: link.expires_at,
    joined: link.joined,
    limit: LINK_LIMIT,
  };
}

/** Friends, invitations, the signup link and the members of the user's ledgers. */
export async function loadPeople(
  db: D1Database,
  me: Id,
  ledgerIds?: Id[],
): Promise<Pick<AppData, 'friends' | 'invites' | 'signupLink' | 'ledgerMembers'>> {
  const [friends, invites, signupLink, ledgerMembers] = await Promise.all([
    loadFriends(db, me),
    loadInvites(db, me),
    loadSignupLink(db, me),
    loadLedgerMembers(db, me, ledgerIds),
  ]);
  return { friends, invites, signupLink, ledgerMembers };
}

/** A new signup link; the old one stops working. */
export async function renewSignupLink(db: D1Database, me: Id) {
  const link = {
    token: token(),
    expires_at: new Date(Date.now() + LINK_DAYS * DAY).toISOString().slice(0, 10),
    joined: 0,
  };
  await db.batch([
    db
      .prepare(
        `INSERT INTO signup_links (owner_id, token, expires_at, joined, created_at) VALUES (?1, ?2, ?3, 0, ?4)
         ON CONFLICT (owner_id) DO UPDATE SET token = ?2, expires_at = ?3, joined = 0, created_at = ?4`,
      )
      .bind(me, link.token, link.expires_at, new Date().toISOString()),
    change(db, { kind: 'me', id: me, userId: me }),
  ]);
  return link;
}

/** Log rows for everyone who shows this user's profile: themselves, their rooms, their friends. */
function profileChanged(db: D1Database, me: Id) {
  const at = new Date().toISOString();
  return [
    change(db, { kind: 'me', id: me, userId: me }),
    db
      .prepare(
        "INSERT INTO changes (kind, id, ledger_id, at) SELECT 'members', ledger_id, ledger_id, ? FROM ledger_members WHERE user_id = ?",
      )
      .bind(at, me),
    db
      .prepare(
        "INSERT INTO changes (kind, id, user_id, at) SELECT 'friends', user_id, user_id, ? FROM friendships WHERE other_id = ?",
      )
      .bind(at, me),
  ];
}

/** Display name, picture and handle. The handle changes at most once every 30 days. */
export async function putProfile(db: D1Database, data: Loaded, body: unknown) {
  const value = raw(body);
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (
    !isText(name, 20) ||
    !moods.includes(value.avatar as string) ||
    typeof value.handle !== 'string'
  )
    invalid('프로필');
  const handle = value.handle.trim().toLowerCase();
  const changing = handle !== data.user.handle;
  if (changing) {
    const problem = handleProblem(handle);
    if (problem) fail(400, 'INVALID_HANDLE', problem);
    if (data.user.handleChangeableFrom)
      fail(409, 'HANDLE_LOCKED', `${data.user.handleChangeableFrom}부터 아이디를 바꿀 수 있어요.`);
    if (await db.prepare('SELECT 1 FROM users WHERE handle = ?').bind(handle).first())
      fail(409, 'HANDLE_TAKEN', '이미 쓰는 아이디예요.');
  }
  await db.batch([
    db
      .prepare(
        `UPDATE users SET name = ?, avatar = ?, handle = ?,
           handle_changed_at = CASE WHEN ? THEN ? ELSE handle_changed_at END WHERE id = ?`,
      )
      .bind(name, value.avatar, handle, changing ? 1 : 0, new Date().toISOString(), data.user.id),
    ...profileChanged(db, data.user.id),
  ]);
}

const isPng = (bytes: Uint8Array) =>
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, at) => bytes[at] === byte);

/** A PNG the browser drew: no text or EXIF chunks, at most 1024px a side. */
function pngProblem(bytes: Uint8Array): string | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (text(12) !== 'IHDR') return 'PNG 사진이 아니에요.';
  const [width, height] = [view.getUint32(16), view.getUint32(20)];
  for (let at = 8; at + 8 <= bytes.length; at += 12 + view.getUint32(at)) {
    if (['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(text(at + 4)))
      return '사진 정보(메타데이터)가 남아 있어요.';
  }
  if (!width || !height || width > PHOTO_MAX_SIDE || height > PHOTO_MAX_SIDE)
    return '사진 크기를 읽을 수 없어요.';
}

/**
 * Accepts only a WebP or PNG the browser redrew (≤ 1MB, ≤ 1024px) with no EXIF, XMP or text
 * data, so no location or camera data is kept. It is served back only as an image.
 */
export function photoProblem(bytes: Uint8Array): string | undefined {
  if (bytes.length > PHOTO_MAX_BYTES) return '사진이 너무 커요.';
  if (isPng(bytes)) return pngProblem(bytes);
  const text = (at: number, length = 4) => String.fromCharCode(...bytes.subarray(at, at + length));
  const u32 = (at: number) =>
    bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24);
  const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
  if (bytes.length < 30 || text(0) !== 'RIFF' || text(8) !== 'WEBP') return 'WebP 사진이 아니에요.';
  let width = 0;
  let height = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const kind = text(at);
    const size = u32(at + 4) >>> 0;
    // A color profile (ICCP) is kept: browsers add sRGB, and it says nothing about the person.
    if (['EXIF', 'XMP '].includes(kind)) return '사진 정보(메타데이터)가 남아 있어요.';
    if (kind === 'VP8X') {
      width = u24(at + 12) + 1;
      height = u24(at + 15) + 1;
    } else if (kind === 'VP8 ') {
      width = (bytes[at + 14] | (bytes[at + 15] << 8)) & 0x3fff;
      height = (bytes[at + 16] | (bytes[at + 17] << 8)) & 0x3fff;
    } else if (kind === 'VP8L') {
      const bits = u32(at + 9) >>> 0;
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }
    at += 8 + size + (size % 2);
  }
  if (!width || !height || width > PHOTO_MAX_SIDE || height > PHOTO_MAX_SIDE)
    return '사진 크기를 읽을 수 없어요.';
}

export async function putPhoto(db: D1Database, data: Loaded, request: Request) {
  if (!['image/webp', 'image/png'].includes(request.headers.get('Content-Type') ?? ''))
    invalid('사진');
  const bytes = new Uint8Array(await request.arrayBuffer());
  const problem = photoProblem(bytes);
  if (problem) fail(400, 'INVALID_PHOTO', problem);
  const now = new Date();
  await db.batch([
    db
      .prepare(
        'INSERT INTO photos (user_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT (user_id) DO UPDATE SET data = ?2, updated_at = ?3',
      )
      .bind(data.user.id, bytes, now.toISOString()),
    db.prepare('UPDATE users SET photo_version = ? WHERE id = ?').bind(now.getTime(), data.user.id),
    ...profileChanged(db, data.user.id),
  ]);
}

export async function deletePhoto(db: D1Database, data: Loaded) {
  await db.batch([
    db.prepare('DELETE FROM photos WHERE user_id = ?').bind(data.user.id),
    db.prepare('UPDATE users SET photo_version = NULL WHERE id = ?').bind(data.user.id),
    ...profileChanged(db, data.user.id),
  ]);
}

/** A profile photo, as an image only; any signed-in user may see profile pictures. */
export async function getPhoto(db: D1Database, userId: Id) {
  const row = await db
    .prepare('SELECT data FROM photos WHERE user_id = ?')
    .bind(userId)
    .first<{ data: ArrayBuffer | number[] }>();
  if (!row) fail(404, 'NOT_FOUND', '사진이 없어요.');
  const bytes = new Uint8Array(row.data as ArrayBuffer);
  return new Response(bytes, {
    headers: {
      // The URL always ends in .webp for the client's safe-URL check; the bytes say which it is.
      'Content-Type': isPng(bytes) ? 'image/png' : 'image/webp',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Exact ID lookup. Someone who blocked this user is not found. */
export async function findPerson(db: D1Database, data: Loaded, handle: string) {
  const row = await db
    .prepare(
      `SELECT u.* FROM users u WHERE u.handle = ?1 AND u.id != ?2 AND NOT EXISTS (
         SELECT 1 FROM friendships b WHERE b.user_id = u.id AND b.other_id = ?2 AND b.status = 'blocked')`,
    )
    .bind(handle.trim().replace(/^@/, '').toLowerCase(), data.user.id)
    .first<UserRow>();
  return json({ profile: row ? toProfile(row) : null });
}

type FriendAction = 'request' | 'accept' | 'decline' | 'cancel' | 'remove' | 'block' | 'unblock';
const friendActions: readonly string[] = [
  'request',
  'accept',
  'decline',
  'cancel',
  'remove',
  'block',
  'unblock',
];

/** One friend action from this user's side; both sides' rows change together. */
export async function friendAction(db: D1Database, data: Loaded, otherId: Id, body: unknown) {
  const action = raw(body).action;
  if (!friendActions.includes(action as string) || otherId === data.user.id) invalid('친구');
  const me = data.user.id;
  const now = new Date().toISOString();
  const status = (from: Id, to: Id) =>
    db
      .prepare('SELECT status FROM friendships WHERE user_id = ? AND other_id = ?')
      .bind(from, to)
      .first<{ status: Friend['status'] }>()
      .then((row) => row?.status);
  const set = (from: Id, to: Id, value: Friend['status']) =>
    db
      .prepare(
        'INSERT INTO friendships (user_id, other_id, status, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (user_id, other_id) DO UPDATE SET status = ?3',
      )
      .bind(from, to, value, now);
  const drop = (from: Id, to: Id) =>
    db.prepare('DELETE FROM friendships WHERE user_id = ? AND other_id = ?').bind(from, to);
  const [mine, theirs] = await Promise.all([status(me, otherId), status(otherId, me)]);
  if (!(await db.prepare('SELECT 1 FROM users WHERE id = ?').bind(otherId).first()))
    fail(404, 'NOT_FOUND', '없는 사람이에요.');
  // Both lists are read again; each shows only its owner's own rows.
  const run = (...statements: D1PreparedStatement[]) =>
    db.batch([
      ...statements,
      change(db, { kind: 'friends', id: me, userId: me }),
      change(db, { kind: 'friends', id: otherId, userId: otherId }),
    ]);
  switch (action as FriendAction) {
    case 'request':
      if (mine === 'blocked') fail(409, 'BLOCKED', '차단을 풀어야 요청할 수 있어요.');
      if (mine === 'incoming') return run(set(me, otherId, 'friend'), set(otherId, me, 'friend'));
      if (mine) return;
      // Someone who blocked this user never sees the request; the sender is not told.
      return theirs === 'blocked'
        ? run(set(me, otherId, 'outgoing'))
        : run(set(me, otherId, 'outgoing'), set(otherId, me, 'incoming'));
    case 'accept':
      if (mine !== 'incoming') fail(409, 'NOT_REQUESTED', '받은 요청이 없어요.');
      return run(set(me, otherId, 'friend'), set(otherId, me, 'friend'));
    case 'decline':
    case 'cancel':
    case 'remove':
      if (mine === 'blocked') return;
      return run(drop(me, otherId), ...(theirs === 'blocked' ? [] : [drop(otherId, me)]));
    case 'block':
      return run(set(me, otherId, 'blocked'), ...(theirs === 'blocked' ? [] : [drop(otherId, me)]));
    case 'unblock':
      if (mine === 'blocked') return run(drop(me, otherId));
  }
}

const isFriend = (data: Loaded, id: Id) =>
  data.friends?.some((friend) => friend.profile.id === id && friend.status === 'friend');

/**
 * The owner invites friends to a ledger that holds records; for a parent, to every ledger below
 * it that the owner owns (하위 전부 공유). Current members are skipped.
 */
export async function inviteMembers(db: D1Database, data: Loaded, ledgerId: Id, body: unknown) {
  const value = raw(body);
  const ids = list(value.profileIds);
  if (!roles.includes(value.role as string) || !ids.every(isId) || !unique(ids) || !ids.length)
    invalid('초대');
  if (data.roles.get(ledgerId) !== 'owner') fail(403, 'FORBIDDEN', '소유자만 초대할 수 있어요.');
  if (!ids.every((id) => isFriend(data, id))) fail(403, 'FORBIDDEN', '친구만 초대할 수 있어요.');
  const ledger = data.ledgers.find((item) => item.id === ledgerId)!;
  const targets = leafLedgers(data.ledgers, ledger).filter(
    (leaf) => data.roles.get(leaf.id) === 'owner',
  );
  const now = new Date().toISOString();
  const invites = targets.flatMap((target) =>
    ids
      .filter((id) => !data.ledgerMembers?.[target.id]?.some((member) => member.profile.id === id))
      .map((id) => ({ ledgerId: target.id, id })),
  );
  if (!invites.length) return;
  await db.batch([
    ...invites.map(({ ledgerId, id }) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO ledger_invites (id, ledger_id, invitee_id, inviter_id, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(crypto.randomUUID(), ledgerId, id, data.user.id, value.role, now),
    ),
    ...[...new Set(invites.map((invite) => invite.ledgerId))].map((id) =>
      change(db, { kind: 'members', id, ledgerId: id }),
    ),
    ...[...new Set(invites.map((invite) => invite.id))].map((id) =>
      change(db, { kind: 'invites', id, userId: id }),
    ),
  ]);
}

/** The owner changes a member's or invitee's role. */
export async function setMemberRole(
  db: D1Database,
  data: Loaded,
  ledgerId: Id,
  userId: Id,
  body: unknown,
) {
  const role = raw(body).role;
  if (!roles.includes(role as string)) invalid('권한');
  if (data.roles.get(ledgerId) !== 'owner' || userId === data.user.id)
    fail(403, 'FORBIDDEN', '소유자만 다른 멤버의 권한을 바꿀 수 있어요.');
  await db.batch([
    db
      .prepare(
        "UPDATE ledger_members SET role = ? WHERE ledger_id = ? AND user_id = ? AND role != 'owner'",
      )
      .bind(role, ledgerId, userId),
    db
      .prepare('UPDATE ledger_invites SET role = ? WHERE ledger_id = ? AND invitee_id = ?')
      .bind(role, ledgerId, userId),
    change(db, { kind: 'members', id: ledgerId, ledgerId }),
    change(db, { kind: 'ledger', id: ledgerId, userId }),
    change(db, { kind: 'invites', id: userId, userId }),
  ]);
}

/**
 * The owner removes a member or withdraws an invitation; a member who is not the owner leaves.
 * Whoever goes also loses the links from their own parents to the ledger.
 */
export async function removeMember(db: D1Database, data: Loaded, ledgerId: Id, userId: Id) {
  const leaving = userId === data.user.id;
  const role = data.roles.get(ledgerId);
  if (leaving ? !role || role === 'owner' : role !== 'owner')
    fail(
      403,
      'FORBIDDEN',
      leaving ? '소유자는 가계부를 나갈 수 없어요.' : '소유자만 내보낼 수 있어요.',
    );
  await db.batch([
    db
      .prepare(
        `DELETE FROM ledger_children WHERE child_id = ?1 AND parent_id IN (
           SELECT ledger_id FROM ledger_members WHERE user_id = ?2 AND role = 'owner')`,
      )
      .bind(ledgerId, userId),
    db
      .prepare("DELETE FROM ledger_members WHERE ledger_id = ? AND user_id = ? AND role != 'owner'")
      .bind(ledgerId, userId),
    db
      .prepare('DELETE FROM ledger_invites WHERE ledger_id = ? AND invitee_id = ?')
      .bind(ledgerId, userId),
    change(db, { kind: 'members', id: ledgerId, ledgerId }),
    // Whoever went reads the ledger as gone and drops it.
    change(db, { kind: 'ledger', id: ledgerId, userId }),
    change(db, { kind: 'invites', id: userId, userId }),
  ]);
}

/** Accepting joins the ledger with the invited role, optionally under the user's own parents. */
export async function acceptInvite(db: D1Database, data: Loaded, inviteId: Id, body: unknown) {
  const invite = data.invites?.find((item) => item.id === inviteId);
  if (!invite) fail(404, 'NOT_FOUND', '없는 초대예요.');
  const parentIds = list(raw(body).parentIds ?? []);
  if (
    !parentIds.every(isId) ||
    !unique(parentIds) ||
    parentIds.length > 90 ||
    !parentIds.every((id) => data.roles.get(id) === 'owner') ||
    // A parent holds no records of its own.
    (parentIds.length &&
      (await db
        .prepare(
          `SELECT 1 FROM records WHERE ledger_id IN (${parentIds.map(() => '?').join(', ')}) LIMIT 1`,
        )
        .bind(...parentIds)
        .first()))
  )
    invalid('상위 가계부');
  await db.batch([
    db
      .prepare(
        'INSERT OR IGNORE INTO ledger_members (ledger_id, user_id, role, seen_at) VALUES (?, ?, ?, ?)',
      )
      .bind(invite.ledger.id, data.user.id, invite.role, new Date().toISOString()),
    ...parentIds.map((parentId) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO ledger_children (parent_id, child_id, position)
           SELECT ?1, ?2, COALESCE(MAX(position) + 1, 0) FROM ledger_children WHERE parent_id = ?1`,
        )
        .bind(parentId, invite.ledger.id),
    ),
    db.prepare('DELETE FROM ledger_invites WHERE id = ?').bind(inviteId),
    change(db, { kind: 'ledger', id: invite.ledger.id, userId: data.user.id }),
    change(db, { kind: 'members', id: invite.ledger.id, ledgerId: invite.ledger.id }),
    change(db, { kind: 'invites', id: data.user.id, userId: data.user.id }),
    ...(parentIds as Id[]).map((parentId) =>
      change(db, { kind: 'ledger', id: parentId, ledgerId: parentId }),
    ),
  ]);
}

export async function declineInvite(db: D1Database, data: Loaded, inviteId: Id) {
  const invite = data.invites?.find((item) => item.id === inviteId);
  if (!invite) fail(404, 'NOT_FOUND', '없는 초대예요.');
  await db.batch([
    db.prepare('DELETE FROM ledger_invites WHERE id = ?').bind(inviteId),
    change(db, { kind: 'members', id: invite.ledger.id, ledgerId: invite.ledger.id }),
    change(db, { kind: 'invites', id: data.user.id, userId: data.user.id }),
  ]);
}

/** Opening a room clears its new-record badge. */
export async function markSeen(db: D1Database, data: Loaded, ledgerId: Id) {
  if (!data.roles.has(ledgerId)) fail(404, 'NOT_FOUND', '없는 가계부예요.');
  await db.batch([
    db
      .prepare('UPDATE ledger_members SET seen_at = ? WHERE ledger_id = ? AND user_id = ?')
      .bind(new Date().toISOString(), ledgerId, data.user.id),
    change(db, { kind: 'seen', id: ledgerId, userId: data.user.id }),
  ]);
}
