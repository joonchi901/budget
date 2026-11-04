import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  LedgerRoomView,
  LedgerSettingsView,
  RecordEntryView,
  RoomListView,
} from '../../client/views';
import { leafLedgers, type IsoDate, type Ledger, type LedgerRecord } from '../../shared/ledger';
import { FIXTURE_TODAY, ledgers as initialLedgers, records as initialRecords } from '../fixtures';

type Entry = { ledgers: Ledger[]; date?: IsoDate; record?: LedgerRecord };

/**
 * The views wired together with in-memory state, standing in for the app layer: a record
 * saved from a room must appear in its table, calendar, stats and the room list.
 */
function Flow() {
  const [ledgers, setLedgers] = useState(initialLedgers);
  const [records, setRecords] = useState(initialRecords);
  const [room, setRoom] = useState<Ledger>();
  const [entry, setEntry] = useState<Entry>();
  const actions = {
    today: FIXTURE_TODAY,
    onBack: () => setRoom(undefined),
    onAddRecord: (date?: IsoDate) =>
      room && setEntry({ ledgers: leafLedgers(ledgers, room), date }),
    onOpenRecord: (record: LedgerRecord) =>
      setEntry({ ledgers: ledgers.filter((item) => item.id === record.ledgerId), record }),
  };
  return (
    <>
      {!room && (
        <RoomListView
          ledgers={ledgers}
          records={records}
          today={FIXTURE_TODAY}
          onOpenRoom={setRoom}
          onCreate={() => {}}
        />
      )}
      {room && (
        <LedgerRoomView
          {...actions}
          ledger={ledgers.find((item) => item.id === room.id)!}
          ledgers={ledgers}
          records={records}
          onCopy={() => {}}
          onOpenLedger={setRoom}
          settings={
            <LedgerSettingsView
              ledger={ledgers.find((item) => item.id === room.id)!}
              ledgers={ledgers}
              onSave={({ ledger }) =>
                setLedgers((all) => all.map((item) => (item.id === ledger.id ? ledger : item)))
              }
              onArchive={() => setRoom(undefined)}
            />
          }
        />
      )}
      {entry && (
        <RecordEntryView
          ledgers={entry.ledgers}
          record={entry.record}
          date={entry.date}
          today={FIXTURE_TODAY}
          memberId="u1"
          suggestions={records.map((record) => record.title)}
          onSave={(saved, keepOpen) => {
            setRecords((all) => [...all.filter((item) => item.id !== saved.id), saved]);
            if (!keepOpen) setEntry(undefined);
          }}
          onDelete={(deleted) => {
            setRecords((all) => all.filter((item) => item.id !== deleted.id));
            setEntry(undefined);
          }}
          onLedgerChange={(changed) =>
            setLedgers((all) => all.map((item) => (item.id === changed.id ? changed : item)))
          }
          onClose={() => setEntry(undefined)}
        />
      )}
    </>
  );
}

const meta = {
  title: '06 Views · 화면/전체 흐름',
  component: Flow,
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '화면들을 메모리 상태로 연결한 흐름. 방 목록에서 가계부에 들어가 내역을 추가하면 표·캘린더·통계와 방 목록 미리보기에 바로 반영되는지 확인합니다. 서버 연결 전 앱 층의 역할을 대신합니다.',
      },
    },
  },
} satisfies Meta<typeof Flow>;
export default meta;

export const AddRecordAppearsEverywhere: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: /^하위 가계부 11월/ }));
    await userEvent.click(c.getByRole('button', { name: '내역 추가' }));
    await expect(page.getByRole('textbox', { name: '금액' })).toHaveFocus();
    await userEvent.type(page.getByRole('textbox', { name: '금액' }), '9550');
    await userEvent.type(page.getByRole('textbox', { name: /내용/ }), '장보기_쿠팡');
    await userEvent.click(page.getByRole('button', { name: 'KT카드' }));
    await userEvent.click(page.getByRole('button', { name: '장보기' }));
    await userEvent.click(page.getByRole('button', { name: '저장' }));

    await expect(c.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('11월 2일 (월)');
    await expect(c.getByText('지출').nextElementSibling).toHaveTextContent('1,884,602원');

    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await expect(c.getByRole('button', { name: '11월 2일 (월), 지출 9,550원' })).toBeVisible();

    await userEvent.click(c.getByRole('button', { name: '통계' }));
    await expect(c.getByRole('button', { name: /^장보기/ })).toHaveTextContent('209,930원');

    await userEvent.click(c.getByRole('button', { name: '가계부 목록' }));
    await expect(c.getByRole('button', { name: /^하위 가계부 11월/ })).toHaveTextContent(
      '장보기_쿠팡 · 9,550원',
    );
  },
};
