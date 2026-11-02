import type { ReactNode } from 'react';
import {
  CalendarDays,
  ChartPie,
  ChevronLeft,
  Layers,
  List,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { UgaIcon, type UgaIconName } from '../brand/Uga';
import {
  Amount,
  Button,
  CountBadge,
  IconButton,
  ListRow,
  Menu,
  SegmentedControl,
  won,
  type MenuItem,
} from '../ui';
import type { Group, IsoDate, Ledger, LedgerRecord, Totals } from '../../shared/ledger';
import { periodLabel, whenLabel } from './format';

/** One room in the room list: icon, name, latest record or period, time and unseen count. */
export function RoomListItem({
  room,
  latest,
  unseen = 0,
  today,
  onOpen,
}: {
  room: Ledger | Group;
  latest?: LedgerRecord;
  unseen?: number;
  today: IsoDate;
  onOpen(): void;
}) {
  const group = 'ledgerIds' in room;
  const meta = group ? `묶음 · 가계부 ${room.ledgerIds.length}개` : periodLabel(room.period);
  return (
    <ListRow
      leading={<UgaIcon name={room.icon as UgaIconName} size={36} />}
      title={room.name}
      description={
        latest ? `${group ? '묶음 · ' : ''}${latest.title} · ${won(latest.amount)}원` : meta
      }
      trailing={
        <>
          {latest && <span>{whenLabel(latest.createdAt, today)}</span>}
          <CountBadge count={unseen} label={`새 내역 ${unseen}건`} />
        </>
      }
      onClick={onOpen}
    />
  );
}

export type RoomView = 'table' | 'calendar' | 'stats' | 'ledgers';
const viewLabels: Record<RoomView, string> = {
  table: '표',
  calendar: '캘린더',
  stats: '통계',
  ledgers: '가계부별',
};

/** Room title bar: back to the room list, name and period, ⋯ menu. The title is the page heading. */
export function RoomHeader({
  title,
  subtitle,
  onBack,
  menuItems,
}: {
  title: string;
  subtitle: string;
  onBack(): void;
  menuItems: MenuItem[];
}) {
  return (
    <div className="ledger-room-header-bar">
      <IconButton aria-label="방 목록으로" onClick={onBack}>
        <ChevronLeft size={22} />
      </IconButton>
      <div className="ledger-room-header-title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <Menu
        label={`${title} 메뉴`}
        items={menuItems}
        trigger={(props) => (
          <IconButton {...props} aria-label={`${title} 메뉴`}>
            <MoreHorizontal size={22} />
          </IconButton>
        )}
      />
    </div>
  );
}

const viewIcons: Record<RoomView, ReactNode> = {
  table: <List size={20} />,
  calendar: <CalendarDays size={20} />,
  stats: <ChartPie size={20} />,
  ledgers: <Layers size={20} />,
};

/**
 * Bottom bar of a room, within thumb reach: the view switch and the round 내역 추가 button.
 * The views keep the segmented keyboard contract (arrow keys, Home, End).
 */
export function RoomTabBar({
  views,
  view,
  onViewChange,
  onAdd,
}: {
  views: RoomView[];
  view: RoomView;
  onViewChange(view: RoomView): void;
  onAdd(): void;
}) {
  return (
    <div className="ledger-tab-bar">
      <SegmentedControl
        aria-label="보기"
        appearance="plain"
        value={view}
        onValueChange={onViewChange}
        options={views.map((value) => ({
          value,
          label: (
            <>
              {viewIcons[value]}
              <span>{viewLabels[value]}</span>
            </>
          ),
        }))}
      />
      <Button
        variant="primary"
        className="ledger-add-button"
        aria-label="내역 추가"
        onClick={onAdd}
      >
        <Plus size={26} />
      </Button>
    </div>
  );
}

/** 수입 · 지출 · 남은 금액 for the room's current scope. */
export function SummaryStrip({ totals }: { totals: Totals }) {
  return (
    <dl className="ledger-summary">
      <div>
        <dt>수입</dt>
        <dd>
          <Amount value={totals.income} tone="income" size="sm" />
        </dd>
      </div>
      <div>
        <dt>지출</dt>
        <dd>
          <Amount value={totals.expense} tone="expense" size="sm" />
        </dd>
      </div>
      <div>
        <dt>남은 금액</dt>
        <dd>
          <Amount value={totals.balance} size="sm" />
        </dd>
      </div>
    </dl>
  );
}
