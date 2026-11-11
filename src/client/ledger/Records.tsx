import { useId, useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  List as ListIcon,
  Repeat,
  SlidersHorizontal,
  Table2,
} from 'lucide-react';
import {
  Amount,
  Button,
  ChipSelect,
  Empty,
  Field,
  FilterChip,
  IconButton,
  Inline,
  List,
  ListRow,
  SearchField,
  SegmentedControl,
  Stack,
  Switch,
  TableScroll,
  Tag,
} from '../ui';
import {
  isScheduled,
  totals,
  type IsoDate,
  type Ledger,
  type LedgerRecord,
  type TagAxis,
  type TagOption,
} from '../../shared/ledger';
import { dayLabel, shortDate } from './format';
import { RecordReactions, type ReactionContext } from './Reactions';

// The amount's sign and color already say 수입/지출; only other 유형 tags, like 고정지출, add meaning.
const natureName = { income: '수입', expense: '지출' };

export type RecordContext = {
  ledgers: Ledger[];
  /** Show the source ledger name, for group rooms. */
  showLedger?: boolean;
  onOpenRecord?(record: LedgerRecord): void;
  /** With showLedger, the source ledger becomes a link under the amount ("11월 →"). */
  onOpenLedger?(ledger: Ledger): void;
  /** Lets members react to records with Uga stickers. */
  reacting?: ReactionContext;
  /** Marks 반복 내역 not yet due as 예정, and due ones whose amount needs checking. */
  today?: IsoDate;
};

/** 예정 before a repeating record's day; 금액 확인 once due while its varying amount is unchecked. */
export function recordState(record: LedgerRecord, today?: IsoDate) {
  if (!today || !record.recurringId) return undefined;
  if (isScheduled(record, today)) return 'scheduled';
  return record.unconfirmed ? 'check' : undefined;
}

/** The 예정 or 금액 확인 mark before a record's tags. */
function StateMark({ state }: { state: ReturnType<typeof recordState> }) {
  if (!state) return null;
  return (
    <span className="ledger-record-state" data-state={state}>
      {state === 'scheduled' && <Repeat size={12} aria-hidden="true" />}
      {state === 'scheduled' ? '예정' : '금액 확인'}
    </span>
  );
}

function describe(record: LedgerRecord, ledgers: Ledger[]) {
  const ledger = ledgers.find((item) => item.id === record.ledgerId)!;
  const kind = ledger.kinds.find((item) => item.id === record.kindId)!;
  const tags: TagOption[] = [];
  const texts: string[] = [];
  for (const field of ledger.fields) {
    const value = record.values[field.id];
    if (field.hidden || value === undefined) continue;
    if (field.type === 'text') {
      if (typeof value === 'string' && value) texts.push(value);
    } else if (Array.isArray(value))
      tags.push(...field.options.filter((option) => value.includes(option.id)));
  }
  return { ledger, kind, tags, texts };
}

/** One record: 내용, then tags and memo; on the right a custom 유형 tag over the signed amount. */
export function RecordRow({
  record,
  ledgers,
  showLedger,
  onOpenRecord,
  onOpenLedger,
  reacting,
  today,
}: RecordContext & { record: LedgerRecord }) {
  const { ledger, kind, tags, texts } = describe(record, ledgers);
  const state = recordState(record, today);
  return (
    <ListRow
      className={state ? `ledger-record ledger-record-${state}` : 'ledger-record'}
      title={record.title}
      description={
        <span className="ledger-record-meta">
          <StateMark state={state} />
          {showLedger && !onOpenLedger && (
            <span className="ledger-record-source">{ledger.name}</span>
          )}
          {tags.map((tag) => (
            <Tag key={tag.id} name={tag.name} color={tag.color} archived={tag.archived} />
          ))}
          {texts.map((text) => (
            <span key={text} className="ledger-record-note">
              {text}
            </span>
          ))}
        </span>
      }
      trailing={
        <>
          {kind.name !== natureName[kind.nature] && <Tag name={kind.name} color={kind.color} />}
          <Amount value={record.amount} tone={kind.nature} signed />
        </>
      }
      onClick={onOpenRecord && (() => onOpenRecord(record))}
      footer={
        (reacting || (showLedger && onOpenLedger)) && (
          <div className="ledger-record-footer">
            {reacting && (
              <RecordReactions
                reactions={record.reactions}
                memberId={reacting.memberId}
                members={reacting.members}
                onToggle={(reaction) => reacting.onToggleReaction(record, reaction)}
              />
            )}
            {showLedger && onOpenLedger && (
              <Button
                variant="plain"
                className="ledger-record-source-link"
                aria-label={`${ledger.name} 가계부로 이동`}
                onClick={() => onOpenLedger(ledger)}
              >
                {ledger.name}
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            )}
          </div>
        )
      }
    />
  );
}

/** A day heading with that day's income and expense, then its records. */
export function RecordDayGroup({
  date,
  records,
  ...context
}: RecordContext & { date: string; records: LedgerRecord[] }) {
  const id = useId();
  const sum = totals(records, context.ledgers);
  const planned = records.every((record) => recordState(record, context.today) === 'scheduled');
  return (
    <section
      className="ledger-day"
      aria-labelledby={id}
      data-date={date}
      data-planned={planned || undefined}
    >
      <div className="ledger-day-heading">
        <h2 id={id}>{dayLabel(date)}</h2>
        <span className="ledger-day-totals">
          {sum.income > 0 && <Amount value={sum.income} tone="income" signed size="sm" />}
          {sum.expense > 0 && <Amount value={sum.expense} tone="expense" signed size="sm" />}
        </span>
      </div>
      <List aria-labelledby={id}>
        {records.map((record) => (
          <RecordRow key={record.id} record={record} {...context} />
        ))}
      </List>
    </section>
  );
}

/** Records grouped by day, newest first by default. */
export function RecordList({
  records,
  order = 'newest',
  emptyText = '아직 내역이 없어요.',
  ...context
}: RecordContext & {
  records: LedgerRecord[];
  order?: 'newest' | 'oldest';
  emptyText?: string;
}) {
  if (!records.length) return <Empty>{emptyText}</Empty>;
  const sign = order === 'newest' ? -1 : 1;
  const sorted = [...records].sort(
    (a, b) => sign * (a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
  );
  const dates = [...new Set(sorted.map((record) => record.date))];
  return (
    <Stack gap={5}>
      {dates.map((date) => (
        <RecordDayGroup
          key={date}
          date={date}
          records={sorted.filter((record) => record.date === date)}
          {...context}
        />
      ))}
    </Stack>
  );
}

/** Notion-like wide table: fixed columns, then every field name across the ledgers. */
export function RecordTable({
  records,
  ledgers,
  showLedger,
  onOpenRecord,
  today,
}: RecordContext & { records: LedgerRecord[] }) {
  if (!records.length) return <Empty>아직 내역이 없어요.</Empty>;
  const columns = [
    ...new Set(
      ledgers.flatMap((ledger) =>
        ledger.fields.filter((field) => !field.hidden).map((field) => field.name),
      ),
    ),
  ];
  // Newest first, like the list it replaces.
  const sorted = [...records].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <TableScroll aria-label="내역 표" className="ledger-table-scroll">
      <table className="ledger-table">
        <thead>
          <tr>
            <th scope="col">날짜</th>
            {showLedger && <th scope="col">가계부</th>}
            <th scope="col">유형</th>
            <th scope="col">내용</th>
            <th scope="col">금액</th>
            {columns.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((record) => {
            const { ledger, kind } = describe(record, ledgers);
            const state = recordState(record, today);
            return (
              <tr key={record.id} data-state={state}>
                <td>
                  {shortDate(record.date)}
                  <StateMark state={state} />
                </td>
                {showLedger && <td>{ledger.name}</td>}
                <td>
                  <Tag name={kind.name} color={kind.color} />
                </td>
                <th scope="row" className="ledger-table-text">
                  {onOpenRecord ? (
                    <Button variant="plain" onClick={() => onOpenRecord(record)}>
                      {record.title}
                    </Button>
                  ) : (
                    record.title
                  )}
                </th>
                <td>
                  <Amount value={record.amount} tone={kind.nature} signed size="sm" />
                </td>
                {columns.map((name) => {
                  const field = ledger.fields.find((item) => item.name === name);
                  const value = field && record.values[field.id];
                  return (
                    <td
                      key={name}
                      className={field?.type === 'text' ? 'ledger-table-text' : undefined}
                    >
                      {field?.type === 'text' && typeof value === 'string' && value}
                      {field && field.type !== 'text' && Array.isArray(value) && (
                        <Inline gap={1}>
                          {field.options
                            .filter((option) => value.includes(option.id))
                            .map((option) => (
                              <Tag key={option.id} name={option.name} color={option.color} />
                            ))}
                        </Inline>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

/**
 * One row above the records: search, a 조회 조건 button and, in a room, the 표/캘린더 icons. The
 * panel holds tag filters (유형 covers 수입/지출) and the wide table switch; applied conditions
 * stay visible as removable chips. A wide room body swaps the icons and the switch for a
 * 캘린더/테이블 toggle (views.css).
 */
export type RecordDisplay = 'list' | 'calendar';
export type TagCondition = { axis: string; name: string };

export function RecordFilterBar({
  query,
  onQueryChange,
  wide = false,
  onWideChange,
  conditions = [],
  onRemoveCondition,
  tagAxes = [],
  onConditionsChange,
  display = 'list',
  onDisplayChange,
}: {
  query: string;
  onQueryChange(query: string): void;
  /** Wide table instead of the day list; the panel offers it with `onWideChange`. */
  wide?: boolean;
  onWideChange?(wide: boolean): void;
  /** Applied tag conditions, shown as "카테고리: 장보기" chips. */
  conditions?: TagCondition[];
  onRemoveCondition?(condition: TagCondition): void;
  /** Tags offered in the panel; picking several on one axis shows records with any of them. */
  tagAxes?: TagAxis[];
  onConditionsChange?(axis: string, names: string[]): void;
  /** 표 or 캘린더; with `onDisplayChange` the toggle sits beside the filter button. */
  display?: RecordDisplay;
  onDisplayChange?(display: RecordDisplay): void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <Stack gap={2}>
      <div className="ledger-filter-row">
        <SearchField
          aria-label="내역 검색"
          placeholder="내용·메모 검색"
          value={query}
          onValueChange={onQueryChange}
        />
        <IconButton
          aria-label="조회 조건"
          aria-expanded={open}
          aria-controls={panel}
          data-active={conditions.length > 0 || undefined}
          data-wide={wide || undefined}
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal size={20} />
        </IconButton>
        {onDisplayChange && (
          <SegmentedControl<RecordDisplay>
            aria-label="내역 보기 방식"
            className="ledger-display-toggle"
            value={display}
            onValueChange={onDisplayChange}
            options={[
              {
                value: 'list',
                label: (
                  <>
                    <ListIcon size={20} />
                    <span className="sr-only">표</span>
                  </>
                ),
              },
              {
                value: 'calendar',
                label: (
                  <>
                    <CalendarDays size={20} />
                    <span className="sr-only">캘린더</span>
                  </>
                ),
              },
            ]}
          />
        )}
        {onDisplayChange && (
          <SegmentedControl<'calendar' | 'table'>
            aria-label="내역 보기 방식"
            className="ledger-layout-toggle"
            value={wide ? 'table' : 'calendar'}
            onValueChange={(layout) => onWideChange?.(layout === 'table')}
            options={[
              {
                value: 'calendar',
                label: (
                  <>
                    <CalendarDays size={18} aria-hidden="true" />
                    캘린더
                  </>
                ),
              },
              {
                value: 'table',
                label: (
                  <>
                    <Table2 size={18} aria-hidden="true" />
                    테이블
                  </>
                ),
              },
            ]}
          />
        )}
      </div>
      {open && (
        <Stack id={panel} gap={3} className="ledger-filter-panel">
          {onConditionsChange &&
            tagAxes.map(({ axis, options }) => (
              <ChipSelect
                key={axis}
                label={axis}
                multiple
                options={options.map((option) => ({ id: option.name, ...option }))}
                value={conditions.filter((item) => item.axis === axis).map((item) => item.name)}
                onValueChange={(names) => onConditionsChange(axis, names)}
              />
            ))}
          {onWideChange && (
            <Field className="ledger-wide-switch">
              <Switch checked={wide} onChange={(event) => onWideChange(event.target.checked)} />
              넓게 보기
            </Field>
          )}
        </Stack>
      )}
      {conditions.length > 0 && (
        <Inline gap={2}>
          {conditions.map((condition) => (
            <FilterChip
              key={`${condition.axis}:${condition.name}`}
              label={`${condition.axis}: ${condition.name}`}
              onRemove={() => onRemoveCondition?.(condition)}
            />
          ))}
        </Inline>
      )}
    </Stack>
  );
}
