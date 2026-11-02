import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LedgerRoomView } from '../../client/views';
import { FIXTURE_TODAY, december, ledgers, november, records, travel, year2026 } from '../fixtures';

const meta = {
  title: '06 Views · 화면/가계부 방',
  component: LedgerRoomView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '가계부 하나의 방. 상단에 방 이름·기간·요약, 하단에 표·캘린더·통계 전환과 내역 추가가 있습니다. 하위 가계부가 있으면(상위 가계부) 아래 모든 내역을 한 번씩 모아 원본 가계부를 표시하고, 캘린더는 월 단위로 넘기며, 하위 보기에서 각 하위 방으로 들어갑니다. 통계 항목을 누르면 그 조건의 표로 이동합니다.',
      },
    },
  },
  args: {
    ledger: november,
    ledgers,
    records,
    today: FIXTURE_TODAY,
    onBack: () => {},
    onAddRecord: () => {},
    onOpenRecord: () => {},
    onOpenSettings: () => {},
    onCopy: () => {},
    onOpenLedger: () => {},
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <LedgerRoomView
          {...args}
          onAddRecord={(date) => setLog(`추가: ${date ?? '오늘'}`)}
          onOpenRecord={(record) => setLog(`열기: ${record.title}`)}
          onOpenSettings={() => setLog('설정')}
          onCopy={() => setLog('복사')}
          onOpenLedger={(ledger) => setLog(`하위: ${ledger.name}`)}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
} satisfies Meta<typeof LedgerRoomView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Table: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('heading', { level: 1, name: '11월' })).toBeVisible();
    await expect(c.queryByRole('button', { name: '하위' })).toBeNull();
    await userEvent.type(c.getByRole('searchbox', { name: '내역 검색' }), '쿠팡이츠');
    await expect(c.getAllByRole('button', { name: /쿠팡이츠/ })).toHaveLength(6);
    await userEvent.click(c.getByRole('button', { name: '조회 조건' }));
    await userEvent.click(c.getByRole('switch', { name: '넓게 보기' }));
    await expect(c.getByRole('region', { name: '내역 표' })).toBeVisible();
  },
};
export const CalendarDay: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await userEvent.click(c.getByRole('button', { name: /^10월 31일/ }));
    await expect(page.getByRole('dialog', { name: '10월 31일 (토)' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: '이 날짜로 추가' }));
    await expect(c.getByRole('status')).toHaveTextContent('추가: 2026-10-31');
  },
};
export const StatsToTable: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '통계' }));
    await userEvent.click(c.getByRole('button', { name: /^용돈/ }));
    await expect(c.getByRole('button', { name: '카테고리: 용돈 필터 해제' })).toBeVisible();
    await expect(c.getByRole('button', { name: '지출만 필터 해제' })).toBeVisible();
    await expect(c.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('11월 1일');
  },
};
export const Empty: Story = { args: { ledger: december } };
export const ParentYear: Story = {
  args: { ledger: year2026 },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText('하위 2개')).toBeVisible();
    await expect(c.getByText('남은 금액').nextElementSibling).toHaveTextContent('5,645,218원');
    await expect(c.queryByRole('menuitem', { name: '복사해서 만들기' })).toBeNull();
    await userEvent.click(c.getByRole('button', { name: '하위' }));
    await userEvent.click(c.getByRole('button', { name: /^하반기/ }));
    await expect(c.getByRole('status')).toHaveTextContent('하위: 하반기');
  },
};
export const ParentMonthCalendar: Story = {
  args: { ledger: year2026 },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await expect(c.getByRole('heading', { name: '2026년 11월' })).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '이전 달' }));
    await expect(c.getByRole('heading', { name: '2026년 10월' })).toBeVisible();
    await expect(c.getByRole('button', { name: /^10월 9일 \(금\), 지출 692,000원/ })).toBeEnabled();
  },
};
export const ParentTravel: Story = { args: { ledger: travel } };
