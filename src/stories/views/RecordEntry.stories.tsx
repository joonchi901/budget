import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RecordEntryView } from '../../client/views';
import type { LedgerRecord } from '../../shared/ledger';
import { FIXTURE_TODAY, japanTrip, november, records, upcoming } from '../fixtures';

const meta = {
  title: '06 Views · 화면/내역 입력',
  component: RecordEntryView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    docs: {
      description: {
        component:
          '내역 추가·수정 전체 화면. 유형 → 금액 → 내용 → 날짜 → 가계부 필드 순서로 입력하고, 없는 태그는 그 자리에서 만듭니다. 저장 전 규칙(recordProblems)을 확인합니다. 묶음 방에서 열면 저장할 가계부를 먼저 고르며 날짜가 맞는 가계부를 제안합니다. 수정은 삭제를 한 번 더 확인합니다. 자산이 연동된 가계부에서는 "자산에 반영" 스위치가 기본으로 켜져 있습니다.',
      },
    },
  },
  args: {
    ledgers: [november],
    today: FIXTURE_TODAY,
    memberId: 'u1',
    suggestions: records.map((record) => record.title),
    onSave: () => {},
    onClose: () => {},
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    const [open, setOpen] = useState(true);
    return (
      <>
        {open && (
          <RecordEntryView
            {...args}
            onSave={(record: LedgerRecord, keepOpen, rule) => {
              setLog(
                `저장: ${record.title} ${record.amount} ${keepOpen ? '계속' : '닫기'}${record.notInAsset ? ' 자산 제외' : ''}${rule ? ` 반복 ${rule.day}일${rule.variable ? ' 변동' : ''}` : ''}${record.unconfirmed ? ' 확인 전' : ''}`,
              );
              if (!keepOpen) setOpen(false);
            }}
            onDelete={args.record ? (record) => setLog(`삭제: ${record.title}`) : undefined}
            onClose={() => setOpen(false)}
          />
        )}
        <p role="status">{log}</p>
      </>
    );
  },
} satisfies Meta<typeof RecordEntryView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Add: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // A new record starts as 지출, though 고정지출 is listed before it.
    await expect(page.getByRole('button', { name: '지출' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    await expect(page.getByRole('alert')).toHaveTextContent('내용, 금액');
    await userEvent.type(page.getByRole('textbox', { name: '금액' }), '13460');
    await userEvent.type(page.getByRole('textbox', { name: /내용/ }), '우리마트');
    await userEvent.click(page.getByRole('button', { name: '장보기' }));
    await userEvent.click(page.getByRole('button', { name: '저장하고 계속' }));
    await expect(page.getByText('저장: 우리마트 13460 계속')).toBeInTheDocument();
    // It says the record went, and is ready for the next one on 금액.
    await expect(page.getByText('저장했어요 · 우리마트 13,460원')).toBeVisible();
    await expect(page.getByRole('textbox', { name: '금액' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: '금액' })).toHaveFocus();
    await expect(page.getByRole('button', { name: '장보기' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Switching to 수입 drops the 지출 tags.
    await userEvent.click(page.getByRole('button', { name: '수입' }));
    await expect(page.getByRole('button', { name: '장보기' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  },
};
export const FromGroup: Story = {
  args: { ledgers: [japanTrip, november], date: '2026-10-10' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('combobox')).toHaveTextContent('일본여행');
    await expect(page.getByRole('combobox')).toHaveTextContent('날짜 맞음');
  },
};
export const Edit: Story = {
  args: { record: records.find((record) => record.title === '코스트코') },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('textbox', { name: '금액' })).toHaveValue('135,320');
    await userEvent.click(page.getByRole('button', { name: '삭제' }));
    await userEvent.click(page.getByRole('button', { name: '한 번 더 누르면 삭제' }));
    await expect(page.getByRole('status')).toHaveTextContent('삭제: 코스트코');
  },
};
export const InAsset: Story = {
  args: { assetNameFor: (ledgerId: string) => (ledgerId === 'nov' ? '생활비 통장' : undefined) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const inAsset = page.getByRole('switch', { name: '자산에 반영 · 생활비 통장' });
    await expect(inAsset).toBeChecked();
    await userEvent.click(inAsset);
    await userEvent.type(page.getByRole('textbox', { name: '금액' }), '50000');
    await userEvent.type(page.getByRole('textbox', { name: /내용/ }), '현금 인출');
    await userEvent.click(page.getByRole('button', { name: '장보기' }));
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    await expect(page.getByRole('status')).toHaveTextContent(
      '저장: 현금 인출 50000 닫기 자산 제외',
    );
  },
};
export const Repeat: Story = {
  args: { repeatable: () => true, date: '2026-11-15' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(page.getByRole('textbox', { name: '금액' }), '55000');
    await userEvent.type(page.getByRole('textbox', { name: /내용/ }), '통신비');
    // A 고정 유형 suggests repeating on this day.
    await userEvent.click(page.getByRole('button', { name: '고정지출' }));
    await userEvent.click(page.getByRole('button', { name: '매달 15일에 반복할까요?' }));
    await expect(page.getByRole('combobox', { name: '반복' })).toHaveTextContent('매달 15일');
    await userEvent.click(page.getByRole('switch', { name: '금액이 달마다 달라요' }));
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    await expect(page.getByRole('status')).toHaveTextContent(
      '저장: 통신비 55000 닫기 반복 15일 변동',
    );
  },
};
export const NoKinds: Story = {
  // A ledger without 유형 should not reach here, but if it does the sheet still opens.
  args: { ledgers: [{ ...november, kinds: [] }] },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(page.getByRole('textbox', { name: '금액' }), '1000');
    await userEvent.type(page.getByRole('textbox', { name: /내용/ }), '우리마트');
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    await expect(page.getByRole('alert')).toHaveTextContent('유형');
  },
};
export const NotOwner: Story = {
  play: async ({ canvasElement }) => {
    // Only the owner starts a 반복 내역.
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('combobox', { name: '반복' }),
    ).toBeNull();
  },
};
export const CheckAmount: Story = {
  args: { record: upcoming[1] },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByText(/이번 금액을 확인하고 저장해 주세요/)).toBeVisible();
    const amount = page.getByRole('textbox', { name: '금액' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '41200');
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    // Saving checks it: 금액 확인 goes.
    await expect(page.getByRole('status')).toHaveTextContent('저장: 도시가스 41200 닫기');
    await expect(page.getByRole('status')).not.toHaveTextContent('확인 전');
  },
};
