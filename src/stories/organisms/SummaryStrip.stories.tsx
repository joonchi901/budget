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
          '방의 현재 범위에서 수입·지출·남은 금액. 지출은 고정지출을 포함합니다. 큰 금액은 320px에서도 칸 안에서 줄바꿈합니다.',
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
