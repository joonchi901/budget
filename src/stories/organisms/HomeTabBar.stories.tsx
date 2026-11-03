import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HomeTabBar, type HomeTab } from '../../client/ledger';

const meta = {
  title: '04 Organisms · 유기체/HomeTabBar',
  component: HomeTabBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '앱 첫 화면 하단 막대. 친구·가계부·자산·설정 사이를 오가고, 친구 탭에는 답할 친구 요청과 가계부 초대 수를 배지로 보여줍니다. 가계부 방 안에서는 방의 탭 막대(RoomTabBar)가 대신 나옵니다. 탭은 방향키·Home·End로도 움직입니다.',
      },
    },
  },
  args: { tab: 'ledgers', pending: 2, onTabChange: () => {} },
  render: function Controlled(args) {
    const [tab, setTab] = useState<HomeTab>(args.tab);
    return (
      <div style={{ maxWidth: 390 }}>
        <HomeTabBar {...args} tab={tab} onTabChange={setTab} />
      </div>
    );
  },
} satisfies Meta<typeof HomeTabBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('button', { name: '가계부' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(c.getByRole('button', { name: /^친구.*답할 요청·초대 2건$/ }));
    await userEvent.keyboard('{End}');
    await expect(c.getByRole('button', { name: '설정' })).toHaveAttribute('aria-pressed', 'true');
  },
};
export const NothingWaiting: Story = { args: { pending: 0 } };
