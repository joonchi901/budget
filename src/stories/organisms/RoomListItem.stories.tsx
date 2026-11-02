import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { List } from '../../client/ui';
import { RoomListItem } from '../../client/ledger';
import { FIXTURE_TODAY, groups, japanTrip, ledgers, november, records } from '../fixtures';

const latestOf = (ledgerIds: string[]) =>
  records
    .filter((record) => ledgerIds.includes(record.ledgerId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

const meta = {
  title: '04 Organisms · 유기체/RoomListItem',
  component: RoomListItem,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '방 목록의 한 줄. 가계부는 기간, 묶음은 포함한 가계부 수를 보여주고, 내역이 있으면 마지막 내역과 시간을 대신 보여줍니다. 상대가 추가한 새 내역 수를 배지로 표시합니다.',
      },
    },
  },
  args: { room: november, today: FIXTURE_TODAY, onOpen: () => {} },
  render: function Rooms() {
    const [opened, setOpened] = useState('');
    return (
      <>
        <List aria-label="방 목록" style={{ maxWidth: 390 }}>
          {[...ledgers, ...groups].map((room) => {
            const ids = 'ledgerIds' in room ? room.ledgerIds : [room.id];
            return (
              <RoomListItem
                key={room.id}
                room={room}
                latest={latestOf(ids)}
                unseen={room.id === november.id ? 3 : 0}
                today={FIXTURE_TODAY}
                onOpen={() => setOpened(room.name)}
              />
            );
          })}
        </List>
        <p role="status">{opened && `${opened} 열기`}</p>
      </>
    );
  },
} satisfies Meta<typeof RoomListItem>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LedgersAndGroups: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText('12월').closest('button')).toHaveTextContent('11/23 – 12/22');
    await expect(c.getByText('새 내역 3건')).toBeInTheDocument();
    await userEvent.click(c.getByRole('button', { name: /^여행/ }));
    await expect(c.getByRole('status')).toHaveTextContent('여행 열기');
  },
};
export const Single: Story = {
  render: (args) => (
    <List aria-label="방 목록" style={{ maxWidth: 390 }}>
      <RoomListItem {...args} room={japanTrip} latest={latestOf([japanTrip.id])} />
    </List>
  ),
};
