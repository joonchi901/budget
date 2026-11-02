import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LedgerRoomView } from '../../client/views';
import { FIXTURE_TODAY, december, november, records } from '../fixtures';

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
          '가계부 하나의 방. 상단에 방 이름·기간·요약과 표·캘린더·통계 전환이 고정되고, 하단에 내역 추가가 있습니다. 표는 날짜별 목록(넓게 보기로 전체 열), 캘린더는 기간 달력과 날짜별 내역, 통계는 태그별 금액이며 통계 항목을 누르면 그 조건의 표로 이동합니다.',
      },
    },
  },
  args: {
    ledger: november,
    records,
    today: FIXTURE_TODAY,
    onBack: () => {},
    onAddRecord: () => {},
    onOpenRecord: () => {},
    onOpenSettings: () => {},
    onCopy: () => {},
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
