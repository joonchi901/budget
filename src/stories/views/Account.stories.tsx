import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AccountView, LeaveAccountView } from '../../client/views';
import { FIXTURE_TODAY, december, japanTrip, me, yedi } from '../fixtures';

const meta = {
  title: '06 Views · 화면/내 계정',
  component: AccountView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    docs: {
      description: {
        component:
          '방 목록 오른쪽 위 프로필에서 여는 내 계정. 우가 그림·표시 이름·아이디를 바꾸고(아이디는 30일에 한 번), 로그아웃하거나 탈퇴합니다. 탈퇴할 때 내가 만든 공유 가계부는 고른 편집 멤버가 수락하면 넘어가고, 편집 멤버가 없으면 함께 지워집니다.',
      },
    },
  },
  args: {
    profile: me,
    email: 'junsang@example.com',
    today: FIXTURE_TODAY,
    onSave: () => {},
    onLogout: () => {},
    onLeave: () => {},
    onClose: () => {},
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <AccountView
          {...args}
          onSave={(profile) => setLog(`저장 ${profile.handle} ${profile.name} ${profile.avatar}`)}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
} satisfies Meta<typeof AccountView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Edit: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: '저장' })).toBeDisabled();
    await userEvent.clear(page.getByRole('textbox', { name: '아이디' }));
    await userEvent.type(page.getByRole('textbox', { name: '아이디' }), 'js');
    await expect(page.getByText(/아이디는 영문 소문자/)).toBeVisible();
    await userEvent.type(page.getByRole('textbox', { name: '아이디' }), '_2026');
    await userEvent.click(page.getByRole('button', { name: '차분한 우가' }));
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    await expect(page.getByRole('status')).toHaveTextContent('저장 js_2026 준상 calm');
  },
};
export const HandleLocked: Story = {
  args: { handleChangeableFrom: '2026-11-20' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('textbox', { name: '아이디' })).toBeDisabled();
    await expect(page.getByText('11월 20일부터 바꿀 수 있어요.')).toBeVisible();
  },
};
export const Leave: Story = {
  render: function Logged() {
    const [log, setLog] = useState('');
    return (
      <>
        <LeaveAccountView
          owned={[
            { ledger: japanTrip, editors: [yedi] },
            { ledger: december, editors: [] },
          ]}
          onConfirm={(transfers) => setLog(JSON.stringify(transfers))}
          onClose={() => {}}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('list', { name: '내가 만든 공유 가계부' })).toHaveTextContent(
      '편집 멤버가 없어 지워져요',
    );
    await userEvent.click(page.getByRole('button', { name: '탈퇴하기' }));
    await userEvent.click(page.getByRole('button', { name: '한 번 더 누르면 탈퇴해요' }));
    await expect(page.getByRole('status')).toHaveTextContent('{"trip":"u2","dec":null}');
  },
};
