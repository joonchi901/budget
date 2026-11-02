import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Copy, Settings2 } from 'lucide-react';
import { RoomHeader } from '../../client/ledger';

const meta = {
  title: '04 Organisms · 유기체/RoomHeader',
  component: RoomHeader,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '방 화면의 제목 막대. 뒤로(방 목록), 방 이름과 기간, ⋯ 메뉴만 담습니다. 보기 전환은 손이 닿는 하단의 RoomTabBar에 있습니다. 방 이름이 화면의 h1입니다.',
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
