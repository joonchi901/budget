import { useState } from 'react';
import { LedgerPicker, RecordForm, type RecordDraft } from '../ledger';
import { FullScreenSheet } from '../templates';
import { Button, Stack } from '../ui';
import {
  ledgerForDate,
  recordProblems,
  type FieldDef,
  type Id,
  type IsoDate,
  type Ledger,
  type LedgerRecord,
} from '../../shared/ledger';

const withinPeriod = (ledger: Ledger, date: IsoDate) =>
  date < ledger.period.start
    ? ledger.period.start
    : date > ledger.period.end
      ? ledger.period.end
      : date;

const draftFor = (ledger: Ledger, date: IsoDate): RecordDraft => ({
  date,
  kindId: (ledger.kinds.find((kind) => kind.nature === 'expense') ?? ledger.kinds[0]).id,
  title: '',
  amount: null,
  values: {},
});

/**
 * Adding or editing a record. From a group room it first asks which ledger the record belongs
 * to, suggesting the one whose period has the date. New tag options are added to the ledger
 * on the spot and reported with onLedgerChange.
 */
export function RecordEntryView({
  ledgers,
  record,
  date,
  today,
  memberId,
  suggestions = [],
  onSave,
  onDelete,
  onLedgerChange,
  onClose,
}: {
  /** Ledgers the record may go to: one in a ledger room, the group's in a group room. */
  ledgers: Ledger[];
  /** The record being edited; omit to add. */
  record?: LedgerRecord;
  date?: IsoDate;
  today: IsoDate;
  memberId: Id;
  suggestions?: string[];
  /** keepOpen: 저장하고 계속, which keeps 구분·날짜·태그 for the next record. */
  onSave(record: LedgerRecord, keepOpen: boolean): void;
  onDelete?(record: LedgerRecord): void;
  onLedgerChange?(ledger: Ledger): void;
  onClose(): void;
}) {
  const [options, setOptions] = useState(ledgers);
  const [ledgerId, setLedgerId] = useState(
    record?.ledgerId ?? (ledgerForDate(ledgers, date ?? today) ?? ledgers[0]).id,
  );
  // Without a chosen date, start inside the ledger's period so the record shows on its calendar.
  const startDate =
    record?.date ??
    date ??
    withinPeriod(
      ledgers.find((item) => item.id === ledgerId)!,
      today,
    );
  const ledger = options.find((item) => item.id === ledgerId)!;
  const initial: RecordDraft = record
    ? {
        date: record.date,
        kindId: record.kindId,
        title: record.title,
        amount: record.amount,
        values: record.values,
      }
    : draftFor(ledger, startDate);
  const [draft, setDraft] = useState(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const save = (keepOpen: boolean) => {
    const candidate: LedgerRecord = {
      id: record?.id ?? crypto.randomUUID(),
      ledgerId,
      date: draft.date,
      kindId: draft.kindId,
      title: draft.title.trim(),
      amount: draft.amount ?? 0,
      values: draft.values,
      createdBy: record?.createdBy ?? memberId,
      createdAt: record?.createdAt ?? new Date().toISOString(),
    };
    const found = recordProblems(ledger, candidate);
    setProblems(found);
    if (found.length) return;
    onSave(candidate, keepOpen);
    if (keepOpen) setDraft({ ...draft, title: '', amount: null });
  };
  const createOption = (fieldId: Id, name: string, color: string) => {
    const id = crypto.randomUUID();
    const next: Ledger = {
      ...ledger,
      fields: ledger.fields.map((field): FieldDef =>
        field.id === fieldId && field.type !== 'text'
          ? { ...field, options: [...field.options, { id, name, color }] }
          : field,
      ),
    };
    setOptions(options.map((item) => (item.id === next.id ? next : item)));
    onLedgerChange?.(next);
    return id;
  };

  return (
    <FullScreenSheet
      title={record ? '내역 수정' : '내역 추가'}
      subtitle={ledgers.length > 1 && !record ? undefined : ledger.name}
      dirty={dirty}
      onClose={onClose}
      footer={
        record ? (
          <>
            {onDelete && (
              <Button
                className="view-danger"
                onClick={() => (confirmDelete ? onDelete(record) : setConfirmDelete(true))}
              >
                {confirmDelete ? '한 번 더 누르면 삭제' : '삭제'}
              </Button>
            )}
            <Button variant="primary" onClick={() => save(false)}>
              저장
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => save(true)}>저장하고 계속</Button>
            <Button variant="primary" onClick={() => save(false)}>
              저장
            </Button>
          </>
        )
      }
    >
      <Stack gap={5}>
        {!record && ledgers.length > 1 && (
          <LedgerPicker
            ledgers={options}
            value={ledgerId}
            date={draft.date}
            onValueChange={(id) => {
              const next = options.find((item) => item.id === id)!;
              setLedgerId(id);
              setDraft({
                ...draftFor(next, withinPeriod(next, draft.date)),
                title: draft.title,
                amount: draft.amount,
              });
            }}
          />
        )}
        {problems.length > 0 && (
          <p className="view-error" role="alert">
            확인해 주세요: {problems.join(', ')}
          </p>
        )}
        <RecordForm
          ledger={ledger}
          draft={draft}
          onChange={setDraft}
          onCreateOption={createOption}
          suggestions={suggestions}
          autoFocusAmount={!record}
        />
      </Stack>
    </FullScreenSheet>
  );
}
