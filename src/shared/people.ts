/**
 * Accounts, friends and ledger members (docs/ledger-baseline.md §7). Being friends grants
 * nothing; a ledger is opened only through membership, after the invitee accepts.
 */
import type { Id, IsoDate, Ledger } from './ledger';

/** What others may see of an account: ID, display name and avatar (a UgaAvatar mood). */
export type Profile = { id: Id; handle: string; name: string; avatar: string };

/** `incoming`/`outgoing` are requests waiting for an answer. */
export type Friend = { profile: Profile; status: 'friend' | 'incoming' | 'outgoing' | 'blocked' };

/** Owner: everything. Editor: records and new tag options. Viewer: reading. */
export type MemberRole = 'owner' | 'editor' | 'viewer';
export type InviteRole = Exclude<MemberRole, 'owner'>;

/** A member of a ledger that holds records; `invited` has no access until accepting. */
export type LedgerMember = { profile: Profile; role: MemberRole; invited?: boolean };

/** A ledger invitation waiting for this user's answer. */
export type RoomInvite = {
  id: Id;
  ledger: Pick<Ledger, 'id' | 'name' | 'icon' | 'period'>;
  from: Profile;
  role: InviteRole;
  /** ISO timestamp. */
  sentAt: string;
};

/** The signup link joins the service only and never opens a ledger. */
export type SignupLink = { url: string; expiresAt: IsoDate; joined: number; limit: number };

export const HANDLE_RULE = '영문 소문자·숫자·밑줄 4–20자';
const RESERVED_HANDLES = ['admin', 'root', 'support', 'help', 'system', 'official', 'uga', 'api'];

/** Why a handle cannot be used; undefined when it can. Whether it is taken is the server's answer. */
export function handleProblem(handle: string): string | undefined {
  if (!/^[a-z0-9_]{4,20}$/.test(handle)) return `아이디는 ${HANDLE_RULE}로 정해 주세요.`;
  if (RESERVED_HANDLES.includes(handle)) return '쓸 수 없는 아이디예요.';
}
