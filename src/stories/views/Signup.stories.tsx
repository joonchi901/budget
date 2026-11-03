import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SignupView } from '../../client/views';
import { yedi } from '../fixtures';

const meta = {
  title: '06 Views · 화면/가입',
  component: SignupView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '처음 Google로 로그인한 뒤 프로필을 만드는 화면. 아이디(영문 소문자·숫자·밑줄 4–20자, 친구가 찾을 때 씀)·표시 이름·우가 그림을 정하고 약관에 동의합니다. 다른 사람에게는 이 셋만 보입니다. 가입 초대 링크로 왔으면 누가 초대했는지 보여주고, 가입하면 그 사람과 친구가 됩니다.',
      },
    },
  },
  args: { email: 'junsang@example.com', suggestedName: '준상', onSubmit: () => {} },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <SignupView
          {...args}
          onSubmit={(profile) => setLog(`${profile.handle} ${profile.name} ${profile.avatar}`)}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
} satisfies Meta<typeof SignupView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '시작하기' }));
    await expect(c.getByRole('textbox', { name: '아이디' })).toHaveAccessibleDescription(/4–20자/);
    await expect(c.getByText('약관에 동의해야 시작할 수 있어요.')).toBeVisible();
    await userEvent.type(c.getByRole('textbox', { name: '아이디' }), 'JunSang');
    await expect(c.getByRole('textbox', { name: '아이디' })).toHaveValue('junsang');
    await userEvent.click(c.getByRole('button', { name: '조는 우가' }));
    await userEvent.click(c.getByRole('checkbox', { name: /약관/ }));
    await userEvent.click(c.getByRole('button', { name: '시작하기' }));
    await expect(c.getByRole('status')).toHaveTextContent('junsang 준상 sleep');
  },
};
export const Invited: Story = { args: { invitedBy: yedi } };
export const HandleTaken: Story = {
  args: { takenHandle: 'junsang' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole('textbox', { name: '아이디' }), 'junsang');
    await expect(c.getByText('이미 쓰는 아이디예요.')).toBeVisible();
  },
};
