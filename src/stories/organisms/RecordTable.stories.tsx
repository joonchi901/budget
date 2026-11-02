import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { RecordTable } from '../../client/ledger';
import { roomRecords } from '../../shared/ledger';
import { ledgers, november, records, year2026 } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/RecordTable',
  component: RecordTable,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Notion처럼 모든 열을 보는 넓게 보기. 날짜·구분·내용·금액 다음에 가계부 필드를 이름별로 이어 붙이고, 가로로 길면 이름 있는 스크롤 영역에서 넘깁니다.',
      },
    },
  },
  args: { records: records.filter((record) => record.ledgerId === november.id), ledgers },
} satisfies Meta<typeof RecordTable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const November: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const headers = c.getAllByRole('columnheader').map((cell) => cell.textContent);
    await expect(headers).toEqual([
      '날짜',
      '구분',
      '내용',
      '금액',
      '결제방식',
      '카테고리',
      '누가',
      '비고',
    ]);
    await expect(c.getByRole('region', { name: '내역 표' })).toHaveAttribute('tabindex', '0');
  },
};
export const GroupRoom: Story = {
  args: { records: roomRecords(ledgers, year2026, records), showLedger: true },
};
