import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { GroupRoomView } from '../../client/views';
import { FIXTURE_TODAY, groups, ledgers, records } from '../fixtures';

const meta = {
  title: '06 Views · 화면/묶음 방',
  component: GroupRoomView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '묶음의 방. 포함한 가계부의 내역을 한 번씩만 모아 같은 표·캘린더·통계로 보고, 내역마다 원본 가계부를 표시합니다. 캘린더는 월 단위로 넘기고, 가계부별 보기에서 각 가계부 방으로 들어갑니다.',
      },
    },
  },
  args: {
    group: groups[0],
    ledgers,
    records,
    today: FIXTURE_TODAY,
    onBack: () => {},
    onAddRecord: () => {},
    onOpenRecord: () => {},
    onOpenSettings: () => {},
    onOpenLedger: () => {},
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <GroupRoomView {...args} onOpenLedger={(ledger) => setLog(`가계부: ${ledger.name}`)} />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
} satisfies Meta<typeof GroupRoomView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Year: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText('남은 금액').nextElementSibling).toHaveTextContent('5,645,218원');
    await userEvent.click(c.getByRole('button', { name: '가계부별' }));
    await userEvent.click(c.getByRole('button', { name: /^일본여행/ }));
    await expect(c.getByRole('status')).toHaveTextContent('가계부: 일본여행');
  },
};
export const MonthCalendar: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await expect(c.getByRole('heading', { name: '2026년 11월' })).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '이전 달' }));
    await expect(c.getByRole('heading', { name: '2026년 10월' })).toBeVisible();
    await expect(c.getByRole('button', { name: /^10월 9일 \(금\), 지출 692,000원/ })).toBeEnabled();
  },
};
export const Travel: Story = { args: { group: groups[1] } };
