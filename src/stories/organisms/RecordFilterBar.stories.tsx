import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RecordFilterBar, type NatureFilter } from '../../client/ledger';

const meta = {
  title: '04 Organisms · 유기체/RecordFilterBar',
  component: RecordFilterBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '내역 목록 위의 조회 도구. 내용·메모 검색, 수입·지출 전환, 통계에서 고른 태그 조건(칩)을 보여주고 해제합니다.',
      },
    },
  },
  args: {
    query: '',
    onQueryChange: () => {},
    nature: 'all',
    onNatureChange: () => {},
    conditions: ['카테고리: 외식/배달/간식', '결제방식: KT카드'],
  },
  render: function Controlled(args) {
    const [query, setQuery] = useState(args.query);
    const [nature, setNature] = useState<NatureFilter>(args.nature);
    const [conditions, setConditions] = useState(args.conditions ?? []);
    return (
      <div style={{ maxWidth: 390 }}>
        <RecordFilterBar
          query={query}
          onQueryChange={setQuery}
          nature={nature}
          onNatureChange={setNature}
          conditions={conditions}
          onRemoveCondition={(item) => setConditions(conditions.filter((other) => other !== item))}
        />
      </div>
    );
  },
} satisfies Meta<typeof RecordFilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithConditions: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '지출' }));
    await expect(c.getByRole('button', { name: '지출' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(c.getByRole('button', { name: '결제방식: KT카드 필터 해제' }));
    await expect(c.queryByText('결제방식: KT카드')).toBeNull();
  },
};
export const Plain: Story = { args: { conditions: [] } };
