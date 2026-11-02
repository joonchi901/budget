import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RoomTabBar, type RoomView } from '../../client/ledger';

const meta = {
  title: '04 Organisms · 유기체/RoomTabBar',
  component: RoomTabBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '방 화면 하단 막대. 엄지가 닿는 곳에 보기 전환(표·캘린더·통계, 묶음은 가계부별 추가)과 둥근 내역 추가 버튼을 둡니다. 보기 전환은 방향키·Home·End로도 움직입니다.',
      },
    },
  },
  args: {
    views: ['table', 'calendar', 'stats'],
    view: 'table',
    onViewChange: () => {},
    onAdd: () => {},
  },
  render: function Controlled(args) {
    const [view, setView] = useState<RoomView>(args.view);
    const [added, setAdded] = useState(0);
    return (
      <div style={{ maxWidth: 390 }}>
        <RoomTabBar
          {...args}
          view={view}
          onViewChange={setView}
          onAdd={() => setAdded(added + 1)}
        />
        <p role="status">{added > 0 && `추가 ${added}번`}</p>
      </div>
    );
  },
} satisfies Meta<typeof RoomTabBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ledger: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await expect(c.getByRole('button', { name: '캘린더' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{ArrowRight}');
    await expect(c.getByRole('button', { name: '통계' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(c.getByRole('button', { name: '내역 추가' }));
    await expect(c.getByRole('status')).toHaveTextContent('추가 1번');
  },
};
export const Group: Story = { args: { views: ['table', 'calendar', 'stats', 'ledgers'] } };
