import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  AvatarPicker,
  FriendList,
  FriendPicker,
  MemberList,
  RoomInviteRow,
} from '../../client/ledger';
import { List } from '../../client/ui';
import type { LedgerMember } from '../../shared/people';
import { FIXTURE_TODAY, friends, invites, me, minho, tripMembers, yedi } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/People',
  component: FriendList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '사람 블록. FriendList는 받은 요청·친구·보낸 요청·차단을 나눠 보여주고, MemberList는 가계부 멤버와 권한(소유자만 바꿈), FriendPicker는 초대할 친구, AvatarPicker는 우가 프로필 그림, RoomInviteRow는 받은 가계부 초대입니다. 친구라는 사실만으로는 어떤 가계부도 보이지 않습니다.',
      },
    },
  },
  args: {
    friends,
    onAccept: () => {},
    onDecline: () => {},
    onCancel: () => {},
    onRemove: () => {},
    onBlock: () => {},
    onUnblock: () => {},
  },
} satisfies Meta<typeof FriendList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Friends: Story = {
  render: function Controlled(args) {
    const [list, setList] = useState(args.friends);
    const set = (id: string, status?: (typeof list)[number]['status']) =>
      setList((all) =>
        status
          ? all.map((item) => (item.profile.id === id ? { ...item, status } : item))
          : all.filter((item) => item.profile.id !== id),
      );
    return (
      <div style={{ maxWidth: 390, display: 'grid', gap: 24 }}>
        <FriendList
          {...args}
          friends={list}
          onAccept={(profile) => set(profile.id, 'friend')}
          onDecline={(profile) => set(profile.id)}
          onCancel={(profile) => set(profile.id)}
          onRemove={(profile) => set(profile.id)}
          onBlock={(profile) => set(profile.id, 'blocked')}
          onUnblock={(profile) => set(profile.id)}
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '수락' }));
    await expect(c.queryByRole('list', { name: '받은 친구 요청' })).toBeNull();
    await expect(c.getByRole('list', { name: '친구' })).toHaveTextContent('예미');
    await userEvent.click(c.getByRole('button', { name: '민호 메뉴' }));
    await userEvent.click(page.getByRole('menuitem', { name: '차단' }));
    await expect(c.getByRole('list', { name: '차단한 사람' })).toHaveTextContent('민호');
  },
};

export const MembersAsOwner: Story = {
  render: function Controlled() {
    const [members, setMembers] = useState<LedgerMember[]>(tripMembers);
    return (
      <div style={{ maxWidth: 390 }}>
        <MemberList
          members={members}
          meId={me.id}
          canManage
          onRoleChange={(profile, role) =>
            setMembers((all) =>
              all.map((item) => (item.profile.id === profile.id ? { ...item, role } : item)),
            )
          }
          onRemove={(profile) =>
            setMembers((all) => all.filter((item) => item.profile.id !== profile.id))
          }
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(c.getByRole('list', { name: '멤버' })).toHaveTextContent('초대함 · 보기');
    await userEvent.click(c.getByRole('button', { name: `${yedi.name} 메뉴` }));
    await userEvent.click(page.getByRole('menuitem', { name: '보기로 바꾸기' }));
    await expect(c.getAllByRole('listitem')[1]).toHaveTextContent('보기');
    await userEvent.click(c.getByRole('button', { name: `${minho.name} 메뉴` }));
    await userEvent.click(page.getByRole('menuitem', { name: '초대 취소' }));
    await expect(c.queryByText(minho.name)).toBeNull();
  },
};

export const MembersAsEditor: Story = {
  render: () => (
    <div style={{ maxWidth: 390 }}>
      <MemberList
        members={tripMembers}
        meId={yedi.id}
        canManage={false}
        onRoleChange={() => {}}
        onRemove={() => {}}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.queryByRole('button', { name: /메뉴/ })).toBeNull();
    await expect(c.getAllByRole('listitem')[1]).toHaveTextContent('@yedi_kim · 나');
  },
};

export const PickFriends: Story = {
  render: function Controlled() {
    const [value, setValue] = useState<string[]>([]);
    return (
      <div style={{ maxWidth: 390 }}>
        <FriendPicker
          label="초대할 친구"
          friends={[yedi, minho]}
          value={value}
          onValueChange={setValue}
        />
        <p role="status">{value.join(',')}</p>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('checkbox', { name: /민호/ }));
    await expect(c.getByRole('status')).toHaveTextContent(minho.id);
  },
};

export const Avatar: Story = {
  render: function Controlled() {
    const [value, setValue] = useState('happy');
    return (
      <>
        <AvatarPicker value={value} onValueChange={setValue} />
        <p role="status">{value}</p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '조는 우가' }));
    await expect(c.getByRole('status')).toHaveTextContent('sleep');
  },
};

export const Invite: Story = {
  render: () => (
    <div style={{ maxWidth: 390 }}>
      <List aria-label="받은 초대">
        <RoomInviteRow invite={invites[0]} today={FIXTURE_TODAY} onOpen={() => {}} />
      </List>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: /제주 여행/ }),
    ).toHaveTextContent('예미님이 편집 권한으로 초대했어요');
  },
};
