import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DateField, type DateFieldProps } from '../../client/DateFields';

function ControlledDate(args: DateFieldProps) {
  const [value, setValue] = useState(args.value);
  useEffect(() => setValue(args.value), [args.value]);
  return (
    <form className="form-body" onSubmit={(event) => event.preventDefault()}>
      <label>
        거래 날짜
        <DateField
          {...args}
          value={value}
          onValueChange={(next) => {
            setValue(next);
            args.onValueChange(next);
          }}
        />
      </label>
      {args.required && (
        <button className="primary" type="submit">
          날짜 확인
        </button>
      )}
    </form>
  );
}

const meta = {
  title: '02 Components/DateField',
  component: DateField,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '운영 화면과 같은 달력 필드. ISO 날짜(YYYY-MM-DD)를 저장하며 min/max로 선택 범위를 제한합니다. 방향키·Home·End·PageUp·PageDown으로 탐색하고 Enter로 선택합니다.',
      },
    },
  },
  args: {
    value: '2026-09-17',
    'aria-label': '거래 날짜',
    onValueChange: fn(),
    disabled: false,
    required: false,
  },
  argTypes: {
    value: { control: 'text' },
    min: { control: 'text' },
    max: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    onValueChange: { control: false },
  },
  render: (args) => <ControlledDate {...args} />,
} satisfies Meta<typeof DateField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Empty: Story = { args: { value: '' } };
export const Disabled: Story = { args: { disabled: true } };

export const KeyboardSelection: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '거래 날짜' }));
    await expect(canvas.getByRole('gridcell', { name: '2026-09-17' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{Enter}');
    await expect(args.onValueChange).toHaveBeenCalledWith('2026-09-18');
    await expect(canvas.getByRole('button', { name: '거래 날짜' })).toHaveTextContent(
      '2026년 9월 18일',
    );
    await expect(canvas.queryByRole('grid')).not.toBeInTheDocument();
  },
};

export const Bounded: Story = {
  args: { min: '2026-09-10', max: '2026-09-20' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '거래 날짜' }));
    await expect(canvas.getByRole('gridcell', { name: '2026-09-09' })).toBeDisabled();
    await expect(canvas.getByRole('gridcell', { name: '2026-09-21' })).toBeDisabled();
    await expect(canvas.getByRole('gridcell', { name: '2026-09-10' })).toBeEnabled();
    await expect(canvas.getByRole('gridcell', { name: '2026-09-20' })).toBeEnabled();
    await userEvent.keyboard('{Escape}');
    await expect(canvas.getByRole('button', { name: '거래 날짜' })).toHaveFocus();
  },
};

export const RequiredValidation: Story = {
  args: { value: '', required: true, min: '2026-09-01', max: '2026-09-30' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '날짜 확인' }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('날짜를 선택해 주세요.');
    await userEvent.click(canvas.getByRole('gridcell', { name: '2026-09-17' }));
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: '거래 날짜' })).toHaveAccessibleDescription(
      '필수 입력',
    );
  },
};
