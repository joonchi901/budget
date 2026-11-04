import type { CSSProperties, ReactNode } from 'react';
import {
  BookOpen,
  ChartPie,
  ChevronLeft,
  CornerDownRight,
  List,
  MessageCircle,
  MoreHorizontal,
  Settings,
  Settings2,
  Users,
  Wallet,
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
import type { IsoDate, Ledger, LedgerRecord, Totals } from '../../shared/ledger';
import { whenLabel } from './format';
import { ledgerMeta } from './Hierarchy';

/** One room in the room list: icon, name, latest record or period/children, time and unseen count. `depth` indents a 하위 가계부 under its 상위. */
export function RoomListItem({
  room,
  latest,
  unseen = 0,
  today,
  depth = 0,
  onOpen,
}: {
  room: Ledger;
  /** The newest record in the room, including its children's. */
  latest?: LedgerRecord;
  unseen?: number;
  today: IsoDate;
  depth?: number;
  onOpen(): void;
}) {
  return (
    <ListRow
      leading={
        <span className="ledger-room-leading" style={{ '--depth': depth } as CSSProperties}>
          {depth > 0 && <CornerDownRight size={16} aria-hidden="true" />}
          <UgaIcon name={room.icon as UgaIconName} size={36} />
        </span>
      }
      title={
        <>
          {depth > 0 && <span className="sr-only">하위 가계부 </span>}
          {room.name}
        </>
      }
      description={latest ? `${latest.title} · ${won(latest.amount)}원` : ledgerMeta(room)}
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

export type RoomView = 'records' | 'stats' | 'chat' | 'settings';
const viewLabels: Record<RoomView, string> = {
  records: '내역',
  stats: '통계',
  chat: '대화',
  settings: '설정',
};

/** Room title bar: back (to where the room was opened from), name and period, ⋯ menu. The title is
 * the page heading. */
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
      <IconButton aria-label="뒤로" onClick={onBack}>
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
  records: <List size={20} />,
  stats: <ChartPie size={20} />,
  chat: <MessageCircle size={20} />,
  settings: <Settings2 size={20} />,
};

/**
 * Bottom bar of a room, within thumb reach: 내역, 통계, 대화 for a ledger that holds records, and
 * 설정. The views
 * keep the segmented keyboard contract (arrow keys, Home, End).
 */
export function RoomTabBar({
  views,
  view,
  onViewChange,
}: {
  views: RoomView[];
  view: RoomView;
  onViewChange(view: RoomView): void;
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
    </div>
  );
}

export type HomeTab = 'friends' | 'ledgers' | 'assets' | 'settings';
const homeTabs: { value: HomeTab; label: string; icon: ReactNode }[] = [
  { value: 'friends', label: '친구', icon: <Users size={20} /> },
  { value: 'ledgers', label: '가계부', icon: <BookOpen size={20} /> },
  { value: 'assets', label: '자산', icon: <Wallet size={20} /> },
  { value: 'settings', label: '설정', icon: <Settings size={20} /> },
];

/** Bottom bar of the app's home: 친구 (with requests and invitations waiting), 가계부, 자산, 설정. */
export function HomeTabBar({
  tab,
  onTabChange,
  pending = 0,
}: {
  tab: HomeTab;
  onTabChange(tab: HomeTab): void;
  /** Friend requests and ledger invitations waiting for an answer. */
  pending?: number;
}) {
  return (
    <div className="ledger-tab-bar">
      <SegmentedControl
        aria-label="메뉴"
        appearance="plain"
        value={tab}
        onValueChange={onTabChange}
        options={homeTabs.map(({ value, label, icon }) => ({
          value,
          label: (
            <>
              {icon}
              <span>{label}</span>
              {value === 'friends' && (
                <CountBadge count={pending} label={`답할 요청·초대 ${pending}건`} />
              )}
            </>
          ),
        }))}
      />
    </div>
  );
}

/**
 * 수입 · 지출 · 남은 금액 for the room's current scope, in full. Three columns fit amounts below
 * 1억; from 1억 the amounts stack into rows so the whole number stays on one line.
 */
export function SummaryStrip({
  totals,
  balanceLabel = '남은 금액',
}: {
  totals: Totals;
  /** Names income minus expense, such as 잔액 변화 for an asset. */
  balanceLabel?: string;
}) {
  const large = Math.max(totals.income, totals.expense, Math.abs(totals.balance)) >= 100_000_000;
  return (
    <dl className="ledger-summary" data-layout={large ? 'rows' : undefined}>
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
        <dt>{balanceLabel}</dt>
        <dd>
          <Amount value={totals.balance} size="sm" />
        </dd>
      </div>
    </dl>
  );
}
