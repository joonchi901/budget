import { useState } from 'react';
import { UgaIcon, type UgaIconName } from '../brand/Uga';
import {
  FriendPicker,
  MemberList,
  ParentPicker,
  PersonRow,
  periodLabel,
  roleLabel,
} from '../ledger';
import { FullScreenSheet } from '../templates';
import { Button, List, ListRow, SegmentedControl, Stack } from '../ui';
import type { Id, Ledger } from '../../shared/ledger';
import type { InviteRole, LedgerMember, Profile, RoomInvite } from '../../shared/people';

const roleHelp: Record<InviteRole, string> = {
  editor: '내역을 적고 고치며 태그를 더할 수 있어요.',
  viewer: '내역을 보기만 해요.',
};

function InviteFields({
  friends,
  value,
  onValueChange,
  role,
  onRoleChange,
  onFindFriends,
}: {
  friends: Profile[];
  value: Id[];
  onValueChange(value: Id[]): void;
  role: InviteRole;
  onRoleChange(role: InviteRole): void;
  onFindFriends?(): void;
}) {
  if (!friends.length)
    return (
      <Stack gap={3}>
        <p className="muted">초대할 친구가 없어요. 친구에서 먼저 친구를 추가해 주세요.</p>
        {onFindFriends && <Button onClick={onFindFriends}>친구 찾기</Button>}
      </Stack>
    );
  return (
    <Stack gap={4}>
      <FriendPicker
        label="초대할 친구"
        friends={friends}
        value={value}
        onValueChange={onValueChange}
      />
      <Stack gap={2}>
        <SegmentedControl<InviteRole>
          aria-label="권한"
          value={role}
          onValueChange={onRoleChange}
          options={[
            { value: 'editor', label: roleLabel.editor },
            { value: 'viewer', label: roleLabel.viewer },
          ]}
        />
        <p className="view-meta">{roleHelp[role]}</p>
      </Stack>
    </Stack>
  );
}

/**
 * Who shares a ledger. The owner invites friends as 편집 or 보기, changes roles and removes
 * people; anyone else sees the members and may leave. A parent is never shared itself: from it,
 * friends are invited at once to the ledgers below that this user owns.
 */
export function LedgerMembersView({
  ledger,
  meId,
  members,
  below,
  friends,
  onInvite,
  onRoleChange,
  onRemove,
  onLeave,
  onFindFriends,
  onClose,
}: {
  ledger: Ledger;
  meId: Id;
  /** Members of a ledger that holds records; for a parent, only its owner unless shared before. */
  members: LedgerMember[];
  /** For a parent: the ledgers below it and whether this user owns each. */
  below?: { ledger: Ledger; owned: boolean }[];
  /** Accepted friends. */
  friends: Profile[];
  onInvite(result: { profileIds: Id[]; role: InviteRole }): void;
  onRoleChange(profile: Profile, role: InviteRole): void;
  onRemove(profile: Profile): void;
  onLeave(): void;
  /** Opens 친구, offered when there is no one to invite yet. */
  onFindFriends?(): void;
  onClose(): void;
}) {
  const [picked, setPicked] = useState<Id[]>([]);
  const [role, setRole] = useState<InviteRole>('editor');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const owner =
    below !== undefined ||
    members.some((item) => item.profile.id === meId && item.role === 'owner');
  const candidates = friends.filter(
    (friend) => !members.some((member) => member.profile.id === friend.id),
  );
  const owned = below?.filter((item) => item.owned) ?? [];
  const leftover = members.filter((item) => item.profile.id !== meId);
  const invite = (
    <Button
      variant="primary"
      disabled={!picked.length || (below !== undefined && !owned.length)}
      onClick={() => {
        onInvite({ profileIds: picked, role });
        setPicked([]);
      }}
    >
      {picked.length ? `${picked.length}명 초대` : '초대'}
    </Button>
  );
  return (
    <FullScreenSheet
      title={below ? '하위 전부 공유' : '멤버'}
      subtitle={ledger.name}
      dirty={picked.length > 0}
      onClose={onClose}
      footer={
        owner ? (
          invite
        ) : (
          <Button
            className="view-danger"
            onClick={() => (confirmLeave ? onLeave() : setConfirmLeave(true))}
          >
            {confirmLeave ? '한 번 더 누르면 나가요' : '이 가계부에서 나가기'}
          </Button>
        )
      }
    >
      <Stack gap={6}>
        {below ? (
          <Stack gap={3}>
            <p className="muted">
              내가 만든 하위 가계부 {owned.length}개에 한 번에 초대해요. 상위 가계부는 나에게만
              보여요.
            </p>
            <List aria-label="함께 공유할 가계부">
              {below.map((item) => (
                <ListRow
                  key={item.ledger.id}
                  leading={<UgaIcon name={item.ledger.icon as UgaIconName} size={32} />}
                  title={item.ledger.name}
                  description={item.owned ? '함께 공유해요' : '다른 사람이 만든 가계부라 빠져요'}
                />
              ))}
            </List>
            {/* Before parents became their owner's alone, an empty one could be shared itself. */}
            {leftover.length > 0 && (
              <>
                <h3>상위 가계부에 직접 초대된 사람</h3>
                <p className="muted">
                  예전에 이 상위 가계부로 초대된 사람이에요. 내보낼 수 있어요.
                </p>
                <MemberList members={leftover} meId={meId} canManage onRemove={onRemove} />
              </>
            )}
          </Stack>
        ) : (
          <Stack gap={3}>
            <h3>멤버 {members.length}명</h3>
            <MemberList
              members={members}
              meId={meId}
              canManage={owner}
              onRoleChange={onRoleChange}
              onRemove={onRemove}
            />
          </Stack>
        )}
        {owner && (
          <InviteFields
            friends={below ? friends : candidates}
            value={picked}
            onValueChange={setPicked}
            role={role}
            onRoleChange={setRole}
            onFindFriends={onFindFriends}
          />
        )}
      </Stack>
    </FullScreenSheet>
  );
}

/**
 * Answering a ledger invitation. Accepting opens the ledger with the offered role, and it can
 * go under this user's own parents at once, wherever the inviter keeps theirs.
 */
export function InviteAcceptView({
  invite,
  ledgers,
  onAccept,
  onDecline,
  onCreateParent,
  onClose,
}: {
  invite: RoomInvite;
  /** This user's ledgers, to choose parents. */
  ledgers: Ledger[];
  onAccept(result: { parentIds: Id[] }): void;
  onDecline(): void;
  onCreateParent?(name: string): Id;
  onClose(): void;
}) {
  const [parentIds, setParentIds] = useState<Id[]>([]);
  const self: Ledger = { ...invite.ledger, kinds: [], fields: [], childIds: [] };
  return (
    <FullScreenSheet
      title="가계부 초대"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onDecline}>거절</Button>
          <Button variant="primary" onClick={() => onAccept({ parentIds })}>
            수락
          </Button>
        </>
      }
    >
      <Stack gap={6}>
        <List aria-label="초대받은 가계부">
          <ListRow
            leading={<UgaIcon name={invite.ledger.icon as UgaIconName} size={40} />}
            title={invite.ledger.name}
            description={periodLabel(invite.ledger.period)}
          />
          <PersonRow
            profile={invite.from}
            description={`${roleLabel[invite.role]} 권한으로 초대했어요`}
          />
        </List>
        <p className="muted">{roleHelp[invite.role]}</p>
        <Stack gap={2}>
          <ParentPicker
            ledgers={ledgers}
            self={self}
            value={parentIds}
            onValueChange={setParentIds}
            onCreateParent={onCreateParent}
          />
          <p className="view-meta">내 상위 가계부에 넣으면 내 집계에 함께 더해져요.</p>
        </Stack>
      </Stack>
    </FullScreenSheet>
  );
}
