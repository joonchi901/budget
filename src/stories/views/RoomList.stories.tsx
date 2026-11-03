import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RoomListView } from '../../client/views';
import { FIXTURE_TODAY, ledgers, me, records } from '../fixtures';

const meta = {
  title: '06 Views · 화면/방 목록',
  component: RoomListView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '첫 화면. 오른쪽 위에서 친구(답할 요청·초대 수)와 내 계정을 엽니다. 모든 가계부를 메신저 대화방처럼 최근 활동 순으로 보여주고 새 내역 수를 배지로 표시합니다. 상위 가계부의 활동은 하위 가계부의 내역까지 포함합니다. 이름으로 검색하고, 하단 새 가계부에서 내역을 적는 가계부나 상위 가계부를 만듭니다.',
      },
    },
  },
  args: {
    ledgers,
    records,
    unseen: { nov: 3 },
    today: FIXTURE_TODAY,
    onOpenRoom: () => {},
    onCreate: () => {},
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <RoomListView
          {...args}
          onOpenRoom={(room) => setLog(`열기: ${room.name}`)}
          onCreate={() => setLog('만들기')}
          onOpenFriends={args.onOpenFriends && (() => setLog('친구'))}
          onOpenAccount={args.onOpenAccount && (() => setLog('내 계정'))}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
} satisfies Meta<typeof RoomListView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rooms: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const rows = within(c.getByRole('list', { name: '방 목록' })).getAllByRole('button');
    await expect(rows).toHaveLength(6);
    await userEvent.click(c.getByRole('button', { name: /^2026/ }));
    await expect(c.getByRole('status')).toHaveTextContent('열기: 2026');
  },
};
export const Search: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const search = c.getByRole('searchbox', { name: '가계부 검색' });
    await userEvent.type(search, '여행');
    await expect(
      within(c.getByRole('list', { name: '방 목록' })).getAllByRole('button'),
    ).toHaveLength(2);
    await userEvent.clear(search);
    await userEvent.type(search, '없는 이름');
    await expect(c.getByText(/맞는 방이 없어요/)).toBeVisible();
  },
};
export const Create: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '새 가계부' }));
    await expect(c.getByRole('status')).toHaveTextContent('만들기');
  },
};
export const FirstUse: Story = { args: { ledgers: [], records: [], unseen: {} } };
export const WithPeople: Story = {
  args: { profile: me, pending: 2, onOpenFriends: () => {}, onOpenAccount: () => {} },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '친구, 답할 요청·초대 2건' }));
    await expect(c.getByRole('status')).toHaveTextContent('친구');
    await userEvent.click(c.getByRole('button', { name: '내 계정' }));
    await expect(c.getByRole('status')).toHaveTextContent('내 계정');
  },
};
