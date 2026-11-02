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
          '내역 위의 조회 도구 한 줄: 검색과 조회 조건 버튼. 조건 패널에서 수입·지출과 넓게 보기를 고르고, 적용한 조건(수입만·지출만, 통계에서 고른 태그)은 칩으로 남아 바로 해제합니다. 조건이 걸려 있으면 버튼이 강조됩니다.',
      },
    },
  },
  args: {
    query: '',
    onQueryChange: () => {},
    nature: 'all',
    onNatureChange: () => {},
    wide: false,
    onWideChange: () => {},
    conditions: ['카테고리: 외식/배달/간식', '결제방식: KT카드'],
  },
  render: function Controlled(args) {
    const [query, setQuery] = useState(args.query);
    const [nature, setNature] = useState<NatureFilter>(args.nature);
    const [wide, setWide] = useState(args.wide);
    const [conditions, setConditions] = useState(args.conditions ?? []);
    return (
      <div style={{ maxWidth: 390 }}>
        <RecordFilterBar
          query={query}
          onQueryChange={setQuery}
          nature={nature}
          onNatureChange={setNature}
          wide={wide}
          onWideChange={setWide}
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
    const toggle = c.getByRole('button', { name: '조회 조건' });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(c.getByRole('button', { name: '지출' }));
    await expect(c.getByRole('button', { name: '지출만 필터 해제' })).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '결제방식: KT카드 필터 해제' }));
    await expect(c.queryByText('결제방식: KT카드')).toBeNull();
    await userEvent.click(c.getByRole('button', { name: '지출만 필터 해제' }));
    await expect(c.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
  },
};
export const Plain: Story = { args: { conditions: [] } };
