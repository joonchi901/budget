import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HomeTabBar } from '../../client/ledger';
import { FriendsView } from '../../client/views';
import type { Friend, Profile } from '../../shared/people';
import {
  FIXTURE_TODAY,
  friends,
  invites,
  minho,
  seoyeon,
  signupLink,
  yedi,
  yemi,
} from '../fixtures';

const hana: Profile = { id: 'u6', handle: 'hana_lee', name: '하나', avatar: 'calm' };
const directory = [yedi, yemi, minho, seoyeon, hana];

const meta = {
  title: '06 Views · 화면/친구',
  component: FriendsView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '하단 탭의 친구 화면(답할 요청·초대 수는 탭 배지). 받은 가계부 초대를 먼저 보여주고, 아이디가 정확히 같을 때만 사람을 찾아 친구 요청을 보냅니다. 친구는 받은 요청·친구·보낸 요청·차단으로 나뉩니다. 맨 아래 가입 초대 링크는 서비스 가입용이며 가계부 권한은 주지 않습니다.',
      },
    },
  },
  args: {
    friends,
    invites,
    today: FIXTURE_TODAY,
    signupLink,
    tabBar: <HomeTabBar tab="friends" pending={2} onTabChange={() => {}} />,
    onFind: async () => null,
    onRequest: () => {},
    onOpenInvite: () => {},
    onCopyLink: () => {},
    onRenewLink: () => {},
    onAccept: () => {},
    onDecline: () => {},
    onCancel: () => {},
    onRemove: () => {},
    onBlock: () => {},
    onUnblock: () => {},
  },
  render: function Controlled(args) {
    const [list, setList] = useState<Friend[]>(args.friends);
    const [log, setLog] = useState('');
    const set = (profile: Profile, status?: Friend['status']) =>
      setList((all) => [
        ...all.filter((item) => item.profile.id !== profile.id),
        ...(status ? [{ profile, status }] : []),
      ]);
    return (
      <>
        <FriendsView
          {...args}
          friends={list}
          onFind={async (handle) => directory.find((item) => item.handle === handle) ?? null}
          onRequest={(profile) => set(profile, 'outgoing')}
          onAccept={(profile) => set(profile, 'friend')}
          onDecline={(profile) => set(profile)}
          onCancel={(profile) => set(profile)}
          onRemove={(profile) => set(profile)}
          onBlock={(profile) => set(profile, 'blocked')}
          onUnblock={(profile) => set(profile)}
          onOpenInvite={(invite) => setLog(`초대: ${invite.ledger.name}`)}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
} satisfies Meta<typeof FriendsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Friends: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole('textbox', { name: '아이디로 찾기' }), '@hana_lee');
    await userEvent.click(c.getByRole('button', { name: '찾기' }));
    await userEvent.click(c.getByRole('button', { name: '친구 요청' }));
    await expect(c.getByRole('list', { name: '찾은 사람' })).toHaveTextContent('요청함');
    await expect(c.getByRole('list', { name: '보낸 요청' })).toHaveTextContent('하나');
    await userEvent.click(c.getByRole('button', { name: /제주 여행/ }));
    await expect(c.getByRole('status')).toHaveTextContent('초대: 제주 여행');
    await userEvent.clear(c.getByRole('textbox', { name: '아이디로 찾기' }));
    await userEvent.type(c.getByRole('textbox', { name: '아이디로 찾기' }), 'nobody{Enter}');
    await expect(await c.findByText(/@nobody인 사람이 없어요/)).toBeVisible();
  },
};
export const FirstUse: Story = {
  args: { friends: [], invites: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/아직 친구가 없어요/)).toBeVisible();
  },
};
export const SignupLink: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '가입 초대 링크' }));
    const dialog = within(page.getByRole('dialog', { name: '가입 초대 링크' }));
    await expect(dialog.getByRole('textbox', { name: '초대 링크' })).toHaveValue(signupLink.url);
    await expect(dialog.getByText('12월 2일까지 · 1/20명 가입')).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: '복사' }));
    await expect(dialog.getByRole('button', { name: '복사했어요' })).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: '새 링크' }));
    await expect(dialog.getByRole('status')).toHaveTextContent('지금 링크로는 더 가입할 수 없어요');
    await expect(dialog.getByRole('button', { name: '새로 만들기' })).toBeVisible();
  },
};
