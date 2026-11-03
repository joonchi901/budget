import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LoginView } from '../../client/views';
import { yedi } from '../fixtures';

const meta = {
  title: '06 Views · 화면/로그인',
  component: LoginView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          'Google 로그인. 처음이면 로그인 뒤 가입(프로필 만들기)으로 이어집니다. 가입 초대 링크로 열면 누가 초대했는지 보여줍니다.',
      },
    },
  },
  args: { onLogin: () => {} },
} satisfies Meta<typeof LoginView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  render: function Busy(args) {
    const [busy, setBusy] = useState(false);
    return <LoginView {...args} busy={busy} onLogin={() => setBusy(true)} />;
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: 'Google로 계속하기' }));
    await expect(c.getByRole('button', { name: '확인하고 있어요' })).toBeDisabled();
  },
};
export const Failed: Story = {
  args: { error: 'Google 로그인을 마치지 못했어요. 다시 시도해 주세요.' },
};
export const Invited: Story = {
  args: { invitedBy: yedi },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/예디님이 우가에 초대했어요/)).toBeVisible();
  },
};
