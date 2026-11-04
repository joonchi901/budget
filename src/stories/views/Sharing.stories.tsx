import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { InviteAcceptView, LedgerMembersView } from '../../client/views';
import { leafLedgers } from '../../shared/ledger';
import {
  invites,
  japanTrip,
  ledgers,
  me,
  minho,
  seoyeon,
  tripMembers,
  yedi,
  year2026,
} from '../fixtures';

const accepted = [yedi, minho, seoyeon];

const meta = {
  title: '06 Views · 화면/멤버·초대',
  component: LedgerMembersView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    docs: {
      description: {
        component:
          '가계부 공유. 방 메뉴의 멤버에서 소유자가 친구를 편집·보기 권한으로 초대하고, 권한을 바꾸거나 내보냅니다. 다른 멤버는 멤버를 보고 나갈 수 있습니다. 상위 가계부는 공유되지 않고, 하위 전부 공유로 아래 가계부 중 내가 만든 것에만 한 번에 초대합니다. 받은 초대는 수락하면서 내 상위 가계부에 바로 넣을 수 있습니다.',
      },
    },
  },
  args: {
    ledger: japanTrip,
    meId: me.id,
    members: tripMembers,
    friends: accepted,
    onInvite: () => {},
    onRoleChange: () => {},
    onRemove: () => {},
    onLeave: () => {},
    onClose: () => {},
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <LedgerMembersView
          {...args}
          onInvite={({ profileIds, role }) => setLog(`초대 ${profileIds.join(',')} ${role}`)}
          onLeave={() => setLog('나가기')}
          onFindFriends={() => setLog('친구 찾기')}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
} satisfies Meta<typeof LedgerMembersView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Owner: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('heading', { name: '멤버 3명' })).toBeVisible();
    await expect(page.queryByRole('checkbox', { name: /예디/ })).toBeNull();
    await userEvent.click(page.getByRole('checkbox', { name: /서연/ }));
    await userEvent.click(page.getByRole('button', { name: '보기' }));
    await expect(page.getByText('내역을 보기만 해요.')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: '1명 초대' }));
    await expect(page.getByRole('status')).toHaveTextContent(`초대 ${seoyeon.id} viewer`);
  },
};
export const Editor: Story = {
  args: { meId: yedi.id },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.queryByRole('group', { name: '초대할 친구' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: '이 가계부에서 나가기' }));
    await userEvent.click(page.getByRole('button', { name: '한 번 더 누르면 나가요' }));
    await expect(page.getByRole('status')).toHaveTextContent('나가기');
  },
};
export const NoFriends: Story = {
  args: { friends: [] },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: '친구 찾기' }));
    await expect(page.getByRole('status')).toHaveTextContent('친구 찾기');
  },
};
export const ShareFromParent: Story = {
  args: {
    ledger: year2026,
    members: [],
    below: leafLedgers(ledgers, year2026).map((ledger) => ({
      ledger,
      owned: ledger.id !== japanTrip.id,
    })),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('list', { name: '함께 공유할 가계부' })).toHaveTextContent(
      '다른 사람이 만든 가계부라 빠져요',
    );
    await userEvent.click(page.getByRole('checkbox', { name: /예디/ }));
    await userEvent.click(page.getByRole('button', { name: '1명 초대' }));
    await expect(page.getByRole('status')).toHaveTextContent(`초대 ${yedi.id} editor`);
  },
};
export const AcceptInvite: Story = {
  render: function Logged() {
    const [log, setLog] = useState('');
    return (
      <>
        <InviteAcceptView
          invite={invites[0]}
          ledgers={ledgers}
          onAccept={({ parentIds }) => setLog(`수락 ${parentIds.join(',')}`)}
          onDecline={() => setLog('거절')}
          onClose={() => {}}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('list', { name: '초대받은 가계부' })).toHaveTextContent(
      '편집 권한으로 초대했어요',
    );
    await userEvent.click(page.getByRole('button', { name: '여행' }));
    await userEvent.click(page.getByRole('button', { name: '수락' }));
    await expect(page.getByRole('status')).toHaveTextContent('수락 travel');
  },
};
