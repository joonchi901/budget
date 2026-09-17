import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Dialog } from '../../client/components';

function DialogExample(args: ComponentProps<typeof Dialog>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="primary" onClick={() => setOpen(true)}>
        대화상자 열기
      </button>
      {open && (
        <Dialog
          {...args}
          onClose={() => {
            setOpen(false);
            args.onClose();
          }}
        >
          {args.children}
        </Dialog>
      )}
    </>
  );
}

const meta = {
  title: '02 Components/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '운영 화면의 실제 HTML dialog를 showModal로 엽니다. 배경 상호작용 차단·키보드 포커스·닫기 후 포커스 복귀를 브라우저와 함께 처리합니다. locked는 저장 중 닫기와 취소를 제한하는 상태입니다.',
      },
    },
  },
  args: {
    title: '가계부 설정',
    subtitle: '이름과 설명을 변경해요.',
    locked: false,
    onClose: fn(),
    children: (
      <div className="form-body">
        <label>
          가계부 이름
          <input aria-label="가계부 이름" defaultValue="우리의 일상" />
        </label>
      </div>
    ),
  },
  argTypes: {
    title: { control: 'text' },
    subtitle: { control: 'text' },
    locked: { control: 'boolean' },
    children: { control: false },
    onClose: { control: false },
  },
  render: (args) => <DialogExample {...args} />,
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const OpenAndClose: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const opener = canvas.getByRole('button', { name: '대화상자 열기' });
    await userEvent.click(opener);
    const dialog = canvas.getByRole('dialog', { name: '가계부 설정' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('open');
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await expect(args.onClose).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(opener).toHaveFocus();
  },
};
export const Locked: Story = {
  args: {
    title: '변경 내용을 저장하고 있어요',
    subtitle: '완료될 때까지 잠시 기다려 주세요.',
    locked: true,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '대화상자 열기' }));
    const dialog = canvas.getByRole('dialog');
    await expect(within(dialog).getByRole('button', { name: '닫기' })).toBeDisabled();
    // Native dialog cancellation calls this event. Verify the lock rejects cancellation.
    const cancel = new Event('cancel', { bubbles: false, cancelable: true });
    dialog.dispatchEvent(cancel);
    await expect(cancel.defaultPrevented).toBe(true);
    await expect(dialog).toHaveAttribute('open');
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};
