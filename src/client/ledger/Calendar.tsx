import { Plus } from 'lucide-react';
import { Button, Empty, List, Stack, won } from '../ui';
import { totals, type IsoDate, type Ledger, type LedgerRecord } from '../../shared/ledger';
import { RecordRow, type RecordContext } from './Records';
import { addDays, compactWon, dayLabel, weekdayOf } from './format';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * Week-aligned calendar for a period (a pay-period month, a trip, one month of a group) that
 * fills the height it is given. Days outside the period are dimmed and not selectable. Each day
 * shows its expense in short form; taller days add the income, then the records' 내용, largest
 * first. The button's name carries the full amounts.
 */
export function PeriodCalendar({
  period,
  records,
  ledgers,
  today,
  selected,
  onSelect,
}: {
  period: { start: IsoDate; end: IsoDate };
  records: LedgerRecord[];
  ledgers: Ledger[];
  today?: IsoDate;
  selected?: IsoDate;
  onSelect(date: IsoDate): void;
}) {
  const first = addDays(period.start, -weekdayOf(period.start));
  const last = addDays(period.end, 6 - weekdayOf(period.end));
  const days: IsoDate[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return (
    <div className="ledger-calendar" role="group" aria-label="기간 달력">
      <div className="ledger-calendar-weekdays" aria-hidden="true">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="ledger-calendar-grid">
        {days.map((day, index) => {
          const inPeriod = period.start <= day && day <= period.end;
          const own = records.filter((record) => record.date === day);
          const sum = totals(own, ledgers);
          const [, month, date] = day.split('-').map(Number);
          const name = `${dayLabel(day)}, 지출 ${won(sum.expense)}원${sum.income ? `, 수입 ${won(sum.income)}원` : ''}`;
          return (
            <Button
              key={day}
              variant="plain"
              className="ledger-calendar-day"
              data-today={day === today || undefined}
              aria-current={day === today ? 'date' : undefined}
              aria-label={name}
              aria-pressed={day === selected}
              disabled={!inPeriod}
              onClick={() => onSelect(day)}
            >
              <span aria-hidden="true" className="ledger-calendar-date">
                {date === 1 || index === 0 || day === period.start ? `${month}/${date}` : date}
              </span>
              {sum.expense > 0 && (
                <span aria-hidden="true" className="ledger-calendar-expense">
                  {compactWon(sum.expense)}
                </span>
              )}
              {sum.income > 0 && (
                <>
                  <span aria-hidden="true" className="ledger-calendar-income" />
                  <span aria-hidden="true" className="ledger-calendar-income-amount">
                    +{compactWon(sum.income)}
                  </span>
                </>
              )}
              {own.length > 0 && (
                <ul aria-hidden="true" className="ledger-calendar-titles">
                  {[...own]
                    .sort((a, b) => b.amount - a.amount)
                    .map((record) => (
                      <li key={record.id}>{record.title}</li>
                    ))}
                </ul>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** Records of one day with an action to add another on that date. */
export function DayRecords({
  date,
  records,
  onAdd,
  ...context
}: RecordContext & {
  date: IsoDate;
  records: LedgerRecord[];
  onAdd(date: IsoDate): void;
}) {
  return (
    <Stack gap={4}>
      {records.length ? (
        <List aria-label={`${dayLabel(date)} 내역`}>
          {records.map((record) => (
            <RecordRow key={record.id} record={record} {...context} />
          ))}
        </List>
      ) : (
        <Empty>이 날은 내역이 없어요.</Empty>
      )}
      <Button variant="primary" onClick={() => onAdd(date)}>
        <Plus size={18} />이 날짜로 추가
      </Button>
    </Stack>
  );
}
