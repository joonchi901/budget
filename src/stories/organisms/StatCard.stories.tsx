import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { StatCardForm, StatCardView } from '../../client/ledger';
import { leafLedgers, roomRecords, type StatCard } from '../../shared/ledger';
import { FIXTURE_TODAY, ledgers, november, records, year2026 } from '../fixtures';

const novemberRecords = records.filter((record) => record.ledgerId === november.id);

const meta = {
  title: '04 Organisms · 유기체/StatCardView',
  component: StatCardView,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '통계 탭의 차트 하나. 요약(합계·하루 평균·건수·가장 큰 내역), 순위(태그별 막대), 비율(다섯 개와 기타로 접은 도넛과 값 목록), 추이(날짜·주·월 막대, 기준별로 쌓기)가 있고, 모두 방의 조회 조건이 걸린 내역을 봅니다. 오른쪽 위에서 기준을 잠깐 바꿀 수 있고, 소유자에게는 그 기준을 기본으로 저장하는 버튼이 보입니다. 태그를 누르면 그 태그가 조회 조건이 됩니다. 추이는 마우스나 화살표 키로 막대를 살펴보고, 두 달이 넘는 날짜 막대는 주·월로 묶습니다. 편집 중에는 기준 대신 순서·설정·삭제 버튼이 나옵니다.',
      },
    },
  },
  args: {
    card: { id: 'rank', chart: 'rank', nature: 'expense', axis: '카테고리' },
    records: novemberRecords,
    ledgers: [november],
    period: november.period,
    today: FIXTURE_TODAY,
  },
  render: function Controlled(args) {
    const [axis, setAxis] = useState<string>();
    const [log, setLog] = useState('');
    return (
      <div style={{ maxWidth: 390 }}>
        <StatCardView
          {...args}
          axis={axis}
          onAxisChange={args.actions ? undefined : setAxis}
          onSaveAxis={axis ? () => setLog(`저장: ${axis}`) : undefined}
          onSelect={(field, name) => setLog(`${field}: ${name}`)}
        />
        <p role="status">{log}</p>
      </div>
    );
  },
} satisfies Meta<typeof StatCardView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Total: Story = {
  args: { card: { id: 'total', chart: 'total', nature: 'expense' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('heading', { name: '지출 요약' })).toBeVisible();
    for (const label of ['합계', '하루 평균', '건수', '가장 큰 지출'])
      await expect(c.getByText(label)).toBeVisible();
  },
};
export const Rank: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getAllByRole('button', { name: /원/ })[0]).toHaveTextContent('용돈');
    // A 기준 picked for now; the owner may keep it.
    await userEvent.click(c.getByRole('combobox', { name: '지출 순위 기준' }));
    await userEvent.click(c.getByRole('option', { name: '결제방식별' }));
    await expect(c.getByRole('list', { name: '결제방식별 지출' })).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '이 기준을 기본으로 저장' }));
    await expect(c.getByRole('status')).toHaveTextContent('저장: 결제방식');
    // Choosing a tag asks the room to narrow to it.
    await userEvent.click(c.getAllByRole('button', { name: /원/ })[0]);
    await expect(c.getByRole('status')).toHaveTextContent(/^결제방식: /);
  },
};
export const Donut: Story = {
  args: { card: { id: 'donut', chart: 'donut', nature: 'expense', axis: '카테고리' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // At most six parts: the five largest and 기타.
    const rows = within(c.getByRole('list', { name: '카테고리별 지출 비율' })).getAllByRole(
      'listitem',
    );
    await expect(rows.length).toBeLessThanOrEqual(6);
    await expect(rows.at(-1)).toHaveTextContent('기타');
    // A multi-select field cannot be a part of the whole.
    await userEvent.click(c.getByRole('combobox', { name: '지출 비율 기준' }));
    await expect(c.queryByRole('option', { name: '누가별' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(c.getByRole('button', { name: /^용돈/ }));
    await expect(c.getByRole('status')).toHaveTextContent('카테고리: 용돈');
  },
};
export const Trend: Story = {
  args: { card: { id: 'trend', chart: 'trend', nature: 'expense', bucket: 'day', wide: true } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const readout = canvasElement.querySelector('.ledger-trend-readout')!;
    await expect(readout).toHaveTextContent(/^가장 많은 /);
    // The arrow keys step through the columns.
    c.getByRole('group', { name: /^날짜별 지출/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(readout).not.toHaveTextContent(/^가장 많은 /);
  },
};
export const StackedByLedger: Story = {
  args: {
    card: { id: 'trend', chart: 'trend', nature: 'expense', bucket: 'month', axis: '가계부' },
    records: roomRecords(ledgers, year2026, records),
    ledgers: leafLedgers(ledgers, year2026),
    period: year2026.period,
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('heading', { name: '월별 지출' })).toBeVisible();
    await expect(within(c.getByRole('list', { name: '범례' })).getByText('11월')).toBeVisible();
  },
};
export const DaysBecomeWeeks: Story = {
  args: {
    card: { id: 'trend', chart: 'trend', nature: 'expense', bucket: 'day' },
    records: roomRecords(ledgers, year2026, records),
    ledgers: leafLedgers(ledgers, year2026),
    period: year2026.period,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('주 단위로 묶었어요')).toBeVisible();
  },
};
export const Income: Story = {
  args: { card: { id: 'rank', chart: 'rank', nature: 'income', axis: '유형' } },
};
export const Editing: Story = {
  args: { actions: <span className="small muted">순서 · 설정 · 삭제</span> },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // In 편집 the title names its 기준, and the switch gives way to the actions.
    await expect(c.getByRole('heading', { name: '카테고리별 지출 순위' })).toBeVisible();
    await expect(c.queryByRole('combobox')).toBeNull();
  },
};

export const Form: StoryObj<typeof StatCardForm> = {
  render: function Draft() {
    const [card, setCard] = useState<StatCard>({
      id: 'rank',
      chart: 'rank',
      nature: 'expense',
      axis: '누가',
    });
    return (
      <div style={{ maxWidth: 390 }}>
        <StatCardForm card={card} ledgers={[november]} onChange={setCard} />
        <p role="status" style={{ overflowWrap: 'anywhere' }}>
          {JSON.stringify(card)}
        </p>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // 비율 cannot split 누가 (several people per record), so it falls back to 유형.
    await userEvent.click(c.getByRole('button', { name: '비율' }));
    await expect(c.getByRole('combobox', { name: '기준' })).toHaveTextContent('유형별');
    // 추이 keeps a 기준 it can stack by.
    await userEvent.click(c.getByRole('button', { name: '추이' }));
    await expect(c.getByRole('combobox', { name: '나눠 볼 기준' })).toHaveTextContent('유형별');
    await userEvent.click(c.getByRole('button', { name: '주' }));
    await expect(c.getByRole('status')).toHaveTextContent('"bucket":"week"');
  },
};
