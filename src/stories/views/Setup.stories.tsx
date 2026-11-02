import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { CreateLedgerView, LedgerSettingsView } from '../../client/views';
import { FIXTURE_TODAY, ledgers, november, year2026 } from '../fixtures';

const meta = {
  title: '06 Views · 화면/가계부 만들기·설정',
  component: CreateLedgerView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    docs: {
      description: {
        component:
          '가계부 만들기와 설정. 내역을 적는 가계부는 빈 가계부나 복사해서 만들기(기간 한 달 뒤, 고정지출 가져오기)로 시작하고 필드·태그 옵션을 정합니다. 상위 가계부는 하위 가계부만 고릅니다. 둘 다 여러 상위 가계부에 속할 수 있고, 순환이 생기는 선택지는 보이지 않습니다.',
      },
    },
  },
  args: { ledgers, today: FIXTURE_TODAY, onCreate: () => {}, onClose: () => {} },
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
          onCreate={({ ledger, parentIds, copyFixedFrom }) =>
            setLog(
              `${ledger.name} ${ledger.period.start}~${ledger.period.end} 필드 ${ledger.fields.map((field) => field.name).join('·')} 상위 ${parentIds.join('·')} 고정지출 ${copyFixedFrom ?? '없음'}`,
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
    await userEvent.click(page.getByRole('button', { name: '하반기' }));
    await userEvent.click(page.getByRole('button', { name: '만들기' }));
    await expect(page.getByRole('status')).toHaveTextContent(
      '12월 2026-11-23~2026-12-22 필드 결제방식·카테고리·누가·비고 상위 h2 고정지출 nov',
    );
  },
};
export const Empty: Story = {};
export const CreateParent: Story = {
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <CreateLedgerView
          {...args}
          onCreate={({ ledger, parentIds }) =>
            setLog(
              `${ledger.name} 하위 ${ledger.childIds.join('·')} 상위 ${parentIds.join('·')} 기간 ${ledger.period.start}~${ledger.period.end}`,
            )
          }
        />
        <p role="status">{log}</p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: '상위 가계부' }));
    await expect(page.queryByRole('button', { name: '필드 추가' })).toBeNull();
    await userEvent.type(page.getByRole('textbox', { name: /^이름/ }), '가을');
    await userEvent.click(page.getByRole('button', { name: /^11월/ }));
    await userEvent.click(page.getByRole('button', { name: /^일본여행/ }));
    await userEvent.click(page.getByRole('button', { name: '2026' }));
    await userEvent.click(page.getByRole('button', { name: '만들기' }));
    await expect(page.getByRole('status')).toHaveTextContent(
      '가을 하위 nov·trip 상위 y2026 기간 2026-10-09~2026-11-22',
    );
  },
};
export const LedgerSettings: Story = {
  render: function Logged() {
    const [log, setLog] = useState('');
    return (
      <>
        <LedgerSettingsView
          ledger={november}
          ledgers={ledgers}
          onSave={({ ledger, parentIds }) =>
            setLog(
              `${ledger.name} 숨김 ${ledger.fields
                .filter((field) => field.hidden)
                .map((field) => field.name)
                .join('·')} 상위 ${parentIds.join('·')}`,
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
    await userEvent.click(page.getByRole('button', { name: '여행' }));
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    await expect(page.getByRole('status')).toHaveTextContent('11월 숨김 비고 상위 h2·travel');
  },
};
export const ParentSettings: Story = {
  render: function Logged() {
    const [log, setLog] = useState('');
    return (
      <>
        <LedgerSettingsView
          ledger={year2026}
          ledgers={ledgers}
          onSave={({ ledger }) => setLog(`${ledger.name} 하위 ${ledger.childIds.join('·')}`)}
          onArchive={() => setLog('보관')}
          onClose={() => {}}
        />
        <p role="status">{log}</p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.queryByRole('button', { name: '필드 추가' })).toBeNull();
    await expect(page.queryByRole('button', { name: /^2026/ })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: /^일본여행/ }));
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    await expect(page.getByRole('status')).toHaveTextContent('2026 하위 h2');
  },
};
