import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { CreateLedgerView, GroupSettingsView, LedgerSettingsView } from '../../client/views';
import { FIXTURE_TODAY, groups, ledgers, november } from '../fixtures';

const meta = {
  title: '06 Views · 화면/가계부 만들기·설정',
  component: CreateLedgerView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    docs: {
      description: {
        component:
          '가계부 만들기(빈 가계부 또는 복사해서 만들기), 가계부 설정(기본 정보·필드·태그 옵션·묶음·보관), 묶음 만들기·설정(포함할 가계부, 여러 묶음에 중복 가능). 모두 전체 화면 시트이며 저장 전 내용을 버릴 때 확인합니다.',
      },
    },
  },
  args: { ledgers, groups, today: FIXTURE_TODAY, onCreate: () => {}, onClose: () => {} },
} satisfies Meta<typeof CreateLedgerView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CopyNextMonth: Story = {
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <CreateLedgerView
          {...args}
          initialSourceId="nov"
          onCreate={({ ledger, groupIds, copyFixedFrom }) =>
            setLog(
              `${ledger.name} ${ledger.period.start}~${ledger.period.end} 필드 ${ledger.fields.map((field) => field.name).join('·')} 묶음 ${groupIds.join('·')} 고정지출 ${copyFixedFrom ?? '없음'}`,
            )
          }
        />
        <p role="status">{log}</p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: '만들기' }));
    await expect(page.getByText('이름을 입력해 주세요.')).toBeVisible();
    await userEvent.type(page.getByRole('textbox', { name: /^이름/ }), '12월');
    await userEvent.click(page.getByRole('button', { name: '2026' }));
    await userEvent.click(page.getByRole('button', { name: '만들기' }));
    await expect(page.getByRole('status')).toHaveTextContent(
      '12월 2026-11-23~2026-12-22 필드 결제방식·카테고리·누가·비고 묶음 g-2026 고정지출 nov',
    );
  },
};
export const Empty: Story = {};
export const LedgerSettings: Story = {
  render: function Logged() {
    const [log, setLog] = useState('');
    return (
      <>
        <LedgerSettingsView
          ledger={november}
          groups={groups}
          onSave={({ ledger, groupIds }) =>
            setLog(
              `${ledger.name} 숨김 ${ledger.fields
                .filter((field) => field.hidden)
                .map((field) => field.name)
                .join('·')} 묶음 ${groupIds.join('·')}`,
            )
          }
          onArchive={() => setLog('보관')}
          onClose={() => {}}
        />
        <p role="status">{log}</p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('switch', { name: '비고 표시' }));
    await userEvent.click(page.getByRole('button', { name: '2026' }));
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    await expect(page.getByRole('status')).toHaveTextContent('11월 숨김 비고 묶음');
  },
};
export const NewGroup: Story = {
  render: function Logged() {
    const [log, setLog] = useState('');
    return (
      <>
        <GroupSettingsView
          ledgers={ledgers}
          onSave={(group) => setLog(`${group.name}: ${group.ledgerIds.join('·')}`)}
          onClose={() => {}}
        />
        <p role="status">{log}</p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(page.getByRole('textbox', { name: /^이름/ }), '하반기');
    await userEvent.click(page.getByRole('button', { name: /^11월/ }));
    await userEvent.click(page.getByRole('button', { name: /^일본여행/ }));
    await userEvent.click(page.getByRole('button', { name: '만들기' }));
    await expect(page.getByRole('status')).toHaveTextContent('하반기: nov·trip');
  },
};
