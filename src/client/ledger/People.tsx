import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { UGA_MOODS, UgaAvatar, UgaIcon, type UgaIconName, type UgaMood } from '../brand/Uga';
import {
  Button,
  Checkbox,
  Field,
  IconButton,
  Inline,
  List,
  ListRow,
  Menu,
  SegmentedControl,
  type MenuItem,
} from '../ui';
import type { Id, IsoDate } from '../../shared/ledger';
import type {
  Friend,
  InviteRole,
  LedgerMember,
  MemberRole,
  Profile,
  RoomInvite,
} from '../../shared/people';
import { whenLabel } from './format';

export const roleLabel: Record<MemberRole, string> = {
  owner: '소유자',
  editor: '편집',
  viewer: '보기',
};

/** One person: avatar, display name and @ID. */
export function PersonRow({
  profile,
  description = `@${profile.handle}`,
  trailing,
  onClick,
}: {
  profile: Profile;
  description?: string;
  trailing?: ReactNode;
  onClick?(): void;
}) {
  return (
    <ListRow
      leading={<UgaAvatar mood={profile.avatar} size={40} />}
      title={profile.name}
      description={description}
      trailing={trailing}
      onClick={onClick}
    />
  );
}

const moodLabels: Record<UgaMood, string> = {
  happy: '웃는 우가',
  calm: '차분한 우가',
  surprise: '놀란 우가',
  sleep: '조는 우가',
};

/** The profile picture: one of the Uga avatars, so nothing uploaded reaches other people. */
export function AvatarPicker({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange(value: UgaMood): void;
}) {
  return (
    <SegmentedControl<UgaMood>
      aria-label="프로필 그림"
      className="ledger-avatar-picker"
      value={(UGA_MOODS as readonly string[]).includes(value) ? (value as UgaMood) : 'happy'}
      onValueChange={onValueChange}
      options={UGA_MOODS.map((mood) => ({
        value: mood,
        label: (
          <>
            <UgaAvatar mood={mood} size={44} />
            <span className="sr-only">{moodLabels[mood]}</span>
          </>
        ),
      }))}
    />
  );
}

function RowMenu({ name, items }: { name: string; items: MenuItem[] }) {
  return (
    <Menu
      label={`${name} 메뉴`}
      items={items}
      trigger={(props) => (
        <IconButton {...props} aria-label={`${name} 메뉴`}>
          <MoreHorizontal size={20} />
        </IconButton>
      )}
    />
  );
}

/**
 * Friends by state: requests to answer first, then friends, sent requests and blocked people.
 * Being friends only makes inviting easy; it shows nothing of anyone's ledgers.
 */
export function FriendList({
  friends,
  onAccept,
  onDecline,
  onCancel,
  onRemove,
  onBlock,
  onUnblock,
}: {
  friends: Friend[];
  onAccept(profile: Profile): void;
  onDecline(profile: Profile): void;
  onCancel(profile: Profile): void;
  onRemove(profile: Profile): void;
  onBlock(profile: Profile): void;
  onUnblock(profile: Profile): void;
}) {
  const sections: {
    status: Friend['status'];
    title: string;
    trailing(profile: Profile): ReactNode;
  }[] = [
    {
      status: 'incoming',
      title: '받은 친구 요청',
      trailing: (profile) => (
        <Inline gap={1} wrap={false}>
          <Button variant="plain" onClick={() => onDecline(profile)}>
            거절
          </Button>
          <Button variant="primary" onClick={() => onAccept(profile)}>
            수락
          </Button>
        </Inline>
      ),
    },
    {
      status: 'friend',
      title: '친구',
      trailing: (profile) => (
        <RowMenu
          name={profile.name}
          items={[
            { label: '친구 삭제', onSelect: () => onRemove(profile) },
            { label: '차단', tone: 'danger', onSelect: () => onBlock(profile) },
          ]}
        />
      ),
    },
    {
      status: 'outgoing',
      title: '보낸 요청',
      trailing: (profile) => (
        <Button variant="plain" onClick={() => onCancel(profile)}>
          요청 취소
        </Button>
      ),
    },
    {
      status: 'blocked',
      title: '차단한 사람',
      trailing: (profile) => (
        <Button variant="plain" onClick={() => onUnblock(profile)}>
          차단 해제
        </Button>
      ),
    },
  ];
  return (
    <>
      {sections.map((section) => {
        const people = friends.filter((friend) => friend.status === section.status);
        return (
          people.length > 0 && (
            <section key={section.status} className="ledger-people-section">
              <h2>
                {section.title} <span>{people.length}</span>
              </h2>
              <List aria-label={section.title}>
                {people.map(({ profile }) => (
                  <PersonRow
                    key={profile.id}
                    profile={profile}
                    trailing={section.trailing(profile)}
                  />
                ))}
              </List>
            </section>
          )
        );
      })}
    </>
  );
}

/**
 * A ledger's members. The owner can switch others between 편집 and 보기, cancel invitations and
 * remove members; everyone else only sees who is in.
 */
export function MemberList({
  members,
  meId,
  canManage,
  onRoleChange,
  onRemove,
}: {
  members: LedgerMember[];
  meId: Id;
  canManage: boolean;
  onRoleChange(profile: Profile, role: InviteRole): void;
  onRemove(profile: Profile): void;
}) {
  return (
    <List aria-label="멤버">
      {members.map(({ profile, role, invited }) => {
        const other: InviteRole = role === 'editor' ? 'viewer' : 'editor';
        return (
          <PersonRow
            key={profile.id}
            profile={profile}
            description={`@${profile.handle}${profile.id === meId ? ' · 나' : ''}`}
            trailing={
              <Inline gap={1} align="center" wrap={false}>
                <span className="ledger-member-role">
                  {invited ? `초대함 · ${roleLabel[role]}` : roleLabel[role]}
                </span>
                {canManage && role !== 'owner' && (
                  <RowMenu
                    name={profile.name}
                    items={[
                      ...(invited
                        ? []
                        : [
                            {
                              label: `${roleLabel[other]}로 바꾸기`,
                              onSelect: () => onRoleChange(profile, other),
                            },
                          ]),
                      {
                        label: invited ? '초대 취소' : '내보내기',
                        tone: 'danger' as const,
                        onSelect: () => onRemove(profile),
                      },
                    ]}
                  />
                )}
              </Inline>
            }
          />
        );
      })}
    </List>
  );
}

/** Choosing friends to invite. People already in the ledger are not offered. */
export function FriendPicker({
  label,
  friends,
  value,
  onValueChange,
}: {
  label: string;
  friends: Profile[];
  value: Id[];
  onValueChange(value: Id[]): void;
}) {
  return (
    <fieldset className="ledger-friend-picker">
      <legend>{label}</legend>
      <List aria-label={label}>
        {friends.map((profile) => (
          <li key={profile.id} className="ui-list-item">
            <Field className="ledger-friend-option">
              <Checkbox
                checked={value.includes(profile.id)}
                onChange={(event) =>
                  onValueChange(
                    event.target.checked
                      ? [...value, profile.id]
                      : value.filter((id) => id !== profile.id),
                  )
                }
              />
              <UgaAvatar mood={profile.avatar} size={36} />
              <span>
                {profile.name} <small>@{profile.handle}</small>
              </span>
            </Field>
          </li>
        ))}
      </List>
    </fieldset>
  );
}

/** A ledger invitation waiting for an answer. */
export function RoomInviteRow({
  invite,
  today,
  onOpen,
}: {
  invite: RoomInvite;
  today: IsoDate;
  onOpen(): void;
}) {
  return (
    <ListRow
      leading={<UgaIcon name={invite.ledger.icon as UgaIconName} size={36} />}
      title={invite.ledger.name}
      description={`${invite.from.name}님이 ${roleLabel[invite.role]} 권한으로 초대했어요`}
      trailing={<span>{whenLabel(invite.sentAt, today)}</span>}
      onClick={onOpen}
    />
  );
}
