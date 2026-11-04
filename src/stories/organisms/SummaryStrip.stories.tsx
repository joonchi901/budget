import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { SummaryStrip } from '../../client/ledger';
import { totals } from '../../shared/ledger';
import { ledgers, november, records } from '../fixtures';

const novemberTotals = totals(
  records.filter((record) => record.ledgerId === november.id),
  ledgers,
);

const meta = {
  title: '04 Organisms · 유기체/SummaryStrip',
  component: SummaryStrip,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '방의 현재 범위에서 수입·지출·남은 금액을 전체 숫자로 보여줍니다. 지출은 고정지출 같은 지출 유형을 포함합니다. 금액이 1억 미만이면 세 칸, 하나라도 1억 이상이면 세 줄(이름 왼쪽, 금액 오른쪽)로 바뀌어 숫자가 한 줄에 다 보입니다.',
      },
    },
  },
  args: { totals: novemberTotals },
} satisfies Meta<typeof SummaryStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const November: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText('남은 금액').nextElementSibling).toHaveTextContent('6,457,118원');
  },
};
export const Overspent: Story = {
  args: { totals: { income: 0, expense: 811900, balance: -811900 } },
};
export const LargeAmounts: Story = {
  args: { totals: { income: 3_250_000_000, expense: 1_234_567_890, balance: 2_015_432_110 } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText('수입').nextElementSibling).toHaveTextContent('3,250,000,000원');
    await expect(canvasElement.querySelector('.ledger-summary')).toHaveAttribute(
      'data-layout',
      'rows',
    );
  },
};
export const Scheduled: Story = {
  args: { scheduled: 55000 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('예정 55,000원')).toBeVisible();
  },
};
