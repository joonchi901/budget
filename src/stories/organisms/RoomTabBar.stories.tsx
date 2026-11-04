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
          '방 화면 하단 막대. 엄지가 닿는 곳에 내역·통계·대화·설정 탭을 두고, 상위 가계부는 대화 없이 내역·통계·설정입니다. 표/캘린더 전환은 내역 보기 위쪽 조회 도구 옆에, 내역 추가는 탭 막대 바로 위 가로 전체 버튼으로 있습니다. 탭은 방향키·Home·End로도 움직입니다.',
      },
    },
  },
  args: {
    views: ['records', 'stats', 'settings'],
    view: 'records',
    onViewChange: () => {},
  },
  render: function Controlled(args) {
    const [view, setView] = useState<RoomView>(args.view);
    return (
      <div style={{ maxWidth: 390 }}>
        <RoomTabBar {...args} view={view} onViewChange={setView} />
      </div>
    );
  },
} satisfies Meta<typeof RoomTabBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ledger: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '통계' }));
    await expect(c.getByRole('button', { name: '통계' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{ArrowRight}');
    await expect(c.getByRole('button', { name: '설정' })).toHaveAttribute('aria-pressed', 'true');
    await expect(c.queryByRole('button', { name: '내역 추가' })).toBeNull();
  },
};
export const Group: Story = { args: { views: ['records', 'stats', 'settings'] } };
