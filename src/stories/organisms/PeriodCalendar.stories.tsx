import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DayRecords, PeriodCalendar } from '../../client/ledger';
import { Stack } from '../../client/ui';
import { FIXTURE_TODAY, japanTrip, ledgers, november, records } from '../fixtures';

const novemberRecords = records.filter((record) => record.ledgerId === november.id);

const meta = {
  title: '04 Organisms · 유기체/PeriodCalendar',
  component: PeriodCalendar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '가계부 기간에 맞춘 주 단위 달력. 기간 밖 날은 흐리게 두고 고를 수 없습니다. 칸에는 지출을 짧게(6.4만), 수입은 초록 점으로 표시하고, 버튼 이름에는 전체 금액을 담습니다. 날짜를 고르면 DayRecords가 그날 내역과 "이 날짜로 추가"를 보여줍니다.',
      },
    },
  },
  args: {
    period: november.period,
    records: novemberRecords,
    ledgers,
    today: FIXTURE_TODAY,
    onSelect: () => {},
  },
  render: function WithDay(args) {
    const [selected, setSelected] = useState<string>();
    const [added, setAdded] = useState('');
    return (
      <Stack gap={4} style={{ maxWidth: 390 }}>
        <PeriodCalendar {...args} selected={selected} onSelect={setSelected} />
        {selected && (
          <DayRecords
            date={selected}
            records={args.records.filter((record) => record.date === selected)}
            ledgers={args.ledgers}
            onAdd={setAdded}
          />
        )}
        <p role="status">{added && `${added} 추가`}</p>
      </Stack>
    );
  },
} satisfies Meta<typeof PeriodCalendar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PayPeriod: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('button', { name: /10월 22일/ })).toBeDisabled();
    const day = c.getByRole('button', { name: '10월 29일 (목), 지출 263,452원' });
    await userEvent.click(day);
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    await expect(c.getByRole('list', { name: '10월 29일 (목) 내역' }).children).toHaveLength(8);
    await userEvent.click(c.getByRole('button', { name: '이 날짜로 추가' }));
    await expect(c.getByRole('status')).toHaveTextContent('2026-10-29 추가');
  },
};
export const Trip: Story = {
  args: { period: japanTrip.period, records: records.filter((r) => r.ledgerId === japanTrip.id) },
};
