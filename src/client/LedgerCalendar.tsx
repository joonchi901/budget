import { useId, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react';
import type { Bootstrap, Ledger, Transaction } from '../shared/types';
import { ledgerPath } from '../shared/hierarchy';
import { Dialog, ownerName, won } from './components';
import { TagBadge } from './TagBadge';
import './ledger-calendar.css';

interface LedgerCalendarProps {
  data: Bootstrap;
  ledger: Ledger;
  month: string;
  entries: Transaction[];
  onAdd(date: string): void;
  onOpen(transaction: Transaction): void;
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthDays(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const number = Number(match[2]);
  if (number < 1 || number > 12) return null;
  // UTC is used only for calendar arithmetic; saved dates remain plain ISO dates.
  const first = new Date(0);
  first.setUTCFullYear(year, number - 1, 1);
  first.setUTCHours(0, 0, 0, 0);
  const last = new Date(first);
  last.setUTCMonth(number, 0);
  return { year, number, offset: first.getUTCDay(), count: last.getUTCDate() };
}

function compactWon(amount: number) {
  const absolute = Math.abs(amount);
  if (absolute >= 100000000)
    return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(amount / 100000000)}억`;
  if (absolute >= 10000)
    return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(amount / 10000)}만`;
  return won(amount);
}

function DayTotals({
  entries,
  compact = false,
  monthly = false,
}: {
  entries: Transaction[];
  compact?: boolean;
  monthly?: boolean;
}) {
  return (
    <div className={`ledger-calendar-totals${compact ? ' is-compact' : ''}`}>
      {(['income', 'expense'] as const).map((type) => {
        const matching = entries.filter((entry) => entry.type === type);
        if (!matching.length && !monthly) return null;
        const amount = matching.reduce((total, entry) => total + entry.amount, 0);
        const name = `${monthly ? '월 ' : ''}${type === 'income' ? '수입' : '지출'}`;
        return (
          <span
            className={`calendar-total-${type}`}
            key={type}
            role="group"
            aria-label={`${name} ${won(amount)}원`}
          >
            <span className="calendar-total-label" aria-hidden="true">
              {name}
            </span>
            <span className="calendar-total-full" aria-hidden="true">
              {won(amount)}
              <small>원</small>
            </span>
            {compact && (
              <span className="calendar-total-short" aria-hidden="true">
                {type === 'income' ? '+' : '−'}
                {compactWon(amount)}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function LedgerCalendar({
  data,
  ledger,
  month,
  entries,
  onAdd,
  onOpen,
}: LedgerCalendarProps) {
  const headingId = useId();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const calendar = monthDays(month);
  const today = localToday();
  const days = useMemo(() => {
    const grouped = new Map<string, Transaction[]>();
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.id) || !entry.date.startsWith(`${month}-`)) continue;
      seen.add(entry.id);
      const items = grouped.get(entry.date) ?? [];
      items.push(entry);
      grouped.set(entry.date, items);
    }
    return grouped;
  }, [entries, month]);
  if (!calendar) return <p role="status">조회할 월을 선택해 주세요.</p>;
  const { year, number, offset, count } = calendar;
  const cellCount = Math.ceil((offset + count) / 7) * 7;
  const selected = selectedDate?.startsWith(`${month}-`) ? selectedDate : null;
  const selectedEntries = selected ? (days.get(selected) ?? []) : [];
  const openEntry = (entry: Transaction) => {
    setSelectedDate(null);
    onOpen(entry);
  };
  return (
    <section className="ledger-calendar panel" aria-labelledby={headingId}>
      <header className="ledger-calendar-heading">
        <div>
          <h2 id={headingId}>
            {year}년 {number}월 캘린더
          </h2>
          <p>날짜를 누르면 그날의 내역을 바로 기록해요.</p>
        </div>
        <span className="ledger-calendar-key">
          <span className="calendar-income-dot" />
          수입
          <span className="calendar-expense-dot" />
          지출
        </span>
      </header>
      <div className="ledger-calendar-month-summary" role="group" aria-label={`${month} 월 합계`}>
        <DayTotals entries={[...days.values()].flat()} monthly />
        <span>{[...days.values()].reduce((total, items) => total + items.length, 0)}건의 기록</span>
      </div>
      <div className="ledger-calendar-weekdays" aria-hidden="true">
        {weekdays.map((day, index) => (
          <span className={index === 0 ? 'is-sunday' : index === 6 ? 'is-saturday' : ''} key={day}>
            {day}
          </span>
        ))}
      </div>
      <div className="ledger-calendar-grid">
        {Array.from({ length: cellCount }, (_, index) => {
          const number = index - offset + 1;
          if (number < 1 || number > count)
            return (
              <div className="ledger-calendar-blank" key={`blank-${index}`} aria-hidden="true" />
            );
          const date = `${month}-${String(number).padStart(2, '0')}`;
          const items = days.get(date) ?? [];
          const current = date === today;
          return (
            <div
              className={`ledger-calendar-day${current ? ' is-today' : ''}${items.length ? ' has-entries' : ''}`}
              role="group"
              aria-label={`${date} 내역`}
              data-date={date}
              key={date}
            >
              <button
                type="button"
                className="ledger-calendar-add"
                disabled={ledger.archived}
                aria-label={`${date} 내역 추가`}
                onClick={() => onAdd(date)}
              >
                <span className="calendar-date-heading">
                  <span
                    className={`calendar-date-number${index % 7 === 0 ? ' is-sunday' : index % 7 === 6 ? ' is-saturday' : ''}`}
                    aria-current={current ? 'date' : undefined}
                  >
                    {number}
                  </span>
                  <Plus className="calendar-add-icon" size={14} aria-hidden="true" />
                </span>
              </button>
              {items.length > 0 && (
                <div className="ledger-calendar-day-content">
                  <DayTotals entries={items} compact />
                  <div className="ledger-calendar-previews">
                    {items.slice(0, 2).map((entry) => (
                      <button
                        type="button"
                        className="ledger-calendar-preview"
                        aria-label={`${entry.description} 내역 열기`}
                        key={entry.id}
                        onClick={() => openEntry(entry)}
                      >
                        <span className={`calendar-entry-dot calendar-${entry.type}-dot`} />
                        <span className="calendar-preview-text">
                          <span>{entry.description}</span>
                          {entry.ledgerId !== ledger.id && (
                            <small>{ledgerPath(data.ledgers, entry.ledgerId)}</small>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="ledger-calendar-day-count"
                    aria-label={`${date} 내역 ${items.length}건 보기`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedDate(date);
                    }}
                  >
                    <span className="calendar-count-desktop">
                      {items.length > 2
                        ? `+${items.length - 2}건 더 보기`
                        : `${items.length}건 모아 보기`}
                    </span>
                    <span className="calendar-count-mobile">{items.length}건</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="ledger-calendar-footnote">
        {ledger.archived && '보관한 가계부에는 새 내역을 추가할 수 없어요. '}
        회계월 시작일과 관계없이 매월 1일부터 말일까지 표시해요. 거래를 누르면 원본 가계부에서
        열려요.
      </p>
      {selected && (
        <Dialog
          title={`${Number(selected.slice(5, 7))}월 ${Number(selected.slice(8))}일 내역`}
          subtitle={`${ledger.name} · ${selectedEntries.length}건`}
          onClose={() => setSelectedDate(null)}
        >
          <div className="form-body calendar-detail-body">
            <DayTotals entries={selectedEntries} />
            <div className="calendar-detail-list">
              {selectedEntries.map((entry) => {
                const tags = entry.tagIds
                  .map((id) => data.tags.find((tag) => tag.id === id))
                  .filter((tag) => !!tag);
                const payment = data.paymentMethods.find(
                  (method) => method.id === entry.paymentMethodId,
                );
                return (
                  <button
                    type="button"
                    className="calendar-detail-entry"
                    aria-label={`${entry.description} 내역 열기`}
                    key={entry.id}
                    onClick={() => openEntry(entry)}
                  >
                    <span className={`calendar-detail-icon is-${entry.type}`} aria-hidden="true">
                      {entry.type === 'income' ? (
                        <ArrowDownLeft size={18} />
                      ) : (
                        <ArrowUpRight size={18} />
                      )}
                    </span>
                    <span className="calendar-detail-copy">
                      <strong>{entry.description}</strong>
                      <span className="calendar-detail-meta">
                        {ownerName(entry.ownerId)}
                        {' · '}
                        {entry.paymentMethodId === null
                          ? '미지정'
                          : (payment?.name ?? '알 수 없는 결제수단')}
                      </span>
                      <span className="calendar-detail-source">
                        {ledgerPath(data.ledgers, entry.ledgerId)}
                      </span>
                      {tags.length > 0 && (
                        <span className="calendar-detail-tags">
                          {tags.map((tag) => (
                            <TagBadge
                              key={tag.id}
                              name={tag.name}
                              color={tag.color}
                              archived={tag.archived}
                            />
                          ))}
                        </span>
                      )}
                    </span>
                    <span className={`calendar-detail-amount calendar-total-${entry.type}`}>
                      {entry.type === 'income' ? '+' : '−'}
                      {won(entry.amount)}
                      <small>원</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form-footer">
            <span />
            <button
              type="button"
              className="primary"
              disabled={ledger.archived}
              onClick={() => {
                setSelectedDate(null);
                onAdd(selected);
              }}
            >
              <Plus size={17} aria-hidden="true" />이 날짜에 내역 추가
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
