import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Button, Notice } from '../../client/ui';

const meta = {
  title: '03 Molecules · 분자/Notice',
  component: Notice,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '페이지 위에 떠서 알리는 메시지. 저장 실패 같은 오류는 바로 읽히고(role="alert"), 링크 복사 같은 완료 알림은 차례가 오면 읽힙니다(role="status"). 닫기로 없앱니다.',
      },
    },
  },
  args: { children: '저장하지 못했어요. 잠시 후 다시 해 주세요.', onClose: () => {} },
} satisfies Meta<typeof Notice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SaveFailed: Story = {
  render: function Closable(args) {
    const [open, setOpen] = useState(true);
    return open ? (
      <Notice {...args} onClose={() => setOpen(false)} />
    ) : (
      <Button onClick={() => setOpen(true)}>다시 보기</Button>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('alert')).toHaveTextContent('저장하지 못했어요');
    await userEvent.click(c.getByRole('button', { name: '닫기' }));
    await expect(c.queryByRole('alert')).toBeNull();
  },
};
export const Copied: Story = { args: { tone: 'success', children: '초대 링크를 복사했어요.' } };
