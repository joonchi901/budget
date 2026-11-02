import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RoomListView } from '../../client/views';
import { FIXTURE_TODAY, groups, ledgers, records } from '../fixtures';

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
          '첫 화면. 가계부와 묶음을 메신저 대화방처럼 최근 활동 순으로 보여주고, 새 내역 수를 배지로 표시합니다. 검색·종류 전환으로 좁히고 하단 새로 만들기에서 가계부나 묶음을 만듭니다.',
      },
    },
  },
  args: {
    ledgers,
    groups,
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
          onCreate={(kind) => setLog(`만들기: ${kind}`)}
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
    await expect(rows[0]).toHaveTextContent('11월');
    await userEvent.click(c.getByRole('button', { name: '묶음' }));
    await expect(
      within(c.getByRole('list', { name: '방 목록' })).getAllByRole('button'),
    ).toHaveLength(2);
    await userEvent.click(c.getByRole('button', { name: /^2026/ }));
    await expect(c.getByRole('status')).toHaveTextContent('열기: 2026');
  },
};
export const Search: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole('searchbox', { name: '가계부 검색' }), '없는 이름');
    await expect(c.getByText(/맞는 방이 없어요/)).toBeVisible();
  },
};
export const CreateMenu: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '새로 만들기' }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole('menuitem', { name: '묶음 만들기' }),
    );
    await expect(c.getByRole('status')).toHaveTextContent('만들기: group');
  },
};
export const FirstUse: Story = { args: { ledgers: [], groups: [], records: [], unseen: {} } };
