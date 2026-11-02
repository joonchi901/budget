import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { StatsBreakdown } from '../../client/ledger';
import { leafLedgers, roomRecords, type KindOption } from '../../shared/ledger';
import { ledgers, november, records, year2026 } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/StatsBreakdown',
  component: StatsBreakdown,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '태그 단위 통계. 기준(구분 또는 가계부의 선택형 필드)과 지출·수입을 고르면 항목별 금액·비율을 막대로 보여줍니다. 묶음에서는 이름이 같은 옵션을 합칩니다. 다중 선택(누가)은 사람마다 전체 금액으로 세며 안내를 함께 보여줍니다. 항목을 누르면 그 조건의 내역으로 이동하도록 onSelect를 부릅니다.',
      },
    },
  },
  args: {
    records: records.filter((record) => record.ledgerId === november.id),
    ledgers,
    axis: '카테고리',
    onAxisChange: () => {},
    nature: 'expense',
    onNatureChange: () => {},
  },
  render: function Controlled(args) {
    const [axis, setAxis] = useState(args.axis);
    const [nature, setNature] = useState<KindOption['nature']>(args.nature);
    const [picked, setPicked] = useState('');
    return (
      <div style={{ maxWidth: 390 }}>
        <StatsBreakdown
          {...args}
          axis={axis}
          onAxisChange={setAxis}
          nature={nature}
          onNatureChange={setNature}
          onSelect={(field, name) => setPicked(`${field}: ${name}`)}
        />
        <p role="status">{picked}</p>
      </div>
    );
  },
} satisfies Meta<typeof StatsBreakdown>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ByCategory: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const rows = c.getAllByRole('button', { name: /원/ });
    for (const text of ['용돈', '26.7%', '500,000원'])
      await expect(rows[0]).toHaveTextContent(text);
    await userEvent.click(c.getByRole('button', { name: /^장보기/ }));
    await expect(c.getByRole('status')).toHaveTextContent('카테고리: 장보기');
  },
};
export const ByPerson: Story = {
  args: { axis: '누가' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText(/사람마다 전체 금액/)).toBeVisible();
    const first = c.getAllByRole('button', { name: /원/ })[0];
    for (const text of ['공동', '1,000,152원']) await expect(first).toHaveTextContent(text);
  },
};
export const GroupByPayment: Story = {
  args: { records: roomRecords(ledgers, year2026, records), axis: '결제방식' },
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement).getAllByRole('button', { name: /원/ });
    for (const text of ['국민카드', '1,083,572원']) await expect(rows[0]).toHaveTextContent(text);
  },
};
export const Income: Story = { args: { nature: 'income', axis: '구분' } };
export const GroupByLedger: Story = {
  args: {
    records: roomRecords(ledgers, year2026, records),
    ledgers: leafLedgers(ledgers, year2026),
    axis: '가계부',
  },
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement).getAllByRole('button', { name: /원/ });
    for (const text of ['11월', '1,875,052원']) await expect(rows[0]).toHaveTextContent(text);
    for (const text of ['일본여행', '811,900원']) await expect(rows[1]).toHaveTextContent(text);
  },
};
