import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ChatThread } from '../../client/ledger';
import type { ChatMessage } from '../../shared/ledger';
import { members, messages } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/ChatThread',
  component: ChatThread,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '가계부 방의 대화. 날짜별로 묶고, 내 글은 오른쪽, 다른 멤버 글은 왼쪽에 이름과 함께 보입니다. 글 또는 우가 스티커 하나를 보내고, 웃는 얼굴 버튼은 반응과 같은 스티커 고르기를 엽니다. 대화 탭을 보는 동안 앱이 몇 초마다 새 글을 확인합니다.',
      },
    },
  },
  args: { messages, memberId: 'u1', members, onSend: () => {} },
  render: function Controlled(args) {
    const [list, setList] = useState<ChatMessage[]>(args.messages);
    return (
      <div style={{ maxWidth: 390 }}>
        <ChatThread
          {...args}
          messages={list}
          onSend={(content) =>
            setList((all) => [
              ...all,
              {
                id: `new-${all.length}`,
                ledgerId: 'nov',
                authorId: args.memberId,
                createdAt: '2026-11-01T23:40:00.000Z',
                ...content,
              },
            ])
          }
        />
      </div>
    );
  },
} satisfies Meta<typeof ChatThread>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Conversation: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(c.getByText('11월 고정지출 다 넣었어')).toBeVisible();
    await expect(c.getByRole('img', { name: '고마워요' })).toBeVisible();
    await expect(c.getByRole('button', { name: '보내기' })).toBeDisabled();
    await userEvent.type(c.getByRole('textbox', { name: '메시지' }), '영수증 고마워{Enter}');
    await expect(c.getByText('영수증 고마워')).toBeVisible();
    await expect(c.getByRole('textbox', { name: '메시지' })).toHaveValue('');
    await userEvent.click(c.getByRole('button', { name: '스티커 보내기' }));
    await userEvent.click(
      within(page.getByRole('dialog', { name: '스티커 고르기' })).getByRole('button', {
        name: '좋아요',
      }),
    );
    await expect(c.getByRole('img', { name: '좋아요' })).toBeVisible();
  },
};
export const FirstMessage: Story = { args: { messages: [] } };
export const Memo: Story = {
  args: { messages: [], memo: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText(/아직 메모가 없어요/)).toBeVisible();
    await expect(c.getByRole('textbox', { name: '메모' })).toBeVisible();
  },
};
