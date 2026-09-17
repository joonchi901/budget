import { useEffect, useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SelectField, SelectGroup, SelectOption } from '../../client/SelectField';
import { TagBadge } from '../../client/TagBadge';

function ControlledSelect(args: ComponentProps<typeof SelectField>) {
  const [value, setValue] = useState(args.value);
  useEffect(() => setValue(args.value), [args.value]);
  return (
    <form className="form-body" onSubmit={(event) => event.preventDefault()}>
      <label>
        분류 태그
        <SelectField
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
          선택 확인
        </button>
      )}
    </form>
  );
}

const options = (
  <>
    <SelectGroup label="생활">
      <SelectOption value="food">
        <TagBadge name="식비" color="#D28C70" />
      </SelectOption>
      <SelectOption value="transport">
        <TagBadge name="교통" color="#6C89A4" />
      </SelectOption>
      <SelectOption value="home">
        <TagBadge name="주거" color="#64866F" />
      </SelectOption>
    </SelectGroup>
    <SelectGroup label="기타">
      <SelectOption value="retired" disabled>
        사용하지 않는 분류
      </SelectOption>
      <SelectOption value="other">기타</SelectOption>
    </SelectGroup>
  </>
);

const meta = {
  title: '02 Components/SelectField',
  component: SelectField,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '앱에서 사용하는 단일 선택 필드. 옵션 그룹·태그 배지·검색을 함께 조립합니다. 방향키로 이동하고 Enter로 확정하며 Escape로 닫으면 입력 버튼으로 포커스를 돌려줍니다.',
      },
    },
  },
  args: {
    value: 'food',
    'aria-label': '분류 태그',
    onValueChange: fn(),
    children: options,
    searchable: false,
    disabled: false,
    required: false,
  },
  argTypes: {
    children: { control: false },
    onValueChange: { control: false },
    value: { control: 'select', options: ['', 'food', 'transport', 'home', 'other'] },
    disabled: { control: 'boolean' },
    searchable: { control: 'boolean' },
    required: { control: 'boolean' },
  },
  render: (args) => <ControlledSelect {...args} />,
} satisfies Meta<typeof SelectField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Searchable: Story = {
  args: { searchable: true },
  parameters: {
    docs: {
      description: {
        story: '검색 결과를 좁혀 선택합니다. 선택한 값과 콜백은 동일하게 유지됩니다.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', { name: '분류 태그' }));
    await userEvent.type(canvas.getByRole('searchbox', { name: '분류 태그 검색' }), '교통');
    await expect(canvas.getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Enter}');
    await expect(args.onValueChange).toHaveBeenCalledWith('transport');
    await expect(canvas.getByRole('combobox')).toHaveTextContent('교통');
    await expect(canvas.queryByRole('listbox')).not.toBeInTheDocument();
  },
};

export const KeyboardSelection: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', { name: '분류 태그' }));
    await expect(canvas.getByRole('option', { name: '식비' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.onValueChange).toHaveBeenCalledWith('transport');
    const trigger = canvas.getByRole('combobox');
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('option', { name: '교통' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect(canvas.getByRole('option', { name: '기타' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(trigger).toHaveFocus();
    await expect(canvas.queryByRole('listbox')).not.toBeInTheDocument();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox')).toBeDisabled();
  },
};

export const EmptyOptions: Story = {
  args: { value: '', children: null, searchable: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox'));
    await expect(canvas.getByRole('status')).toHaveTextContent('일치하는 항목이 없어요.');
  },
};

export const RequiredValidation: Story = {
  args: { value: '', required: true },
  parameters: {
    docs: {
      description: {
        story:
          '필수 입력을 비운 채 제출하면 인라인 오류와 옵션 목록을 표시합니다. 유효한 선택 후 오류가 사라집니다.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '선택 확인' }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('항목을 선택해 주세요.');
    await expect(canvas.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.click(canvas.getByRole('option', { name: '주거' }));
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const LongLabel: Story = {
  args: {
    value: 'long',
    children: (
      <SelectOption value="long">
        여행 중 함께 사용한 식사와 교통비를 정리하는 아주 긴 분류 태그
      </SelectOption>
    ),
  },
};
