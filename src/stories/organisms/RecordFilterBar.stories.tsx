import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RecordFilterBar } from '../../client/ledger';
import { tagAxes } from '../../shared/ledger';
import { november } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/RecordFilterBar',
  component: RecordFilterBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '내역 위의 조회 도구 한 줄: 검색, 조회 조건 버튼, 그리고 방에서는 표/캘린더 전환. 조건 패널에서 유형·결제방식·카테고리 같은 태그를 여러 개 고를 수 있고, 같은 필드 안에서는 하나라도 맞으면, 다른 필드끼리는 모두 맞아야 보여줍니다. 수입·지출은 유형 태그로 거릅니다. 조건 패널에는 넓게 보기도 있고, 적용한 조건(고른 태그, 통계에서 고른 태그)은 칩으로 남아 바로 해제합니다. 표/캘린더 전환은 아이콘으로 보여줍니다. 방 본문이 720px 이상이면 아이콘과 넓게 보기 대신 캘린더/테이블 토글이 나옵니다. 조건이 걸려 있으면 버튼이 강조됩니다.',
      },
    },
  },
  args: {
    query: '',
    onQueryChange: () => {},
    wide: false,
    onWideChange: () => {},
    conditions: [
      { axis: '카테고리', name: '외식/배달/간식' },
      { axis: '결제방식', name: 'KT카드' },
    ],
  },
  render: function Controlled(args) {
    const [query, setQuery] = useState(args.query);
    const [wide, setWide] = useState(args.wide);
    const [conditions, setConditions] = useState(args.conditions ?? []);
    return (
      <div style={{ maxWidth: 390 }}>
        <RecordFilterBar
          query={query}
          onQueryChange={setQuery}
          wide={wide}
          onWideChange={setWide}
          conditions={conditions}
          onRemoveCondition={(item) => setConditions(conditions.filter((other) => other !== item))}
          tagAxes={tagAxes([november])}
          onConditionsChange={(axis, names) =>
            setConditions([
              ...conditions.filter((other) => other.axis !== axis),
              ...names.map((name) => ({ axis, name })),
            ])
          }
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
    await expect(c.queryByRole('group', { name: '수입·지출 보기' })).toBeNull();
    await userEvent.click(c.getByRole('button', { name: '결제방식: KT카드 필터 해제' }));
    await expect(c.queryByText('결제방식: KT카드')).toBeNull();
  },
};
export const Plain: Story = { args: { conditions: [] } };
export const WithDisplayToggle: Story = {
  args: { conditions: [] },
  render: function Controlled(args) {
    const [display, setDisplay] = useState<'list' | 'calendar'>('list');
    return (
      <div style={{ maxWidth: 390 }}>
        <RecordFilterBar {...args} display={display} onDisplayChange={setDisplay} />
        <p role="status">{display}</p>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('button', { name: '표' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await expect(c.getByRole('status')).toHaveTextContent('calendar');
  },
};
export const TagFilters: Story = {
  args: { conditions: [] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '조회 조건' }));
    await userEvent.click(c.getByRole('button', { name: '장보기' }));
    await userEvent.click(c.getByRole('button', { name: 'KT카드' }));
    await expect(c.getByRole('button', { name: '카테고리: 장보기 필터 해제' })).toBeVisible();
    await expect(c.getByRole('button', { name: '결제방식: KT카드 필터 해제' })).toBeVisible();
    await expect(c.getByRole('button', { name: '조회 조건' })).toHaveAttribute('data-active');
  },
};
