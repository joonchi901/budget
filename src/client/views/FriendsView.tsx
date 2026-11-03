import { useState, type ComponentProps, type ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { FriendList, PersonRow, RoomInviteRow } from '../ledger';
import { BottomSheet, Screen } from '../templates';
import { Button, Empty, Inline, Input, List, Stack, TextField } from '../ui';
import type { IsoDate } from '../../shared/ledger';
import type { Friend, Profile, RoomInvite, SignupLink } from '../../shared/people';

type FriendActions = Omit<ComponentProps<typeof FriendList>, 'friends'>;

const shortDay = (date: IsoDate) => {
  const [, month, day] = date.split('-').map(Number);
  return `${month}월 ${day}일`;
};

/**
 * The signup link. It only lets someone join, and they become friends with whoever sent it;
 * ledgers still need their own invitation. Making a new link ends the old one.
 */
export function SignupLinkSheet({
  link,
  onCopy,
  onRenew,
  onClose,
}: {
  link: SignupLink;
  onCopy(url: string): void;
  onRenew(): void;
  onClose(): void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmRenew, setConfirmRenew] = useState(false);
  return (
    <BottomSheet title="가입 초대 링크" onClose={onClose}>
      <Stack gap={4}>
        <p className="muted">
          링크로 가입한 사람은 나와 바로 친구가 돼요. 가계부는 따로 초대해야 보여요.
        </p>
        <Input aria-label="초대 링크" value={link.url} readOnly />
        <p className="view-meta">
          {shortDay(link.expiresAt)}까지 · {link.joined}/{link.limit}명 가입
        </p>
        {/* The consequence goes above the buttons so the button label stays short. */}
        {confirmRenew && (
          <p className="view-meta" role="status">
            새 링크를 만들면 지금 링크로는 더 가입할 수 없어요.
          </p>
        )}
        <Inline gap={2} wrap={false} className="view-actions">
          <Button
            className="view-danger"
            onClick={() => {
              if (!confirmRenew) return setConfirmRenew(true);
              setConfirmRenew(false);
              setCopied(false);
              onRenew();
            }}
          >
            {confirmRenew ? '새로 만들기' : '새 링크'}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onCopy(link.url);
              setCopied(true);
            }}
          >
            {copied ? '복사했어요' : '복사'}
          </Button>
        </Inline>
      </Stack>
    </BottomSheet>
  );
}

/**
 * Home's 친구 tab. Ledger invitations to answer come first, then finding someone by their exact
 * ID, then friends by state. The signup link is at the bottom.
 */
export function FriendsView({
  friends,
  invites,
  today,
  signupLink,
  tabBar,
  onFind,
  onRequest,
  onOpenInvite,
  onCopyLink,
  onRenewLink,
  ...actions
}: FriendActions & {
  friends: Friend[];
  invites: RoomInvite[];
  today: IsoDate;
  signupLink: SignupLink;
  /** The app's bottom tabs. */
  tabBar?: ReactNode;
  /** Exact ID lookup; null when no one has it. */
  onFind(handle: string): Promise<Profile | null>;
  onRequest(profile: Profile): void;
  onOpenInvite(invite: RoomInvite): void;
  onCopyLink(url: string): void;
  onRenewLink(): void;
}) {
  const [handle, setHandle] = useState('');
  const [found, setFound] = useState<{ handle: string; profile: Profile | null }>();
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const find = async () => {
    const query = handle.trim().replace(/^@/, '').toLowerCase();
    if (!query) return;
    setBusy(true);
    setFound({ handle: query, profile: await onFind(query) });
    setBusy(false);
  };
  const status = found?.profile
    ? friends.find((friend) => friend.profile.id === found.profile!.id)?.status
    : undefined;
  return (
    <Screen
      top={
        <div className="view-page-header">
          <h1>친구</h1>
        </div>
      }
      bottom={tabBar}
    >
      <Stack gap={6}>
        {invites.length > 0 && (
          <section className="ledger-people-section">
            <h2>
              받은 가계부 초대 <span>{invites.length}</span>
            </h2>
            <List aria-label="받은 가계부 초대">
              {invites.map((invite) => (
                <RoomInviteRow
                  key={invite.id}
                  invite={invite}
                  today={today}
                  onOpen={() => onOpenInvite(invite)}
                />
              ))}
            </List>
          </section>
        )}
        <Stack gap={3}>
          <Inline gap={2} align="end" wrap={false} className="view-find">
            <TextField
              label="아이디로 찾기"
              value={handle}
              placeholder="친구 아이디"
              autoCapitalize="none"
              onChange={(event) => setHandle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') find();
              }}
            />
            <Button busy={busy} onClick={find}>
              찾기
            </Button>
          </Inline>
          {found &&
            (found.profile ? (
              <List aria-label="찾은 사람">
                <PersonRow
                  profile={found.profile}
                  trailing={
                    status === 'friend' ? (
                      <span className="ledger-member-role">친구예요</span>
                    ) : status === 'outgoing' ? (
                      <span className="ledger-member-role">요청함</span>
                    ) : status === 'incoming' ? (
                      <Button variant="primary" onClick={() => actions.onAccept(found.profile!)}>
                        수락
                      </Button>
                    ) : (
                      <Button variant="primary" onClick={() => onRequest(found.profile!)}>
                        친구 요청
                      </Button>
                    )
                  }
                />
              </List>
            ) : (
              <p className="muted" role="status">
                @{found.handle}인 사람이 없어요. 아이디를 정확히 입력해 주세요.
              </p>
            ))}
        </Stack>
        {friends.length ? (
          <FriendList friends={friends} {...actions} />
        ) : (
          <Empty>아직 친구가 없어요. 아이디로 찾거나 가입 초대 링크를 보내 보세요.</Empty>
        )}
        <Button onClick={() => setLinkOpen(true)}>
          <Link2 size={18} />
          가입 초대 링크
        </Button>
      </Stack>
      {linkOpen && (
        <SignupLinkSheet
          link={signupLink}
          onCopy={onCopyLink}
          onRenew={onRenewLink}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </Screen>
  );
}
