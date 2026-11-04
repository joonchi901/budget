import { useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Users,
} from 'lucide-react';
import {
  DayRecords,
  PeriodCalendar,
  RecordFilterBar,
  RecordList,
  RecordTable,
  RoomHeader,
  RoomTabBar,
  StatCardForm,
  StatCardView,
  SummaryStrip,
  addDays,
  addMonths,
  dayLabel,
  monthLabel,
  chartAxis,
  fittedCard,
  ledgerMeta,
  statCardTitle,
  type ReactionContext,
  type RecordDisplay,
  type RoomView,
  type TagCondition,
} from '../ledger';
import { BottomSheet, FullScreenSheet, Screen, guardLeave, useUnsavedGuard } from '../templates';
import { Button, IconButton, Inline, won, type MenuItem } from '../ui';
import {
  defaultStatAxis,
  defaultStatCards,
  filterRecords,
  isScheduled,
  isParent,
  leafLedgers,
  roomRecords,
  tagAxes,
  totals,
  type IsoDate,
  type Ledger,
  type LedgerRecord,
  type StatCard,
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
 * tab bar; on a wide screen 캘린더 with the records beside it or 테이블, and 내역 추가 in the title
 * bar), 통계 (charts over the same 조회 조건, arranged in 편집 by owners), 대화 and 설정.
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
  settingsView,
  chatView,
  onViewChange,
  statCards,
  statPeriod,
  onSaveStatCards,
  memo,
  today,
  onBack,
  onAddRecord,
  onOpenRecord,
  onOpenLedger,
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
  settingsView: ReactNode;
  chatView?: ReactNode;
  onViewChange?(view: RoomView): void;
  /** 통계's saved charts; without them the room's default charts. */
  statCards?: StatCard[];
  /** The room's whole period, over which 통계 averages and lays out 추이. */
  statPeriod: { start: IsoDate; end: IsoDate };
  /** Owners arrange 통계 and keep a 기준 picked for now. */
  onSaveStatCards?(cards: StatCard[]): void;
  /** A ledger used alone calls its 대화 메모. */
  memo?: boolean;
  /** A parent room's records link to the ledger each came from. */
  onOpenLedger?(ledger: Ledger): void;
}) {
  const [view, setView] = useState<RoomView>('records');
  const [display, setDisplay] = useState<RecordDisplay>('list');
  const [query, setQuery] = useState('');
  const [conditions, setConditions] = useState<TagCondition[]>([]);
  const [wide, setWide] = useState(false);
  const [day, setDay] = useState<IsoDate>();
  // 통계: a 기준 picked for now per chart, and 편집's draft with the chart open in its sheet.
  const [axisFor, setAxisFor] = useState<{ [cardId: string]: string }>({});
  const [editing, setEditing] = useState<StatCard[]>();
  const [cardSheet, setCardSheet] = useState<{ card: StatCard; index: number }>();
  const savedCards = statCards ?? defaultStatCards(ledgers, statPeriod);
  const cards = editing ?? savedCards;
  useUnsavedGuard(Boolean(editing) && JSON.stringify(editing) !== JSON.stringify(savedCards));
  const shown = filterRecords(records, ledgers, { query, options: conditions });
  // 예정 records (반복 내역 not yet due) show in the list and calendar but count in no total.
  const due = (list: LedgerRecord[]) => list.filter((record) => !isScheduled(record, today));
  const filtering = query.trim() !== '' || conditions.length > 0;
  const found = totals(due(shown), ledgers);
  const context = { ledgers, showLedger, onOpenRecord, onOpenLedger, reacting, today };
  const filterBar = (
    <RecordFilterBar
      query={query}
      onQueryChange={setQuery}
      conditions={conditions}
      onRemoveCondition={(removed) =>
        setConditions(
          conditions.filter((item) => item.axis !== removed.axis || item.name !== removed.name),
        )
      }
      tagAxes={tagAxes(ledgers)}
      onConditionsChange={(axis, names) =>
        setConditions([
          ...conditions.filter((item) => item.axis !== axis),
          ...names.map((name) => ({ axis, name })),
        ])
      }
      {...(view === 'records'
        ? { wide, onWideChange: setWide, display, onDisplayChange: setDisplay }
        : {})}
    />
  );
  const meta = filtering && (
    // The summary above stays the whole room's; this is what the search found.
    <p className="view-meta" aria-live="polite">
      조건에 맞는 내역 {shown.length}건 · 수입 {won(found.income)}원 · 지출 {won(found.expense)}원
    </p>
  );
  const editCards = (next: StatCard[]) => setEditing(next);
  const titleOf = (card: StatCard) => statCardTitle(card, chartAxis(card, ledgers));
  return (
    <Screen
      top={
        <>
          <RoomHeader
            title={title}
            subtitle={subtitle}
            onBack={onBack}
            menuItems={menuItems}
            action={
              <Button variant="primary" onClick={() => onAddRecord()}>
                <Plus size={18} />
                내역 추가
              </Button>
            }
          />
          <SummaryStrip
            totals={totals(due(records), ledgers)}
            scheduled={
              totals(
                records.filter((record) => isScheduled(record, today)),
                ledgers,
              ).expense
            }
          />
        </>
      }
      bottom={
        <RoomTabBar
          views={views}
          view={view}
          memo={memo}
          onViewChange={(next) =>
            // Leaving 설정 or 통계's 편집 with unsaved changes asks first.
            guardLeave(() => {
              setView(next);
              setEditing(undefined);
              onViewChange?.(next);
            })
          }
        />
      }
    >
      {view === 'records' && (
        <>
          {filterBar}
          {meta}
          {/* Phones show 표 or 캘린더 as chosen; a wide body shows 캘린더 (the calendar left of
              the records) or 테이블 (the 넓게 보기 table alone). */}
          <div className="view-records" data-display={display} data-wide={wide || undefined}>
            <div className="view-records-calendar">
              {calendar.navigation}
              <PeriodCalendar
                period={calendar.period}
                records={shown}
                ledgers={ledgers}
                today={today}
                selected={day}
                onSelect={setDay}
              />
            </div>
            <div className="view-records-list">
              {wide ? (
                <RecordTable records={shown} {...context} />
              ) : (
                <RecordList
                  records={shown}
                  emptyText={records.length ? '조건에 맞는 내역이 없어요.' : '아직 내역이 없어요.'}
                  {...context}
                />
              )}
            </div>
          </div>
          <Button variant="primary" className="view-add-record" onClick={() => onAddRecord()}>
            <Plus size={18} />
            내역 추가
          </Button>
          {day && (
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
        <>
          {filterBar}
          <div className="view-stats-toolbar">
            {editing ? (
              <>
                <p className="view-meta">차트를 고치는 중이에요</p>
                <Button
                  variant="text"
                  onClick={() => editCards(defaultStatCards(ledgers, statPeriod))}
                >
                  기본 구성으로
                </Button>
                <Button variant="secondary" onClick={() => setEditing(undefined)}>
                  취소
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    onSaveStatCards?.(editing);
                    setEditing(undefined);
                    setAxisFor({});
                  }}
                >
                  완료
                </Button>
              </>
            ) : (
              <>
                {meta}
                {filtering && (
                  <Button
                    variant="text"
                    onClick={() => {
                      setDisplay('list');
                      setView('records');
                    }}
                  >
                    이 조건으로 내역 보기
                  </Button>
                )}
                {onSaveStatCards && (
                  <Button variant="secondary" onClick={() => setEditing(savedCards)}>
                    <Pencil size={16} />
                    편집
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="view-stat-board">
            {cards.map((card, index) => {
              const picked = axisFor[card.id];
              const keepable =
                !editing &&
                onSaveStatCards &&
                picked !== undefined &&
                chartAxis(card, ledgers, picked) !== chartAxis(card, ledgers);
              return (
                <StatCardView
                  key={card.id}
                  card={card}
                  records={due(shown)}
                  ledgers={ledgers}
                  period={statPeriod}
                  today={today}
                  axis={editing ? undefined : picked}
                  onAxisChange={(next) => setAxisFor({ ...axisFor, [card.id]: next })}
                  onSaveAxis={
                    keepable
                      ? () => {
                          onSaveStatCards(
                            savedCards.map((item) =>
                              item.id === card.id
                                ? fittedCard({ ...item, axis: picked || undefined }, ledgers)
                                : item,
                            ),
                          );
                          const { [card.id]: _, ...rest } = axisFor;
                          setAxisFor(rest);
                        }
                      : undefined
                  }
                  // A chosen tag narrows every chart; 이 조건으로 내역 보기 shows its records.
                  onSelect={
                    editing
                      ? undefined
                      : (axis, name) =>
                          setConditions([
                            ...conditions.filter((item) => item.axis !== axis),
                            { axis, name },
                          ])
                  }
                  actions={
                    editing && (
                      <Inline gap={1} className="view-stat-card-actions">
                        <IconButton
                          aria-label={`${titleOf(card)} 위로`}
                          disabled={index === 0}
                          onClick={() =>
                            editCards(spliced(cards, index - 1, 2, card, cards[index - 1]))
                          }
                        >
                          <ArrowUp size={18} />
                        </IconButton>
                        <IconButton
                          aria-label={`${titleOf(card)} 아래로`}
                          disabled={index === cards.length - 1}
                          onClick={() =>
                            editCards(spliced(cards, index, 2, cards[index + 1], card))
                          }
                        >
                          <ArrowDown size={18} />
                        </IconButton>
                        <IconButton
                          aria-label={`${titleOf(card)} 설정`}
                          onClick={() => setCardSheet({ card, index })}
                        >
                          <Settings2 size={18} />
                        </IconButton>
                        <IconButton
                          aria-label={`${titleOf(card)} 삭제`}
                          onClick={() => editCards(spliced(cards, index, 1))}
                        >
                          <Trash2 size={18} />
                        </IconButton>
                      </Inline>
                    )
                  }
                />
              );
            })}
          </div>
          {editing && (
            <Button
              variant="secondary"
              className="view-stat-add"
              disabled={cards.length >= 12}
              onClick={() =>
                setCardSheet({
                  card: {
                    id: crypto.randomUUID(),
                    chart: 'rank',
                    nature: 'expense',
                    axis: defaultStatAxis(ledgers),
                  },
                  index: cards.length,
                })
              }
            >
              <Plus size={18} />
              차트 추가
            </Button>
          )}
          {!cards.length && !editing && (
            <p className="view-meta">차트가 없어요. 편집에서 추가해 주세요.</p>
          )}
          {cardSheet && (
            <ChartSheet
              initial={cardSheet.card}
              adding={cardSheet.index === cards.length}
              ledgers={ledgers}
              onApply={(card) => {
                editCards(spliced(cards, cardSheet.index, 1, card));
                setCardSheet(undefined);
              }}
              onClose={() => setCardSheet(undefined)}
            />
          )}
        </>
      )}
      {view === 'chat' && <div className="view-chat">{chatView}</div>}
      {view === 'settings' && settingsView}
    </Screen>
  );
}

/** The list with `count` items from `start` swapped for `items` (ES2023's toSpliced). */
const spliced = <T,>(list: T[], start: number, count: number, ...items: T[]) => [
  ...list.slice(0, start),
  ...items,
  ...list.slice(start + count),
];

/** One chart's settings in 편집; 적용 puts them in the draft that 완료 saves. */
function ChartSheet({
  initial,
  adding,
  ledgers,
  onApply,
  onClose,
}: {
  initial: StatCard;
  adding: boolean;
  ledgers: Ledger[];
  onApply(card: StatCard): void;
  onClose(): void;
}) {
  const [card, setCard] = useState(initial);
  return (
    <FullScreenSheet
      title={adding ? '차트 추가' : '차트 설정'}
      subtitle={statCardTitle(card, chartAxis(card, ledgers))}
      dirty={JSON.stringify(card) !== JSON.stringify(initial)}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={() => onApply(card)}>
          {adding ? '추가' : '적용'}
        </Button>
      }
    >
      <StatCardForm card={card} ledgers={ledgers} onChange={setCard} />
    </FullScreenSheet>
  );
}

/**
 * A ledger's room. Without children it shows its own records over its period; with children
 * (상위 가계부) it gathers every record below it, links each record to its ledger, and steps the
 * calendar by month. 설정 is a tab of the room.
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
  onSaveStatCards,
  memo,
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
  /** Saves 통계's charts; given to the owner only. */
  onSaveStatCards?(cards: StatCard[]): void;
  /** Used alone: 대화 is the owner's 메모. */
  memo?: boolean;
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
          ? ['records', 'stats', 'settings']
          : ['records', 'stats', ...(chat ? (['chat'] as const) : []), 'settings']
      }
      settingsView={settings}
      chatView={chat}
      onViewChange={onViewChange}
      statCards={ledger.statCards}
      statPeriod={ledger.period}
      onSaveStatCards={onSaveStatCards}
      memo={memo}
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
      onOpenLedger={onOpenLedger}
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
    />
  );
}
