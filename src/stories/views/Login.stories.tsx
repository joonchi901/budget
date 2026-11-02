import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LoginView } from '../../client/views';

const meta = {
  title: '06 Views · 화면/로그인',
  component: LoginView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: { description: { component: '등록된 두 Google 계정만 들어오는 로그인 화면.' } },
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
export const NotRegistered: Story = {
  args: { error: '등록되지 않은 계정이에요. 가계부에 등록된 Google 계정으로 다시 시도해 주세요.' },
};
