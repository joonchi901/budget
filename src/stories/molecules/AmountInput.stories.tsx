import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AmountInput, Field, Stack } from '../../client/ui';

const meta = {
  title: '03 Molecules · 분자/AmountInput',
  component: AmountInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '내역 입력의 큰 금액 입력. 숫자만 받고 입력하는 동안 세 자리마다 쉼표를 넣으며, 중간을 고쳐도 커서 위치를 유지합니다. 휴대폰에서는 숫자 키패드가 열립니다. 비어 있으면 null입니다.',
      },
    },
  },
  args: { value: null, onValueChange: () => {} },
  render: function Controlled(args) {
    const [value, setValue] = useState<number | null>(args.value);
    return (
      <Stack gap={2} style={{ maxWidth: 360 }}>
        <Field htmlFor="amount">금액</Field>
        <AmountInput {...args} id="amount" value={value} onValueChange={setValue} placeholder="0" />
        <p className="small muted" role="status">
          저장 값: {value === null ? '없음' : value}
        </p>
      </Stack>
    );
  },
} satisfies Meta<typeof AmountInput>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const input = c.getByRole('textbox', { name: '금액' });
    await userEvent.type(input, '0115000');
    await expect(input).toHaveValue('115,000');
    await expect(c.getByRole('status')).toHaveTextContent('저장 값: 115000');
    await userEvent.clear(input);
    await expect(c.getByRole('status')).toHaveTextContent('저장 값: 없음');
  },
};
export const Filled: Story = { args: { value: 2736060 } };
export const IgnoresLetters: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox', { name: '금액' });
    await userEvent.type(input, '4a8,0원00');
    await expect(input).toHaveValue('48,000');
  },
};
export const Disabled: Story = { args: { value: 48000, disabled: true } };
