import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import TransactionForm from '../../client/TransactionForm';
import { Button } from '../../client/ui';
import { makeStoryBootstrap, STORY_MONTH } from '../fixtures';
const data = makeStoryBootstrap();
function Editor(args: ComponentProps<typeof TransactionForm>) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>내역 작성 열기</Button>
      {open && (
        <TransactionForm
          {...args}
          onClose={() => {
            args.onClose();
            setOpen(false);
          }}
          onSaved={(message) => {
            args.onSaved(message);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
const meta = {
  title: '06 Screens/Transaction',
  component: TransactionForm,
  tags: ['root-screens'],
  args: {
    data,
    ledgerId: 'sb-june',
    month: STORY_MONTH,
    initialDate: '2026-06-12',
    onChanged: fn(async () => {}),
    onClose: fn(),
    onSaved: fn(),
    presence: fn(),
  },
  render: (args, context) => (
    <Editor
      key={context.id}
      {...args}
      data={{ ...args.data, householdId: `storybook-synthetic-household-${context.id}` }}
    />
  ),
  beforeEach() {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('budget:transaction-draft:v1:storybook-synthetic-household'))
        localStorage.removeItem(key);
    }
  },
  parameters: {
    docs: {
      story: { inline: false },
      description: {
        component:
          '실제 내역 폼의 결제수단 미지정·연속 입력·기기 초안·오류 상태입니다. 가상 응답만 사용합니다. 실제 저장과 동시 편집은 별도 격리 DB E2E에서 검증합니다.',
      },
    },
  },
} satisfies Meta<typeof TransactionForm>;
export default meta;
type Story = StoryObj<typeof meta>;
async function fill(canvasElement: HTMLElement) {
  const c = within(canvasElement);
  await userEvent.type(c.getByRole('spinbutton', { name: '금액' }), '12000');
  await userEvent.type(c.getByRole('textbox', { name: '내용' }), '예시 점심');
  return c;
}
export const New: Story = {};
export const Existing: Story = { args: { original: data.transactions[0] } };
export const Required: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: '저장' }));
    await expect(args.onSaved).not.toHaveBeenCalled();
    await expect(within(canvasElement).getByRole('spinbutton', { name: '금액' })).toBeInvalid();
  },
};
export const SaveWithoutPayment: Story = {
  parameters: {
    apiRoutes: [
      {
        path: '/api/transactions',
        method: 'POST',
        response: {
          revision: 2,
          transaction: {
            ...data.transactions[0],
            id: 'sb-new',
            description: '예시 점심',
            paymentMethodId: null,
          },
        },
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const c = await fill(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '저장' }));
    await expect(args.onSaved).toHaveBeenCalled();
    await expect(c.queryByRole('dialog')).toBeNull();
  },
};
export const ContinueEntry: Story = {
  parameters: {
    apiRoutes: [
      {
        path: '/api/transactions',
        method: 'POST',
        response: {
          revision: 2,
          transaction: { ...data.transactions[0], id: 'sb-new', description: '예시 점심' },
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const c = await fill(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '저장하고 계속 입력' }));
    await expect(c.getByRole('textbox', { name: '내용' })).toHaveValue('');
    await expect(c.getByRole('spinbutton', { name: '금액' })).toHaveFocus();
    await expect(c.getByRole('dialog')).toBeVisible();
  },
};
export const DraftAfterClose: Story = {
  play: async ({ canvasElement }) => {
    const c = await fill(canvasElement);
    await userEvent.click(
      within(c.getByRole('dialog')).getAllByRole('button', { name: '닫기' })[0],
    );
    await userEvent.click(c.getByRole('button', { name: '내역 작성 열기' }));
    await expect(c.getByRole('textbox', { name: '내용' })).toHaveValue('예시 점심');
    await expect(c.getByText('이 기기의 초안을 복원했어요.')).toBeVisible();
  },
};
export const ValidationError: Story = {
  parameters: {
    apiRoutes: [
      {
        path: '/api/transactions',
        method: 'POST',
        status: 400,
        response: { code: 'VALIDATION', error: '입력한 금액을 확인해 주세요.' },
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const c = await fill(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '저장' }));
    await expect(await c.findByText('입력한 금액을 확인해 주세요.')).toBeVisible();
    await expect(c.getByRole('textbox', { name: '내용' })).toHaveValue('예시 점심');
    await expect(args.onSaved).not.toHaveBeenCalled();
  },
};
export const UncertainSave: Story = {
  parameters: {
    apiRoutes: [
      {
        path: '/api/transactions',
        method: 'POST',
        status: 503,
        response: { code: 'UNAVAILABLE', error: '잠시 연결이 끊겼어요.' },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const c = await fill(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '저장' }));
    await expect(await c.findByRole('button', { name: '저장 결과 다시 확인' })).toBeVisible();
    await expect(c.getByRole('textbox', { name: '내용' })).toBeDisabled();
  },
};
