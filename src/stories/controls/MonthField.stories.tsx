import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MonthField, type DateFieldProps } from '../../client/DateFields';

function ControlledMonth(args: DateFieldProps) {
  const [value, setValue] = useState(args.value);
  useEffect(() => setValue(args.value), [args.value]);
  return (
    <form className="form-body" onSubmit={(event) => event.preventDefault()}>
      <label>
        조회 월
        <MonthField
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
          월 확인
        </button>
      )}
    </form>
  );
}

const meta = {
  title: '02 Components/MonthField',
  component: MonthField,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '조회 월 선택에 사용하는 공통 필드. 저장 값은 YYYY-MM이며 방향키로 12개월 격자를 탐색합니다. 범위 밖의 월은 선택할 수 없습니다.',
      },
    },
  },
  args: {
    value: '2026-09',
    'aria-label': '조회 월',
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
  render: (args) => <ControlledMonth {...args} />,
} satisfies Meta<typeof MonthField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Empty: Story = { args: { value: '' } };
export const Disabled: Story = { args: { disabled: true } };
export const KeyboardSelection: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '조회 월' }));
    await expect(canvas.getByRole('gridcell', { name: '2026-09' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{Enter}');
    await expect(args.onValueChange).toHaveBeenCalledWith('2026-10');
    await expect(canvas.getByRole('button', { name: '조회 월' })).toHaveTextContent('2026년 10월');
  },
};
export const Bounded: Story = {
  args: { min: '2026-07', max: '2026-12' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '조회 월' }));
    await expect(canvas.getByRole('gridcell', { name: '2026-06' })).toBeDisabled();
    await expect(canvas.getByRole('gridcell', { name: '2026-07' })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: '이전 연도' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '다음 연도' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
  },
};
export const RequiredValidation: Story = {
  args: { value: '', required: true, min: '2026-01', max: '2026-12' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '월 확인' }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('월을 선택해 주세요.');
    await userEvent.click(canvas.getByRole('gridcell', { name: '2026-09' }));
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: '조회 월' })).toHaveAccessibleDescription(
      '필수 입력',
    );
  },
};
