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
          '가계부 만들기와 설정(설정은 가계부 방의 설정 탭 안에 그대로 들어갑니다). 내역을 적는 가계부는 빈 가계부나 복사해서 만들기(필드·태그·유형과 상위 가계부를 이어받고 기간은 한 달 뒤, 이름은 11월 → 12월처럼 다음 달)로 시작하고 필드·태그 옵션을 정합니다. 상위 가계부는 하위 가계부만 고릅니다. 둘 다 여러 상위 가계부에 속할 수 있고, 순환이 생기는 선택지는 보이지 않습니다.',
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
          onCreate={({ ledger, parentIds }) =>
            setLog(
              `${ledger.name} ${ledger.period.start}~${ledger.period.end} 필드 ${ledger.fields.map((field) => field.name).join('·')} 상위 ${parentIds.join('·')}`,
            )
          }
        />
        <p role="status">{log}</p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // 11월 copies as 12월 under the same 하반기.
    const name = page.getByRole('textbox', { name: /^이름/ });
    await expect(name).toHaveValue('12월');
    await expect(page.getByRole('button', { name: '하반기' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.clear(name);
    await userEvent.click(page.getByRole('button', { name: '만들기' }));
    await expect(page.getByText('이름을 입력해 주세요.')).toBeVisible();
    await userEvent.type(name, '12월');
    await userEvent.click(page.getByRole('button', { name: '만들기' }));
    await expect(page.getByRole('status')).toHaveTextContent(
      '12월 2026-11-23~2026-12-22 필드 결제방식·카테고리·누가·비고 상위 h2',
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
    // 보관 takes a second tap. The ledger's is the last 보관; tag options have their own.
    await userEvent.click(page.getAllByRole('button', { name: '보관' }).at(-1)!);
    await expect(page.getByRole('status')).not.toHaveTextContent('보관');
    await userEvent.click(page.getByRole('button', { name: '한 번 더 누르면 보관' }));
    await expect(page.getByRole('status')).toHaveTextContent('보관');
  },
};
export const Archived: Story = {
  render: function Logged() {
    const [log, setLog] = useState('');
    return (
      <>
        <LedgerSettingsView
          ledger={{ ...november, archived: true }}
          ledgers={ledgers}
          onSave={() => {}}
          onArchive={() => {}}
          onRestore={(ledger) => setLog(`보관 해제: ${ledger.name}`)}
        />
        <p role="status">{log}</p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: '보관 해제' }));
    await expect(page.getByRole('status')).toHaveTextContent('보관 해제: 11월');
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
