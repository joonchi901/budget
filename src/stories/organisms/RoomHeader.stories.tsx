import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Copy, Settings2 } from 'lucide-react';
import { RoomHeader, type RoomView } from '../../client/ledger';

const meta = {
  title: '04 Organisms · 유기체/RoomHeader',
  component: RoomHeader,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '방 화면의 머리. 뒤로(방 목록), 방 이름과 기간, ⋯ 메뉴, 보기 전환을 담습니다. 묶음 방은 가계부별 보기를 더합니다. 방 이름이 화면의 h1입니다.',
      },
    },
  },
  args: {
    title: '11월',
    subtitle: '10/23 – 11/22',
    views: ['table', 'calendar', 'stats'],
    view: 'table',
    onViewChange: () => {},
    onBack: () => {},
    menuItems: [
      { label: '설정', icon: <Settings2 size={18} />, onSelect: () => {} },
      { label: '복사해서 만들기', icon: <Copy size={18} />, onSelect: () => {} },
    ],
  },
  render: function Controlled(args) {
    const [view, setView] = useState<RoomView>(args.view);
    return (
      <div style={{ maxWidth: 390 }}>
        <RoomHeader {...args} view={view} onViewChange={setView} />
      </div>
    );
  },
} satisfies Meta<typeof RoomHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ledger: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('heading', { level: 1, name: '11월' })).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await expect(c.getByRole('button', { name: '캘린더' })).toHaveAttribute('aria-pressed', 'true');
  },
};
export const Group: Story = {
  args: {
    title: '2026',
    subtitle: '묶음 · 가계부 3개',
    views: ['table', 'calendar', 'stats', 'ledgers'],
  },
};
export const LongName: Story = {
  args: {
    title: '이름이 아주 긴 2026년 가족 일본여행 오사카·교토 가계부',
    subtitle: '10/9 – 10/12',
  },
};
