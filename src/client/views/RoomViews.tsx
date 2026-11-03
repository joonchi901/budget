import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Copy, Settings2, Users } from 'lucide-react';
import {
  DayRecords,
  ChildLedgerList,
  PeriodCalendar,
  RecordFilterBar,
  RecordList,
  RecordTable,
  RoomHeader,
  RoomTabBar,
  StatsBreakdown,
  SummaryStrip,
  addDays,
  addMonths,
  dayLabel,
  monthLabel,
  ledgerMeta,
  type NatureFilter,
  type RoomView,
} from '../ledger';
import { BottomSheet, Screen } from '../templates';
import { IconButton, Inline, type MenuItem } from '../ui';
import {
  defaultStatAxis,
  filterRecords,
  isParent,
  leafLedgers,
  roomRecords,
  totals,
  type IsoDate,
  type KindOption,
  type Ledger,
  type LedgerRecord,
} from '../../shared/ledger';

type RoomActions = {
  today: IsoDate;
  onBack(): void;
  /** Starts a new record, on a date when chosen from the calendar. */
  onAddRecord(date?: IsoDate): void;
  onOpenRecord(record: LedgerRecord): void;
};

type Condition = { axis: string; name: string };
const conditionLabel = ({ axis, name }: Condition) => `${axis}: ${name}`;

/** Room body: table, calendar and stats views, plus 하위 for parents. */
function Room({
  title,
  subtitle,
  ledgers,
  records,
  views,
  menuItems,
  showLedger,
  calendar,
  ledgersView,
  today,
  onBack,
  onAddRecord,
  onOpenRecord,
}: RoomActions & {
  title: string;
  subtitle: string;
  ledgers: Ledger[];
  records: LedgerRecord[];
  views: RoomView[];
  menuItems: MenuItem[];
  showLedger: boolean;
  calendar: { period: { start: IsoDate; end: IsoDate }; navigation?: ReactNode };
  ledgersView?: ReactNode;
}) {
  const [view, setView] = useState<RoomView>('table');
  const [query, setQuery] = useState('');
  const [nature, setNature] = useState<NatureFilter>('all');
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [wide, setWide] = useState(false);
  const [day, setDay] = useState<IsoDate>();
  const [axis, setAxis] = useState(() => defaultStatAxis(ledgers));
  const [statNature, setStatNature] = useState<KindOption['nature']>('expense');
  const shown = filterRecords(records, ledgers, {
    query,
    nature: nature === 'all' ? undefined : nature,
    options: conditions,
  });
  const context = { ledgers, showLedger, onOpenRecord };
  return (
    <Screen
      top={
        <>
          <RoomHeader title={title} subtitle={subtitle} onBack={onBack} menuItems={menuItems} />
          <SummaryStrip totals={totals(records, ledgers)} />
        </>
      }
      bottom={
        <RoomTabBar views={views} view={view} onViewChange={setView} onAdd={() => onAddRecord()} />
      }
    >
      {view === 'table' && (
        <>
          <RecordFilterBar
            query={query}
            onQueryChange={setQuery}
            nature={nature}
            onNatureChange={setNature}
            wide={wide}
            onWideChange={setWide}
            conditions={conditions.map(conditionLabel)}
            onRemoveCondition={(label) =>
              setConditions(conditions.filter((item) => conditionLabel(item) !== label))
            }
          />
          {wide ? (
            <RecordTable records={shown} {...context} />
          ) : (
            <RecordList
              records={shown}
              emptyText={records.length ? '조건에 맞는 내역이 없어요.' : '아직 내역이 없어요.'}
              {...context}
            />
          )}
        </>
      )}
      {view === 'calendar' && (
        <>
          {calendar.navigation}
          <PeriodCalendar
            period={calendar.period}
            records={records}
            ledgers={ledgers}
            today={today}
            selected={day}
            onSelect={setDay}
          />
          {day && (
            <BottomSheet title={dayLabel(day)} onClose={() => setDay(undefined)}>
              <DayRecords
                date={day}
                records={records.filter((record) => record.date === day)}
                {...context}
                onAdd={(date) => {
                  setDay(undefined);
                  onAddRecord(date);
                }}
              />
            </BottomSheet>
          )}
        </>
      )}
      {view === 'stats' && (
        <StatsBreakdown
          records={records}
          ledgers={ledgers}
          axis={axis}
          onAxisChange={setAxis}
          nature={statNature}
          onNatureChange={setStatNature}
          onSelect={(field, name) => {
            setConditions([{ axis: field, name }]);
            setNature(statNature);
            setQuery('');
            setView('table');
          }}
        />
      )}
      {view === 'ledgers' && ledgersView}
    </Screen>
  );
}

/**
 * A ledger's room. Without children it shows its own records over its period; with children
 * (상위 가계부) it gathers every record below it, marks each record's ledger, steps the calendar
 * by month and adds a 하위 view to drill into the children.
 */
export function LedgerRoomView({
  ledger,
  ledgers,
  records,
  onOpenSettings,
  onCopy,
  onOpenLedger,
  onOpenMembers,
  ...actions
}: RoomActions & {
  ledger: Ledger;
  /** All ledgers, to resolve children. */
  ledgers: Ledger[];
  records: LedgerRecord[];
  onOpenSettings(): void;
  /** 복사해서 만들기, for ledgers that hold records. */
  onCopy(): void;
  onOpenLedger(ledger: Ledger): void;
  /** 멤버, or 하위 전부 공유 for a parent. */
  onOpenMembers?(): void;
}) {
  const parent = isParent(ledger);
  const leaves = leafLedgers(ledgers, ledger);
  const scoped = roomRecords(ledgers, ledger, records);
  const [month, setMonth] = useState(() => {
    const latest = scoped.reduce((last, record) => (record.date > last ? record.date : last), '');
    return (latest || actions.today).slice(0, 7);
  });
  const start = `${month}-01`;
  const end = addDays(addMonths(start, 1), -1);
  return (
    <Room
      {...actions}
      title={ledger.name}
      subtitle={ledgerMeta(ledger)}
      ledgers={leaves}
      records={scoped}
      views={parent ? ['table', 'calendar', 'stats', 'ledgers'] : ['table', 'calendar', 'stats']}
      menuItems={[
        { label: '설정', icon: <Settings2 size={18} />, onSelect: onOpenSettings },
        ...(onOpenMembers
          ? [
              {
                label: parent ? '하위 전부 공유' : '멤버',
                icon: <Users size={18} />,
                onSelect: onOpenMembers,
              },
            ]
          : []),
        ...(parent
          ? []
          : [{ label: '복사해서 만들기', icon: <Copy size={18} />, onSelect: onCopy }]),
      ]}
      showLedger={parent}
      calendar={
        parent
          ? {
              period: { start, end },
              navigation: (
                <Inline justify="between">
                  <IconButton
                    aria-label="이전 달"
                    onClick={() => setMonth(addMonths(start, -1).slice(0, 7))}
                  >
                    <ChevronLeft size={20} />
                  </IconButton>
                  <h2 className="view-month-title">{monthLabel(month)}</h2>
                  <IconButton
                    aria-label="다음 달"
                    onClick={() => setMonth(addMonths(start, 1).slice(0, 7))}
                  >
                    <ChevronRight size={20} />
                  </IconButton>
                </Inline>
              ),
            }
          : { period: ledger.period }
      }
      ledgersView={
        <ChildLedgerList
          parent={ledger}
          ledgers={ledgers}
          records={records}
          onOpen={onOpenLedger}
        />
      }
    />
  );
}
