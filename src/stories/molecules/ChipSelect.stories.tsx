import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ChipSelect, type ChipOption } from '../../client/ui';

const categories: ChipOption[] = [
  { id: 'c1', name: '외식/배달/간식', color: '#D28C70' },
  { id: 'c2', name: '장보기', color: '#64866F' },
  { id: 'c3', name: '병원/약국', color: '#6C89A4' },
  { id: 'c4', name: '관리비', color: '#9176A6' },
  { id: 'c5', name: '예전 분류', color: '#8A8A8A', archived: true },
];
const people: ChipOption[] = [
  { id: 'p1', name: '준상', color: '#7CC7F2' },
  { id: 'p2', name: '예디', color: '#F08A5D' },
  { id: 'p3', name: '예미', color: '#A7D7C5' },
];

const meta = {
  title: '03 Molecules · 분자/ChipSelect',
  component: ChipSelect,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Notion 속성처럼 옵션을 칩으로 고르는 선택. 단일·다중 선택을 지원하고, 입력 도중 새 옵션을 바로 추가합니다(Enter 추가, Escape 취소). 같은 이름이 있으면 새로 만들지 않고 그 옵션을 고릅니다. 선택한 칩은 태그 저장 색상으로 칠하고 체크 표시를 함께 보여 색만으로 구분하지 않습니다. 보관된 옵션은 선택돼 있을 때만 보입니다.',
      },
    },
  },
  args: { label: '카테고리', options: categories, value: ['c2'], onValueChange: () => {} },
  render: function Controlled(args) {
    const [options, setOptions] = useState(args.options);
    const [value, setValue] = useState(args.value);
    return (
      <div style={{ maxWidth: 390 }}>
        <ChipSelect
          {...args}
          options={options}
          value={value}
          onValueChange={setValue}
          onCreateOption={(name, color) => {
            const id = `new-${options.length + 1}`;
            setOptions([...options, { id, name, color }]);
            return id;
          }}
        />
        <p role="status">
          {options
            .filter((option) => option.id.startsWith('new-'))
            .map((option) => `${option.name} ${option.color}`)
            .join(', ')}
        </p>
      </div>
    );
  },
} satisfies Meta<typeof ChipSelect>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.queryByRole('button', { name: /예전 분류/ })).toBeNull();
    await userEvent.click(c.getByRole('button', { name: '병원/약국' }));
    await expect(c.getByRole('button', { name: '병원/약국' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(c.getByRole('button', { name: '장보기' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  },
};
export const Multiple: Story = {
  args: { label: '누가', options: people, value: ['p1'], multiple: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '예디' }));
    await expect(c.getByRole('button', { name: '준상' })).toHaveAttribute('aria-pressed', 'true');
    await expect(c.getByRole('button', { name: '예디' })).toHaveAttribute('aria-pressed', 'true');
  },
};
export const AddOption: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '카테고리 옵션 추가' }));
    await userEvent.type(c.getByRole('textbox', { name: '카테고리 새 옵션 이름' }), '육아{Enter}');
    await expect(c.getByRole('button', { name: '육아' })).toHaveAttribute('aria-pressed', 'true');
    // 외식·장보기·병원·관리비 색을 피해 팔레트에서 아직 안 쓴 첫 색을 받는다.
    await expect(c.getByRole('status')).toHaveTextContent('육아 #F08A5D');
    await expect(c.getByRole('button', { name: '카테고리 옵션 추가' })).toHaveFocus();
    await userEvent.click(c.getByRole('button', { name: '카테고리 옵션 추가' }));
    await userEvent.type(
      c.getByRole('textbox', { name: '카테고리 새 옵션 이름' }),
      '장보기{Enter}',
    );
    await expect(c.getAllByRole('button', { name: '장보기' })).toHaveLength(1);
    await expect(c.getByRole('button', { name: '장보기' })).toHaveAttribute('aria-pressed', 'true');
  },
};
export const CancelAdding: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '카테고리 옵션 추가' }));
    await userEvent.type(
      c.getByRole('textbox', { name: '카테고리 새 옵션 이름' }),
      '취소할 옵션{Escape}',
    );
    await expect(c.queryByRole('button', { name: '취소할 옵션' })).toBeNull();
    await expect(c.getByRole('button', { name: '카테고리 옵션 추가' })).toHaveFocus();
  },
};
export const ArchivedSelected: Story = {
  args: { value: ['c5'] },
  parameters: {
    docs: {
      description: { story: '보관된 옵션도 이미 선택된 값이면 보관됨 표시와 함께 남습니다.' },
    },
  },
};
export const Disabled: Story = { args: { disabled: true } };
export const UnsafeColor: Story = {
  args: {
    label: '카테고리',
    value: [],
    options: [{ id: 'x1', name: '외부 색', color: 'url(https://example.invalid/track.png)' }],
  },
  parameters: {
    docs: {
      description: {
        story: '저장된 색이 #RRGGBB가 아니면 칩의 색 점에 쓰지 않습니다.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const dot = canvasElement.querySelector<HTMLElement>('.ui-chip-dot')!;
    await expect(getComputedStyle(dot).backgroundImage).toBe('none');
  },
};
export const PickColorWhileAdding: Story = {
  parameters: {
    docs: {
      description: {
        story:
          '추가할 때 이름 옆 색 견본을 눌러 팔레트에서 색을 고를 수 있습니다. 고르지 않으면 자동 색을 씁니다.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '카테고리 옵션 추가' }));
    const name = c.getByRole('textbox', { name: '카테고리 새 옵션 이름' });
    await userEvent.type(name, '여행');
    await userEvent.click(c.getByRole('button', { name: '카테고리 새 옵션 색상' }));
    await userEvent.click(c.getByRole('button', { name: '#38735B' }));
    await userEvent.type(name, '{Enter}');
    await expect(c.getByRole('status')).toHaveTextContent('여행 #38735B');
    await expect(c.getByRole('button', { name: '여행' })).toHaveAttribute('aria-pressed', 'true');
  },
};
