/**
 * Accounts, friends and ledger members (docs/ledger-baseline.md §7). Being friends grants
 * nothing; a ledger is opened only through membership, after the invitee accepts.
 */
import type { Id, IsoDate, Ledger } from './ledger';

/**
 * What others may see of an account: ID, display name and picture. The picture is an uploaded
 * photo when there is one, else the chosen UgaAvatar mood.
 */
export type Profile = { id: Id; handle: string; name: string; avatar: string; photo?: string };

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

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Why a file cannot be a profile photo; undefined when it can. The server re-encodes it anyway. */
export function photoProblem(file: { type: string; size: number }): string | undefined {
  if (!PHOTO_TYPES.includes(file.type)) return 'JPG, PNG, WebP 사진만 올릴 수 있어요.';
  if (file.size > PHOTO_MAX_BYTES) return '5MB 이하 사진만 올릴 수 있어요.';
}

/**
 * A photo URL that may be drawn: a JPG, PNG or WebP this app's own origin serves, or a local
 * preview. Another member's saved value can never make every viewer load an outside address,
 * a data: URL or an SVG.
 */
export function isProfilePhotoUrl(url: string | undefined): url is string {
  if (!url) return false;
  if (url.startsWith('blob:')) return true;
  const here = globalThis.location?.href ?? 'http://localhost/';
  try {
    const parsed = new URL(url, here);
    return (
      parsed.origin === new URL(here).origin &&
      /\.(?:jpe?g|png|webp)$/i.test(parsed.pathname) &&
      !parsed.pathname.includes('..')
    );
  } catch {
    return false;
  }
}
