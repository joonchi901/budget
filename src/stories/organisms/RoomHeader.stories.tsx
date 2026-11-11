import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Copy, Settings2 } from 'lucide-react';
import { RoomHeader } from '../../client/ledger';
import { secondHalf, year2026 } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/RoomHeader',
  component: RoomHeader,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '방 화면의 제목 막대. 가계부 목록으로 가는 버튼(휴대폰만, 데스크톱은 옆 목록으로 이동), 상위 가계부 경로와 방 이름(2026 › 하반기 › 11월, 상위 이름을 누르면 그 방), 기간, ⋯ 메뉴를 담습니다. 경로가 길면 상위 이름부터 줄어듭니다. 보기 전환은 손이 닿는 하단의 RoomTabBar에 있습니다. 방 이름이 화면의 h1입니다.',
      },
    },
  },
  args: {
    title: '11월',
    subtitle: '10/23 – 11/22',
    onBack: () => {},
    menuItems: [
      { label: '설정', icon: <Settings2 size={18} />, onSelect: () => {} },
      { label: '복사해서 만들기', icon: <Copy size={18} />, onSelect: () => {} },
    ],
  },
  render: (args) => (
    <div style={{ maxWidth: 390 }}>
      <RoomHeader {...args} />
    </div>
  ),
} satisfies Meta<typeof RoomHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ledger: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('heading', { level: 1, name: '11월' })).toBeVisible();
    await expect(c.getByRole('button', { name: '11월 메뉴' })).toHaveAttribute(
      'aria-haspopup',
      'menu',
    );
  },
};
export const Group: Story = { args: { title: '2026', subtitle: '묶음 · 가계부 3개' } };
export const LongName: Story = {
  args: {
    title: '이름이 아주 긴 2026년 가족 일본여행 오사카·교토 가계부',
    subtitle: '10/9 – 10/12',
  },
};
export const WithPath: Story = {
  args: { path: [year2026, secondHalf] },
  render: function Opened(args) {
    const [opened, setOpened] = useState('');
    return (
      <div style={{ maxWidth: 390 }}>
        <RoomHeader {...args} onOpenPath={(ledger) => setOpened(ledger.name)} />
        <p role="status">{opened}</p>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // 2026 › 하반기 › 11월: the 상위 가계부 lead to the name, each one a way up.
    const path = c.getByRole('navigation', { name: '상위 가계부' });
    await expect(path).toHaveTextContent('2026하반기');
    await expect(c.getByRole('heading', { level: 1, name: '11월' })).toBeVisible();
    await userEvent.click(within(path).getByRole('button', { name: '하반기' }));
    await expect(c.getByRole('status')).toHaveTextContent('하반기');
  },
};
export const NoBack: Story = {
  args: { onBack: undefined, path: [year2026, secondHalf] },
  play: async ({ canvasElement }) => {
    // Beside the room list on desktop, the header has no way back of its own.
    await expect(within(canvasElement).queryByRole('button', { name: '가계부 목록' })).toBeNull();
  },
};
