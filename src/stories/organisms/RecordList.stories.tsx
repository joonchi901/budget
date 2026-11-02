import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RecordList } from '../../client/ledger';
import { roomRecords, type LedgerRecord } from '../../shared/ledger';
import { ledgers, november, records, year2026 } from '../fixtures';

const novemberRecords = records.filter((record) => record.ledgerId === november.id);

const meta = {
  title: '04 Organisms · 유기체/RecordList',
  component: RecordList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '내역을 날짜별로 묶은 목록(표 보기의 기본). 날짜마다 그날 수입·지출 합계를 붙이고, 각 줄에 구분·태그·메모와 부호가 있는 금액을 보여줍니다. RecordRow와 RecordDayGroup으로 조립합니다. 묶음 방에서는 원본 가계부 이름을 함께 표시합니다.',
      },
    },
  },
  args: { records: novemberRecords, ledgers },
  render: function Openable(args) {
    const [opened, setOpened] = useState<LedgerRecord>();
    return (
      <div style={{ maxWidth: 390 }}>
        <p role="status">{opened && `${opened.title} 열기`}</p>
        <RecordList {...args} onOpenRecord={setOpened} />
      </div>
    );
  },
} satisfies Meta<typeof RecordList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Newest: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const headings = c.getAllByRole('heading', { level: 2 });
    await expect(headings[0]).toHaveTextContent('11월 1일 (일)');
    await userEvent.click(c.getByRole('button', { name: /고기집_시험 응원 파티/ }));
    await expect(c.getByRole('status')).toHaveTextContent('고기집_시험 응원 파티 열기');
  },
};
export const GroupRoom: Story = {
  args: { records: roomRecords(ledgers, year2026, records), showLedger: true, order: 'oldest' },
};
export const Empty: Story = { args: { records: [] } };
