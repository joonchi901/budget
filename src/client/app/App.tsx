import { useEffect, useRef, useState } from 'react';
import { addDays, addMonths, localDate } from '../ledger/format';
import { StatusScreen } from '../templates';
import { Button, Notice } from '../ui';
import {
  CreateLedgerView,
  LedgerRoomView,
  LedgerSettingsView,
  LoginView,
  RecordEntryView,
  RoomListView,
} from '../views';
import {
  leafLedgers,
  type AppData,
  type Id,
  type IsoDate,
  type Ledger,
  type LedgerRecord,
} from '../../shared/ledger';
import { ApiFailure, api } from './api';

type Sheet =
  | { type: 'entry'; ledgers: Ledger[]; date?: IsoDate; record?: LedgerRecord }
  | { type: 'create'; sourceId?: Id }
  | { type: 'settings'; id: Id };

const FIXED_KIND = '고정지출';

const parentIdsOf = (ledgers: Ledger[], id: Id) =>
  ledgers.filter((ledger) => ledger.childIds.includes(id)).map((ledger) => ledger.id);

/** The ledger saved with its parents, for showing a change before the server answers. */
const withLedger = (data: AppData, ledger: Ledger, parentIds: Id[]): AppData => ({
  ...data,
  ledgers: [
    ...data.ledgers
      .filter((item) => item.id !== ledger.id)
      .map((item) => ({
        ...item,
        childIds: parentIds.includes(item.id)
          ? [...new Set([...item.childIds, ledger.id])]
          : item.childIds.filter((childId) => childId !== ledger.id),
      })),
    ledger,
  ],
});

/**
 * 고정지출 records of `source` for a ledger copied from it: one month later, with kinds, fields
 * and options matched by name because the copy has new ids. Values without a match are left out.
 */
function copyFixed(source: Ledger, target: Ledger, records: LedgerRecord[], userId: Id) {
  const nameOf = (list: { id: Id; name: string }[], id: Id) =>
    list.find((item) => item.id === id)?.name;
  const clamp = (date: IsoDate) =>
    date < target.period.start
      ? target.period.start
      : date > target.period.end
        ? target.period.end
        : date;
  return records
    .filter(
      (record) =>
        record.ledgerId === source.id && nameOf(source.kinds, record.kindId) === FIXED_KIND,
    )
    .flatMap((record): LedgerRecord[] => {
      const kind = target.kinds.find((item) => item.name === FIXED_KIND);
      if (!kind) return [];
      const values = Object.entries(record.values).flatMap(([fieldId, value]) => {
        const from = source.fields.find((field) => field.id === fieldId);
        const to = target.fields.find(
          (field) => field.name === from?.name && field.type === from.type,
        );
        if (!from || !to) return [];
        if (from.type === 'text' || to.type === 'text') return [[to.id, value]];
        const ids = (value as Id[]).flatMap((id) => {
          const match = to.options.find((option) => option.name === nameOf(from.options, id));
          return match ? [match.id] : [];
        });
        return [[to.id, ids]];
      });
      return [
        {
          ...record,
          id: crypto.randomUUID(),
          ledgerId: target.id,
          kindId: kind.id,
          date: clamp(addMonths(record.date, 1)),
          values: Object.fromEntries(values),
          createdBy: userId,
          createdAt: new Date().toISOString(),
        },
      ];
    });
}

/**
 * The app layer: loads the user's data, opens rooms and sheets, and saves through the API.
 * A change shows at once; changes are sent one at a time in order, and the server's answer to
 * the latest one replaces the state. A failure reloads the server's data.
 */
export function App() {
  const [data, setData] = useState<AppData>();
  const [error, setError] = useState<{ message: string; login?: boolean }>();
  const [roomId, setRoomId] = useState<Id>();
  const [sheet, setSheet] = useState<Sheet>();
  const queue = useRef(Promise.resolve());
  const latest = useRef(0);
  const today = localDate(new Date());

  const report = (failure: unknown) =>
    setError({
      message: failure instanceof Error ? failure.message : '문제가 생겼어요.',
      login: failure instanceof ApiFailure && failure.status === 401,
    });
  const reload = () =>
    api('GET', '/api/data').then((answer) => {
      setData(answer);
      setError(undefined);
    }, report);
  useEffect(() => {
    reload();
  }, []);

  const change = (
    local: (data: AppData) => AppData,
    method: 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ) => {
    setData((current) => current && local(current));
    const turn = ++latest.current;
    queue.current = queue.current.then(() =>
      api(method, path, body).then(
        (answer) => {
          if (turn === latest.current) setData(answer);
        },
        (failure) => {
          report(failure);
          return reload();
        },
      ),
    );
  };
  const saveLedger = (ledger: Ledger, parentIds: Id[], records: LedgerRecord[] = []) =>
    change(
      (current) => {
        const next = withLedger(current, ledger, parentIds);
        return { ...next, records: [...next.records, ...records] };
      },
      'PUT',
      `/api/ledgers/${ledger.id}`,
      { ledger, parentIds, ...(records.length ? { records } : {}) },
    );

  if (error?.login)
    return (
      <LoginView
        onLogin={reload}
        error="로그인은 아직 연결 전이에요. 로컬 개발 서버(npm run dev)에서 열어 주세요."
      />
    );
  if (!data)
    return (
      <StatusScreen busy={!error} action={<Button onClick={reload}>다시 시도</Button>}>
        {error ? error.message : '불러오는 중이에요'}
      </StatusScreen>
    );

  const room = data.ledgers.find((ledger) => ledger.id === roomId);
  const settings =
    sheet?.type === 'settings' && data.ledgers.find((ledger) => ledger.id === sheet.id);
  const thisMonth = { start: today, end: addDays(addMonths(today, 1), -1) };

  return (
    <>
      {error && <Notice onClose={() => setError(undefined)}>{error.message}</Notice>}
      {room ? (
        <LedgerRoomView
          key={room.id}
          ledger={room}
          ledgers={data.ledgers}
          records={data.records}
          today={today}
          onBack={() => setRoomId(undefined)}
          onAddRecord={(date) => {
            const ledgers = leafLedgers(data.ledgers, room);
            if (ledgers.length) setSheet({ type: 'entry', ledgers, date });
          }}
          onOpenRecord={(record) =>
            setSheet({
              type: 'entry',
              ledgers: data.ledgers.filter((ledger) => ledger.id === record.ledgerId),
              record,
            })
          }
          onOpenSettings={() => setSheet({ type: 'settings', id: room.id })}
          onCopy={() => setSheet({ type: 'create', sourceId: room.id })}
          onOpenLedger={(ledger) => setRoomId(ledger.id)}
        />
      ) : (
        <RoomListView
          ledgers={data.ledgers}
          records={data.records}
          today={today}
          onOpenRoom={(ledger) => setRoomId(ledger.id)}
          onCreate={() => setSheet({ type: 'create' })}
        />
      )}
      {sheet?.type === 'entry' && (
        <RecordEntryView
          ledgers={sheet.ledgers}
          record={sheet.record}
          date={sheet.date}
          today={today}
          memberId={data.user.id}
          suggestions={data.records.map((record) => record.title)}
          onSave={(record, keepOpen) => {
            change(
              (current) => ({
                ...current,
                records: [...current.records.filter((item) => item.id !== record.id), record],
              }),
              'PUT',
              `/api/records/${record.id}`,
              record,
            );
            if (!keepOpen) setSheet(undefined);
          }}
          onDelete={(record) => {
            change(
              (current) => ({
                ...current,
                records: current.records.filter((item) => item.id !== record.id),
              }),
              'DELETE',
              `/api/records/${record.id}`,
            );
            setSheet(undefined);
          }}
          onLedgerChange={(ledger) => saveLedger(ledger, parentIdsOf(data.ledgers, ledger.id))}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet?.type === 'create' && (
        <CreateLedgerView
          ledgers={data.ledgers}
          today={today}
          initialSourceId={sheet.sourceId}
          onCreate={({ ledger, parentIds, copyFixedFrom }) => {
            const source = data.ledgers.find((item) => item.id === copyFixedFrom);
            saveLedger(
              ledger,
              parentIds,
              source ? copyFixed(source, ledger, data.records, data.user.id) : [],
            );
            setSheet(undefined);
            setRoomId(ledger.id);
          }}
          onCreateParent={(name) => {
            const id = crypto.randomUUID();
            saveLedger(
              { id, name, icon: 'ledger', period: thisMonth, kinds: [], fields: [], childIds: [] },
              [],
            );
            return id;
          }}
          onClose={() => setSheet(undefined)}
        />
      )}
      {settings && (
        <LedgerSettingsView
          ledger={settings}
          ledgers={data.ledgers}
          onSave={({ ledger, parentIds }) => {
            saveLedger(ledger, parentIds);
            setSheet(undefined);
          }}
          onArchive={(ledger) => {
            saveLedger({ ...ledger, archived: true }, parentIdsOf(data.ledgers, ledger.id));
            setSheet(undefined);
            setRoomId(undefined);
          }}
          onClose={() => setSheet(undefined)}
        />
      )}
    </>
  );
}
