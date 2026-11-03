import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HomeTabBar } from '../../client/ledger';
import { AppSettingsView } from '../../client/views';

const meta = {
  title: '06 Views · 화면/앱 설정',
  component: AppSettingsView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '하단 탭의 설정 화면. 앱 전체 화면으로 들어가는 메뉴 목록이고, 지금은 프로필(사진·표시 이름·아이디, 로그아웃·탈퇴)이 있습니다.',
      },
    },
  },
  args: {
    onOpenProfile: () => {},
    tabBar: <HomeTabBar tab="settings" onTabChange={() => {}} />,
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <AppSettingsView {...args} onOpenProfile={() => setLog('프로필 열기')} />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
} satisfies Meta<typeof AppSettingsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Menu: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: /^프로필/ }));
    await expect(c.getByRole('status')).toHaveTextContent('프로필 열기');
  },
};
