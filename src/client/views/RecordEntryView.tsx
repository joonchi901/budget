import { useId, useRef, useState } from 'react';
import { LedgerPicker, RecordForm, type RecordDraft } from '../ledger';
import { FullScreenSheet } from '../templates';
import { Button, Field, SelectField, SelectOption, Stack, Switch, won } from '../ui';
import {
  ledgerForDate,
  recordProblems,
  type FieldDef,
  type Id,
  type IsoDate,
  type Ledger,
  type LedgerRecord,
  type RecurringRule,
} from '../../shared/ledger';

const withinPeriod = (ledger: Ledger, date: IsoDate) =>
  date < ledger.period.start
    ? ledger.period.start
    : date > ledger.period.end
      ? ledger.period.end
      : date;

/**
 * A new record starts as the base 지출, not whichever expense 유형 (고정지출) is listed first. With
 * no 유형 at all, 저장 reports 유형 rather than the screen going blank.
 */
const draftFor = (ledger: Ledger, date: IsoDate): RecordDraft => ({
  date,
  kindId:
    (
      ledger.kinds.find((kind) => kind.base && kind.nature === 'expense') ??
      ledger.kinds.find((kind) => kind.nature === 'expense') ??
      ledger.kinds[0]
    )?.id ?? '',
  title: '',
  amount: null,
  values: {},
});

/** 반복 이 suggests itself for what is usually monthly: a 고정 유형 or a 자동이체 tag. */
function looksMonthly(ledger: Ledger, draft: RecordDraft) {
  const kind = ledger.kinds.find((item) => item.id === draft.kindId);
  const chosen = ledger.fields.flatMap((field) => {
    const value = draft.values[field.id];
    return field.type === 'text' || !Array.isArray(value)
      ? []
      : field.options.filter((option) => value.includes(option.id));
  });
  return Boolean(
    kind?.name.includes('고정') || chosen.some((option) => option.name.includes('자동이체')),
  );
}

/**
 * Adding or editing a record. From a group room it first asks which ledger the record belongs
 * to, suggesting the one whose period has the date. New tag options are added to the ledger
 * on the spot and reported with onLedgerChange. A new record may repeat every month (반복); one
 * a 반복 내역 wrote says so, and asks for its amount when that varies.
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
  assetNameFor,
  repeatable,
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
  /**
   * keepOpen: 저장하고 계속, which keeps 유형·날짜·태그 for the next record and says it saved. With
   * 반복, the rule the record starts; the app writes its next records ahead.
   */
  onSave(record: LedgerRecord, keepOpen: boolean, rule?: RecurringRule): void;
  /** Whether a new record in this ledger may start a 반복 내역 (the owner's ledgers). */
  repeatable?(ledgerId: Id): boolean;
  onDelete?(record: LedgerRecord): void;
  onLedgerChange?(ledger: Ledger): void;
  /** The asset a ledger's records go to, if one follows it; shows 자산에 반영. */
  assetNameFor?(ledgerId: Id): string | undefined;
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
  const [inAsset, setInAsset] = useState(!record?.notInAsset);
  const assetName = assetNameFor?.(ledgerId);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** The record 저장하고 계속 just sent, so the person sees it went. */
  const [sent, setSent] = useState<LedgerRecord>();
  const form = useRef<HTMLDivElement>(null);
  const repeatId = useId();
  /** 반복: 매달 this date's day, or the month's last day. */
  const [repeat, setRepeat] = useState<'' | 'date' | 'last'>('');
  const [variable, setVariable] = useState(false);
  const day = Number(draft.date.slice(8));
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    inAsset === Boolean(record?.notInAsset) ||
    repeat !== '';

  const save = (keepOpen: boolean) => {
    const rule: RecurringRule | undefined = repeat
      ? {
          id: crypto.randomUUID(),
          title: draft.title.trim(),
          kindId: draft.kindId,
          amount: draft.amount ?? 0,
          values: draft.values,
          day: repeat === 'last' ? 31 : day,
          ...(variable ? { variable: true as const } : {}),
        }
      : undefined;
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
      ...(record?.reactions ? { reactions: record.reactions } : {}),
      ...(assetName && !inAsset ? { notInAsset: true as const } : {}),
      // Saving checks a varying amount, so 금액 확인 goes.
      ...((record?.recurringId ?? rule?.id)
        ? { recurringId: record?.recurringId ?? rule!.id }
        : {}),
    };
    const found = recordProblems(ledger, candidate);
    setProblems(found);
    if (found.length) return;
    onSave(candidate, keepOpen, rule);
    if (!keepOpen) return;
    setDraft({ ...draft, title: '', amount: null });
    setRepeat('');
    setVariable(false);
    setSent(candidate);
    // Ready for the next one: back on 금액, with the number pad.
    form.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
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
        {sent && (
          <p className="view-meta" role="status">
            저장했어요 · {sent.title} {won(sent.amount)}원
          </p>
        )}
        {problems.length > 0 && (
          <p className="view-error" role="alert">
            확인해 주세요: {problems.join(', ')}
          </p>
        )}
        <div ref={form}>
          <RecordForm
            ledger={ledger}
            draft={draft}
            onChange={setDraft}
            onCreateOption={createOption}
            suggestions={suggestions}
            autoFocusAmount={!record}
          />
        </div>
        {record?.recurringId && (
          <p className="view-meta">
            {record.unconfirmed
              ? '금액이 달마다 다른 반복 내역이에요. 이번 금액을 확인하고 저장해 주세요.'
              : '반복 내역이 미리 넣은 내역이에요.'}{' '}
            반복은 설정 → 반복 내역에서 바꿔요.
          </p>
        )}
        {!record && repeatable?.(ledgerId) && (
          <Stack gap={2}>
            <Field htmlFor={repeatId}>반복</Field>
            <SelectField
              id={repeatId}
              value={repeat}
              onValueChange={(value) => setRepeat(value as typeof repeat)}
            >
              <SelectOption value="">안 함</SelectOption>
              {day < 31 && <SelectOption value="date">매달 {day}일</SelectOption>}
              <SelectOption value="last">매달 마지막 날</SelectOption>
            </SelectField>
            {repeat ? (
              <>
                <Field>
                  <Switch
                    checked={variable}
                    onChange={(event) => setVariable(event.target.checked)}
                  />
                  금액이 달마다 달라요
                </Field>
                <p className="small muted">
                  이 가계부 기간의 다음 날짜에 예정으로 넣고, 복사해서 만드는 다음 가계부에도
                  이어져요.
                  {variable && ' 그날이 되면 금액을 확인해 달라고 표시해요.'}
                </p>
              </>
            ) : (
              looksMonthly(ledger, draft) && (
                <Button
                  variant="text"
                  className="view-repeat-suggestion"
                  onClick={() => setRepeat(day < 31 ? 'date' : 'last')}
                >
                  매달 {day < 31 ? `${day}일` : '마지막 날'}에 반복할까요?
                </Button>
              )
            )}
          </Stack>
        )}
        {assetName && (
          <Field>
            <Switch checked={inAsset} onChange={(event) => setInAsset(event.target.checked)} />
            자산에 반영 · {assetName}
          </Field>
        )}
      </Stack>
    </FullScreenSheet>
  );
}
