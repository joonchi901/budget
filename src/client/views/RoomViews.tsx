import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Users } from 'lucide-react';
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
  type ReactionContext,
  type RecordDisplay,
  type RoomView,
  type TagCondition,
} from '../ledger';
import { BottomSheet, Screen } from '../templates';
import { Button, IconButton, Inline, type MenuItem } from '../ui';
import {
  KIND_AXIS,
  defaultStatAxis,
  filterRecords,
  isParent,
  leafLedgers,
  roomRecords,
  tagAxes,
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
  /** Lets members react to records with Uga stickers. */
  reacting?: ReactionContext;
};

/**
 * Room body: 내역 (표 or 캘린더, chosen beside the filter, with a full-width 내역 추가 above the
 * tab bar), 통계, 하위 for parents, and 설정.
 */
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
  settingsView,
  chatView,
  onViewChange,
  today,
  onBack,
  onAddRecord,
  onOpenRecord,
  reacting,
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
  settingsView: ReactNode;
  chatView?: ReactNode;
  onViewChange?(view: RoomView): void;
}) {
  const [view, setView] = useState<RoomView>('records');
  const [display, setDisplay] = useState<RecordDisplay>('list');
  const [query, setQuery] = useState('');
  const [conditions, setConditions] = useState<TagCondition[]>([]);
  const [wide, setWide] = useState(false);
  const [day, setDay] = useState<IsoDate>();
  const [axis, setAxis] = useState(() => defaultStatAxis(ledgers));
  const [statNature, setStatNature] = useState<KindOption['nature']>('expense');
  const shown = filterRecords(records, ledgers, { query, options: conditions });
  const context = { ledgers, showLedger, onOpenRecord, reacting };
  return (
    <Screen
      top={
        <>
          <RoomHeader title={title} subtitle={subtitle} onBack={onBack} menuItems={menuItems} />
          <SummaryStrip totals={totals(records, ledgers)} />
        </>
      }
      bottom={
        <RoomTabBar
          views={views}
          view={view}
          onViewChange={(next) => {
            setView(next);
            onViewChange?.(next);
          }}
        />
      }
    >
      {view === 'records' && (
        <>
          <RecordFilterBar
            query={query}
            onQueryChange={setQuery}
            wide={wide}
            onWideChange={setWide}
            conditions={conditions}
            onRemoveCondition={(removed) =>
              setConditions(
                conditions.filter(
                  (item) => item.axis !== removed.axis || item.name !== removed.name,
                ),
              )
            }
            tagAxes={tagAxes(ledgers)}
            onConditionsChange={(axis, names) =>
              setConditions([
                ...conditions.filter((item) => item.axis !== axis),
                ...names.map((name) => ({ axis, name })),
              ])
            }
            display={display}
            onDisplayChange={setDisplay}
          />
          {display === 'calendar' ? (
            <>
              {calendar.navigation}
              <PeriodCalendar
                period={calendar.period}
                records={shown}
                ledgers={ledgers}
                today={today}
                selected={day}
                onSelect={setDay}
              />
            </>
          ) : wide ? (
            <RecordTable records={shown} {...context} />
          ) : (
            <RecordList
              records={shown}
              emptyText={records.length ? '조건에 맞는 내역이 없어요.' : '아직 내역이 없어요.'}
              {...context}
            />
          )}
          <Button variant="primary" className="view-add-record" onClick={() => onAddRecord()}>
            <Plus size={18} />
            내역 추가
          </Button>
          {display === 'calendar' && day && (
            <BottomSheet title={dayLabel(day)} onClose={() => setDay(undefined)}>
              <DayRecords
                date={day}
                records={shown.filter((record) => record.date === day)}
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
            // The stats show one nature; its 유형 tags keep the list to the same records.
            const kinds = ledgers.flatMap((ledger) => ledger.kinds);
            const natureKinds = kinds.filter((kind) => kind.nature === statNature);
            setConditions([
              { axis: field, name },
              ...(field === KIND_AXIS
                ? []
                : [...new Set(natureKinds.map((kind) => kind.name))].map((kindName) => ({
                    axis: KIND_AXIS,
                    name: kindName,
                  }))),
            ]);
            setQuery('');
            setDisplay('list');
            setView('records');
          }}
        />
      )}
      {view === 'ledgers' && ledgersView}
      {view === 'chat' && <div className="view-chat">{chatView}</div>}
      {view === 'settings' && settingsView}
    </Screen>
  );
}

/**
 * A ledger's room. Without children it shows its own records over its period; with children
 * (상위 가계부) it gathers every record below it, marks each record's ledger, steps the calendar
 * by month and adds a 하위 view to drill into the children. 설정 is a tab of the room.
 */
export function LedgerRoomView({
  ledger,
  ledgers,
  records,
  settings,
  chat,
  onViewChange,
  onCopy,
  onOpenLedger,
  onOpenMembers,
  ...actions
}: RoomActions & {
  ledger: Ledger;
  /** All ledgers, to resolve children. */
  ledgers: Ledger[];
  records: LedgerRecord[];
  /** The 설정 tab's content, a LedgerSettingsView of this ledger. */
  settings: ReactNode;
  /** The 대화 tab's content, a ChatThread of this ledger; parents have no 대화. */
  chat?: ReactNode;
  /** Tells the app which tab is open, so it can look for new 대화 while it is. */
  onViewChange?(view: RoomView): void;
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
      views={
        parent
          ? ['records', 'stats', 'ledgers', 'settings']
          : ['records', 'stats', ...(chat ? (['chat'] as const) : []), 'settings']
      }
      settingsView={settings}
      chatView={chat}
      onViewChange={onViewChange}
      menuItems={[
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
