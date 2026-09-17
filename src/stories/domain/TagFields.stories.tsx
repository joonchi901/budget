import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TagFields, type TagFieldsProps } from '../../client/TagFields';
import { makeStoryBootstrap } from '../fixtures';

function ControlledTags(args: TagFieldsProps) {
  const [value, setValue] = useState(args.value);
  useEffect(() => setValue(args.value), [args.value]);
  return (
    <TagFields
      {...args}
      value={value}
      onChange={(next) => {
        setValue(next);
        args.onChange(next);
      }}
    />
  );
}

const meta = {
  title: '05 Domain/태그/TagFields',
  component: TagFields,
  tags: ['autodocs'],
  render: (args) => <ControlledTags {...args} />,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 680 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          '유형별 단일·복수 태그 선택입니다. 그룹 적용 범위와 보관 상태는 기존 선택을 숨기지 않습니다. 이 예시는 선택 상태를 로컬 React 상태로 반영하고 onChange를 Actions에 기록합니다. 기존 옵션 선택·해제만 오프라인에서 검증합니다. 새 옵션 생성은 컴포넌트 내부 API를 사용하므로 Storybook의 네트워크 차단 경계에서 차단되며 실제 생성·저장 성공은 이 명세의 범위가 아닙니다.',
      },
    },
  },
  args: {
    data: makeStoryBootstrap(),
    value: [],
    appliesTo: 'transaction',
    ledgerId: 'sb-june',
    onChange: fn(),
    onChanged: fn(async () => {}),
    onPendingChange: fn(),
  },
  argTypes: {
    data: { control: false },
    value: { control: 'object', description: '선택한 태그 ID 배열. 예: ["sb-food"].' },
    appliesTo: { control: 'radio', options: ['transaction', 'asset'] },
    disabled: { control: 'boolean' },
    onChange: {
      description: '선택 변경 전체 ID 배열. 상위 옵션 해제 시 종속된 하위 옵션도 해제합니다.',
    },
  },
} satisfies Meta<typeof TagFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unselected: Story = { name: '선택 전' };

export const Selected: Story = {
  name: '선택한 옵션을 배지로 표시',
  args: { value: ['sb-food', 'sb-family', 'sb-weekend'] },
};

export const SelectExisting: Story = {
  name: '기존 옵션 선택',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '분류 선택' }));
    await userEvent.click(canvas.getByRole('option', { name: '식비' }));
    await expect(args.onChange).toHaveBeenLastCalledWith(['sb-food']);
    await expect(canvas.getByRole('button', { name: '분류 선택' })).toHaveTextContent('식비');
    await userEvent.click(canvas.getByRole('button', { name: '내역 선택' }));
    await userEvent.click(canvas.getByRole('option', { name: '가족' }));
    await userEvent.click(canvas.getByRole('option', { name: '주말' }));
    await expect(args.onChange).toHaveBeenLastCalledWith(['sb-food', 'sb-family', 'sb-weekend']);
    await userEvent.keyboard('{Escape}');
    await expect(args.onChanged).not.toHaveBeenCalled();
  },
};

export const NestedSelection: Story = {
  name: '상위 옵션 해제 시 하위 선택도 해제',
  args: { value: ['sb-family', 'sb-family-meal', 'sb-weekend'] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '내역 선택' }));
    await userEvent.click(canvas.getByRole('option', { name: '가족' }));
    await expect(args.onChange).toHaveBeenLastCalledWith(['sb-weekend']);
    await userEvent.keyboard('{Escape}');
  },
};

export const OutOfScopeSelection: Story = {
  name: '범위 밖 유형의 기존 선택',
  args: { value: ['sb-lodging'] },
  parameters: {
    docs: {
      description: {
        story:
          '여행 전용 유형을 다른 가계부에서 볼 때 기존 선택을 표시합니다. 새 선택은 잠기고, 비우기는 허용합니다.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: '여행 구분 선택' })).toBeDisabled();
    await expect(canvas.getByText('이 가계부에 적용되지 않는 기존 선택이에요.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '여행 구분 선택 비우기' }));
    await expect(args.onChange).toHaveBeenLastCalledWith([]);
  },
};

export const ArchivedGroupSelection: Story = {
  name: '보관한 유형의 기존 선택',
  args: { value: ['sb-legacy'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: '이전 분류 선택' })).toBeDisabled();
    await expect(canvas.getByText('보관된 유형의 기존 선택이에요.')).toBeVisible();
  },
};

export const ArchivedOptionSelection: Story = {
  name: '보관한 옵션은 기존 배지에만 표시',
  args: { value: ['sb-retired-option'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: '내역 선택' })).toHaveTextContent('지난 행사');
    await userEvent.click(canvas.getByRole('button', { name: '내역 선택' }));
    await expect(canvas.queryByRole('option', { name: '지난 행사' })).toBeNull();
    await userEvent.keyboard('{Escape}');
  },
};

export const Disabled: Story = {
  name: '읽기 전용',
  args: { value: ['sb-food', 'sb-family'], disabled: true },
  play: async ({ canvasElement }) => {
    for (const button of within(canvasElement).getAllByRole('button')) {
      await expect(button).toBeDisabled();
    }
  },
};

export const AssetTags: Story = {
  name: '자산 목적 태그',
  args: { appliesTo: 'asset', value: ['sb-reserve'], ledgerId: undefined },
};

export const NoAvailableGroups: Story = {
  name: '사용할 유형 없음',
  args: { data: makeStoryBootstrap({ tagGroups: [], tags: [] }) },
};
