import { CalendarDays, ChevronLeft, List, Menu, Settings2 } from 'lucide-react';
import { UgaIcon, UgaLedgerIcon } from './brand/Uga';
import { Tooltip } from './Tooltip';
import { Button, IconButton } from './ui';
import './room-header.css';

export type RoomView = 'list' | 'calendar' | 'analytics' | 'planning';
export interface RoomHeaderProps {
  name: string;
  /** Full accessible path, including this ledger. */
  path: string;
  /** Ancestor names, excluding this ledger. Empty for a top-level room. */
  parentPath?: string;
  icon?: string;
  archived?: boolean;
  aggregate?: boolean;
  view: RoomView;
  onBack(): void;
  onViewChange(view: RoomView): void;
  onMenu(): void;
  /** Omit for the aggregate view. Actual settings permissions remain in the form. */
  onSettings?(): void;
}
const views = [
  { value: 'list', label: '목록', icon: <List size={17} aria-hidden="true" /> },
  { value: 'calendar', label: '캘린더', icon: <CalendarDays size={17} aria-hidden="true" /> },
  { value: 'analytics', label: '통계', icon: <UgaIcon name="analytics" size={19} /> },
  { value: 'planning', label: '계획 · 일정', icon: <UgaIcon name="planning" size={19} /> },
] as const;

/** Pure room context and view navigation. Routing and permissions stay in App. */
export default function RoomHeader({
  name,
  path,
  parentPath,
  icon,
  archived = false,
  aggregate = false,
  view,
  onBack,
  onViewChange,
  onMenu,
  onSettings,
}: RoomHeaderProps) {
  return (
    <section className="room-context" aria-label="현재 가계부">
      <div className="room-context-heading">
        <IconButton className="room-back" aria-label="가계부 목록" onClick={onBack}>
          <ChevronLeft size={23} aria-hidden="true" />
        </IconButton>
        <span className="room-context-icon">
          <UgaLedgerIcon value={icon} size={34} />
        </span>
        <div className="room-context-title">
          <Tooltip content={path || name}>
            <h1 tabIndex={0}>{name}</h1>
          </Tooltip>
          <span>
            {aggregate
              ? '모든 가계부 모아보기'
              : `${parentPath || '우리 집 공동 가계부'}${archived ? ' · 보관됨' : ''}`}{' '}
            · {views.find((item) => item.value === view)?.label}
          </span>
        </div>
        {!aggregate && onSettings && (
          <IconButton
            className="room-settings-mobile"
            aria-label="가계부 설정"
            onClick={onSettings}
          >
            <Settings2 size={20} aria-hidden="true" />
          </IconButton>
        )}
        <IconButton className="room-menu" aria-label="우리 집 메뉴" onClick={onMenu}>
          <Menu size={21} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="room-tabs" role="group" aria-label="가계부 보기">
        {views.map((item) => (
          <Button
            key={item.value}
            variant="plain"
            className={view === item.value ? 'selected' : ''}
            aria-pressed={view === item.value}
            onClick={() => onViewChange(item.value)}
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
