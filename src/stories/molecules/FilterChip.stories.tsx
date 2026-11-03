import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { FilterChip, Inline } from '../../client/ui';

const meta = {
  title: '03 Molecules · 분자/FilterChip',
  component: FilterChip,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '적용한 조회 조건. 칩 전체가 해제 버튼이며 접근 이름에 무엇을 해제하는지 담습니다. 긴 이름은 줄바꿈합니다.',
      },
    },
  },
  args: { label: '카테고리: 장보기', onRemove: () => {} },
} satisfies Meta<typeof FilterChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Applied: Story = {
  render: function AppliedFilters() {
    const [filters, setFilters] = useState([
      '유형: 지출',
      '카테고리: 외식/배달/간식',
      '누가: 예디',
    ]);
    return (
      <Inline gap={2}>
        {filters.map((label) => (
          <FilterChip
            key={label}
            label={label}
            onRemove={() => setFilters(filters.filter((item) => item !== label))}
          />
        ))}
      </Inline>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '누가: 예디 필터 해제' }));
    await expect(c.queryByText('누가: 예디')).toBeNull();
    await expect(c.getAllByRole('button')).toHaveLength(2);
  },
};
