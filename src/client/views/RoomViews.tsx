import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Settings2 } from 'lucide-react';
import {
  DayRecords,
  LedgerCardList,
  PeriodCalendar,
  RecordFilterBar,
  RecordList,
  RecordTable,
  RoomHeader,
  StatsBreakdown,
  SummaryStrip,
  addDays,
  addMonths,
  dayLabel,
  monthLabel,
  periodLabel,
  type NatureFilter,
  type RoomView,
} from '../ledger';
import { BottomSheet, Screen } from '../templates';
import { Button, IconButton, Inline, type MenuItem } from '../ui';
import {
  defaultStatAxis,
  filterRecords,
  groupRecords,
  totals,
  type Group,
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

/** Shared body of ledger and group rooms: table, calendar, stats and (groups) ledgers views. */
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
          <RoomHeader
            title={title}
            subtitle={subtitle}
            views={views}
            view={view}
            onViewChange={setView}
            onBack={onBack}
            menuItems={menuItems}
          />
          <SummaryStrip totals={totals(records, ledgers)} />
        </>
      }
      bottom={
        <Button variant="primary" onClick={() => onAddRecord()}>
          <Plus size={18} />
          내역 추가
        </Button>
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

/** One ledger's room. */
export function LedgerRoomView({
  ledger,
  records,
  onOpenSettings,
  onCopy,
  ...actions
}: RoomActions & {
  ledger: Ledger;
  records: LedgerRecord[];
  onOpenSettings(): void;
  onCopy(): void;
}) {
  return (
    <Room
      {...actions}
      title={ledger.name}
      subtitle={periodLabel(ledger.period)}
      ledgers={[ledger]}
      records={records.filter((record) => record.ledgerId === ledger.id)}
      views={['table', 'calendar', 'stats']}
      menuItems={[
        { label: '설정', icon: <Settings2 size={18} />, onSelect: onOpenSettings },
        { label: '복사해서 만들기', icon: <Copy size={18} />, onSelect: onCopy },
      ]}
      showLedger={false}
      calendar={{ period: ledger.period }}
    />
  );
}

/** A group's room: its ledgers' records together, a month calendar and a per-ledger view. */
export function GroupRoomView({
  group,
  ledgers,
  records,
  onOpenSettings,
  onOpenLedger,
  ...actions
}: RoomActions & {
  group: Group;
  /** All ledgers; the group's are picked by id. */
  ledgers: Ledger[];
  records: LedgerRecord[];
  onOpenSettings(): void;
  onOpenLedger(ledger: Ledger): void;
}) {
  const own = ledgers.filter((ledger) => group.ledgerIds.includes(ledger.id));
  const scoped = groupRecords(group, records);
  const [month, setMonth] = useState(() => {
    const latest = scoped.reduce((last, record) => (record.date > last ? record.date : last), '');
    return (latest || actions.today).slice(0, 7);
  });
  const start = `${month}-01`;
  const end = addDays(addMonths(start, 1), -1);
  return (
    <Room
      {...actions}
      title={group.name}
      subtitle={`묶음 · 가계부 ${own.length}개`}
      ledgers={own}
      records={scoped}
      views={['table', 'calendar', 'stats', 'ledgers']}
      menuItems={[{ label: '설정', icon: <Settings2 size={18} />, onSelect: onOpenSettings }]}
      showLedger
      calendar={{
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
      }}
      ledgersView={<LedgerCardList ledgers={own} records={scoped} onOpen={onOpenLedger} />}
    />
  );
}
