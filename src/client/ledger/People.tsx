import { useState, type ReactNode } from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { UGA_MOODS, UgaAvatar, UgaIcon, type UgaIconName, type UgaMood } from '../brand/Uga';
import {
  Button,
  Checkbox,
  Field,
  FileField,
  IconButton,
  Inline,
  List,
  ListRow,
  Menu,
  SegmentedControl,
  Stack,
  type MenuItem,
} from '../ui';
import type { Id, IsoDate } from '../../shared/ledger';
import {
  PHOTO_TYPES,
  isProfilePhotoUrl,
  photoProblem,
  type Friend,
  type InviteRole,
  type LedgerMember,
  type MemberRole,
  type Profile,
  type RoomInvite,
} from '../../shared/people';
import { whenLabel } from './format';

export const roleLabel: Record<MemberRole, string> = {
  owner: '소유자',
  editor: '편집',
  viewer: '보기',
};

/** A person's picture: their uploaded photo, else their Uga avatar. Decorative beside the name. */
export function ProfilePicture({
  profile,
  size,
}: {
  profile: Pick<Profile, 'avatar' | 'photo'>;
  size: number;
}) {
  return isProfilePhotoUrl(profile.photo) ? (
    <img
      className="ledger-profile-photo"
      src={profile.photo}
      alt=""
      width={size}
      height={size}
      draggable={false}
    />
  ) : (
    <UgaAvatar mood={profile.avatar} size={size} />
  );
}

/** One person: picture, display name and @ID. */
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
      leading={<ProfilePicture profile={profile} size={40} />}
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

export type PhotoChoice = { file: File; url: string };

/**
 * The profile picture: an uploaded photo (JPG, PNG or WebP up to 5MB; the server re-encodes it
 * and strips its metadata) or one of the four Uga pictures, which are also the default.
 * Without `onPhotoChange` only the Uga pictures are offered.
 */
export function AvatarPicker({
  value,
  onValueChange,
  photo,
  onPhotoChange,
}: {
  value: string;
  onValueChange(value: UgaMood): void;
  /** The current photo or its local preview, shown instead of the Uga picture. */
  photo?: string;
  /** A checked photo with its preview URL, or null to use the Uga picture again. */
  onPhotoChange?(photo: PhotoChoice | null): void;
}) {
  const [error, setError] = useState<string>();
  const mood = (UGA_MOODS as readonly string[]).includes(value) ? (value as UgaMood) : 'happy';
  const shownPhoto = isProfilePhotoUrl(photo) ? photo : undefined;
  return (
    <Stack gap={3} className="ledger-avatar-picker">
      {onPhotoChange && (
        <Inline gap={4} align="center" wrap={false}>
          <ProfilePicture profile={{ avatar: mood, photo: shownPhoto }} size={64} />
          <Stack gap={2} className="ledger-photo-actions">
            <Inline gap={2} align="center" wrap={false}>
              <FileField
                aria-label="프로필 사진 올리기"
                className="ledger-photo-upload"
                accept={PHOTO_TYPES.join(',')}
                buttonText="사진 올리기"
                emptyText=""
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  const problem = photoProblem(file);
                  setError(problem);
                  if (!problem) onPhotoChange({ file, url: URL.createObjectURL(file) });
                }}
              />
              {shownPhoto && (
                <IconButton
                  aria-label="사진 지우기"
                  onClick={() => {
                    setError(undefined);
                    onPhotoChange(null);
                  }}
                >
                  <Trash2 size={20} />
                </IconButton>
              )}
            </Inline>
            {error && (
              <p className="ledger-photo-error" role="alert">
                {error}
              </p>
            )}
          </Stack>
        </Inline>
      )}
      <SegmentedControl<UgaMood>
        aria-label={onPhotoChange ? '기본 그림' : '프로필 그림'}
        // While a photo is shown, no Uga picture is the selected one.
        value={shownPhoto ? ('' as UgaMood) : mood}
        onValueChange={(next) => {
          onValueChange(next);
          if (shownPhoto) onPhotoChange?.(null);
        }}
        options={UGA_MOODS.map((item) => ({
          value: item,
          label: (
            <>
              <UgaAvatar mood={item} size={44} />
              <span className="sr-only">{moodLabels[item]}</span>
            </>
          ),
        }))}
      />
    </Stack>
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
  /** Omit where a role means nothing, such as those let into a parent before. */
  onRoleChange?(profile: Profile, role: InviteRole): void;
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
                      ...(invited || !onRoleChange
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
              <ProfilePicture profile={profile} size={36} />
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
