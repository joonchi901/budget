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
