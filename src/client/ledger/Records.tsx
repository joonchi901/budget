import { useId } from 'react';
import {
  Amount,
  Button,
  Empty,
  FilterChip,
  Inline,
  List,
  ListRow,
  SearchField,
  SegmentedControl,
  Stack,
  TableScroll,
  Tag,
} from '../ui';
import { totals, type Ledger, type LedgerRecord, type TagOption } from '../../shared/ledger';
import { dayLabel, shortDate } from './format';

type RecordContext = {
  ledgers: Ledger[];
  /** Show the source ledger name, for group rooms. */
  showLedger?: boolean;
  onOpenRecord?(record: LedgerRecord): void;
};

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

/** One record: 내용, 구분 and tags, memo, and the signed amount. */
export function RecordRow({
  record,
  ledgers,
  showLedger,
  onOpenRecord,
}: RecordContext & { record: LedgerRecord }) {
  const { ledger, kind, tags, texts } = describe(record, ledgers);
  return (
    <ListRow
      title={record.title}
      description={
        <span className="ledger-record-meta">
          {showLedger && <span className="ledger-record-source">{ledger.name}</span>}
          <span>{kind.name}</span>
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
      trailing={<Amount value={record.amount} tone={kind.nature} signed />}
      onClick={onOpenRecord && (() => onOpenRecord(record))}
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
  return (
    <section className="ledger-day" aria-labelledby={id}>
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
}: RecordContext & { records: LedgerRecord[] }) {
  if (!records.length) return <Empty>아직 내역이 없어요.</Empty>;
  const columns = [
    ...new Set(
      ledgers.flatMap((ledger) =>
        ledger.fields.filter((field) => !field.hidden).map((field) => field.name),
      ),
    ),
  ];
  const sorted = [...records].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
  return (
    <TableScroll aria-label="내역 표">
      <table className="ledger-table">
        <thead>
          <tr>
            <th scope="col">날짜</th>
            {showLedger && <th scope="col">가계부</th>}
            <th scope="col">구분</th>
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
            return (
              <tr key={record.id}>
                <td>{shortDate(record.date)}</td>
                {showLedger && <td>{ledger.name}</td>}
                <td>{kind.name}</td>
                <th scope="row">
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
                    <td key={name}>
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

export type NatureFilter = 'all' | 'income' | 'expense';

/** Search, 수입/지출 switch and applied tag conditions above a record list. */
export function RecordFilterBar({
  query,
  onQueryChange,
  nature,
  onNatureChange,
  conditions = [],
  onRemoveCondition,
}: {
  query: string;
  onQueryChange(query: string): void;
  nature: NatureFilter;
  onNatureChange(nature: NatureFilter): void;
  /** Applied option conditions shown as "카테고리: 장보기". */
  conditions?: string[];
  onRemoveCondition?(condition: string): void;
}) {
  return (
    <Stack gap={2} className="ledger-filter-bar">
      <SearchField
        aria-label="내역 검색"
        placeholder="내용·메모 검색"
        value={query}
        onValueChange={onQueryChange}
      />
      <SegmentedControl
        aria-label="수입·지출 보기"
        value={nature}
        onValueChange={onNatureChange}
        options={[
          { value: 'all', label: '전체' },
          { value: 'income', label: '수입' },
          { value: 'expense', label: '지출' },
        ]}
      />
      {conditions.length > 0 && (
        <Inline gap={2}>
          {conditions.map((condition) => (
            <FilterChip
              key={condition}
              label={condition}
              onRemove={() => onRemoveCondition?.(condition)}
            />
          ))}
        </Inline>
      )}
    </Stack>
  );
}
