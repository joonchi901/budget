import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HomeTabBar } from '../../client/ledger';
import { RoomListView } from '../../client/views';
import { FIXTURE_TODAY, ledgers, records } from '../fixtures';

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
          '첫 화면, 하단 탭(친구·가계부·자산·설정)의 가계부 탭. 모든 가계부를 메신저 대화방처럼 최근 활동 순으로 보여주고, 하위 가계부는 그 상위 아래에 들여 씁니다(상위가 둘이면 각각 아래에). 상위 가계부의 활동은 하위 가계부의 내역까지 포함합니다. 줄마다 마지막 내역·시간·새 내역 수를 보여줍니다. 이름으로 검색하면 맞는 방만 평평하게 보이고, 로고 오른쪽 새 가계부에서 내역을 적는 가계부나 상위 가계부를 만듭니다.',
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
          tabBar={
            <HomeTabBar tab="ledgers" pending={2} onTabChange={(tab) => setLog(`탭: ${tab}`)} />
          }
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

// Read as screen readers hear it: a 하위 가계부 row starts with that phrase.
const ORDER = [
  '2026',
  '하위 가계부 하반기',
  '하위 가계부 11월',
  '하위 가계부 12월',
  '하위 가계부 일본여행',
  '여행',
  '하위 가계부 일본여행',
];

export const Rooms: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const rows = within(c.getByRole('list', { name: '방 목록' })).getAllByRole('button');
    // 일본여행 sits under both 2026 and 여행.
    await expect(rows.map((row) => row.querySelector('.ui-list-row-title')!.textContent)).toEqual(
      ORDER,
    );
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
export const Archived: Story = {
  args: {
    ledgers: ledgers.map((ledger) =>
      ledger.id === 'dec' ? { ...ledger, archived: true } : ledger,
    ),
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // 12월 leaves the list and waits, folded, under 보관한 가계부.
    await expect(
      within(c.getByRole('list', { name: '방 목록' })).queryByRole('button', { name: /12월/ }),
    ).toBeNull();
    await userEvent.click(c.getByText('보관한 가계부 1개'));
    await userEvent.click(
      within(c.getByRole('list', { name: '보관한 가계부' })).getByRole('button', { name: /12월/ }),
    );
    await expect(c.getByRole('status')).toHaveTextContent('열기: 12월');
  },
};
export const Tabs: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const tabs = within(c.getByRole('group', { name: '메뉴' }));
    await expect(tabs.getByRole('button', { name: '가계부' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(tabs.getByRole('button', { name: /^친구.*답할 요청·초대 2건$/ }));
    await expect(c.getByRole('status')).toHaveTextContent('탭: friends');
  },
};
