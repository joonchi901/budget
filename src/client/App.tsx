import {
  ALL_LEDGERS_ID,
  ledgerAncestors,
  ledgerDescendantIds,
  ledgerPath,
  sortedLedgerChildren,
} from '../shared/hierarchy';
import { isRoomPage, type AppPage } from '../shared/app-route';
import { useAppRoute } from './useAppRoute';
import LedgerRooms from './LedgerRooms';
import LedgerTree from './LedgerTree';
import HierarchyDialog, { type MoveIntent } from './HierarchyDialog';
import MemberRoles from './MemberRoles';
import LedgerCalendar from './LedgerCalendar';
import './hierarchy.css';
import { Tooltip } from './Tooltip';
import {
  UgaAvatar,
  UgaIcon,
  UgaIllustration,
  UgaLedgerIcon,
  UgaLogo,
  UgaMascot,
  UGA_CHART_COLORS,
} from './brand/Uga';
import { SelectField, SelectOption } from './SelectField';
import { MonthField } from './DateFields';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Link2,
  List,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import type { Bootstrap, Ledger, Transaction, TransactionType } from '../shared/types';
import { categoryNames, tagGroupBreakdown, totals, visibleTransactions } from '../shared/selectors';
import { request, useBudget } from './api';
import { Dialog, Empty, Stat, fieldName, labels, ownerName, won } from './components';
import TransactionForm from './TransactionForm';
import LedgerForm from './LedgerForm';
import AssetsView from './AssetsView';
import TagManager from './TagManager';
import { TagBadge } from './TagBadge';
import PaymentsView from './PaymentsView';
import PlanningView from './PlanningView';
import AnalyticsView from './AnalyticsView';
import { accountingPeriod, budgetSummary } from '../shared/planning';
import DataView from './DataView';
import { transactionForLedger } from '../shared/classification';
const ExcelImportView = lazy(() => import('./ExcelImportView'));

type Page = AppPage;
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
const colors = UGA_CHART_COLORS;
const navigation = [
  { id: 'rooms', label: '가계부', icon: 'home' },
  { id: 'assets', label: '자산', icon: 'assets' },
  { id: 'payments', label: '카드 · 통장', icon: 'payments' },
  { id: 'tags', label: '태그 설정', icon: 'tags' },
  { id: 'data', label: '데이터 관리', icon: 'data' },
] as const;

export default function App() {
  const { route, go, navigationWarning } = useAppRoute();
  const { ledgerId, page, month, view: ledgerView } = route;
  const inRoom = isRoomPage(page);
  const [mobileMenu, setMobileMenu] = useState(false);
  const state = useBudget(ledgerId);
  const [edit, setEdit] = useState<{
    ledgerId: string;
    original?: Transaction;
    initialDate?: string;
  } | null>(null);
  useEffect(() => {
    if (edit && (!inRoom || edit.ledgerId !== ledgerId)) {
      setEdit(null);
      state.presence(null, null);
    }
  }, [edit, inRoom, ledgerId, state.presence]);
  useEffect(() => {
    if (edit?.original?.ledgerId === ledgerId) state.presence(edit.original.id, null);
  }, [ledgerId, edit?.original?.id, state.presence]);
  const [calendarAddDate, setCalendarAddDate] = useState<string | null>(null);
  const [calendarTarget, setCalendarTarget] = useState('');
  const [newLedger, setNewLedger] = useState(false);
  const [newLedgerParent, setNewLedgerParent] = useState<string | null>(null);
  const [moveIntent, setMoveIntent] = useState<MoveIntent | null>(null);
  const [memberRoles, setMemberRoles] = useState(false);
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [period, setPeriod] = useState<'month' | 'year' | 'period'>('month');
  const [settingsLedger, setSettingsLedger] = useState<Ledger | null>(null);
  const [config, setConfig] = useState<{ demoEnabled: boolean; oidcEnabled: boolean }>({
    demoEnabled: false,
    oidcEnabled: false,
  });
  useEffect(() => {
    void request<typeof config>('/api/config')
      .then(setConfig)
      .catch(() => {});
  }, []);
  const [toast, setToast] = useState('');
  const [help, setHelp] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const data = state.data;
  const setMonth = (value: string) => go({ ...route, month: value }, { replace: true });
  const changeLedgerView = (view: 'list' | 'calendar') => {
    go({ ...route, page: 'ledger', view });
    if (!data) return;
    try {
      localStorage.setItem(`budget:ledger-view:${data.user.id}:${ledgerId}`, view);
    } catch {
      // Viewing the ledger must remain available when device storage is blocked.
    }
  };
  const overall: Ledger = {
    id: ALL_LEDGERS_ID,
    name: '전체 가계부',
    icon: '🏡',
    kind: 'main',
    parentId: null,
    budget: 0,
    startDate: null,
    endDate: null,
    archived: false,
    version: 0,
  };
  const ledger =
    ledgerId === ALL_LEDGERS_ID
      ? overall
      : (data?.ledgers.find((l) => l.id === ledgerId) ?? data?.ledgers[0] ?? overall);
  const admin = data?.user.role === 'admin';
  const isOverall = ledger.id === ALL_LEDGERS_ID;
  const initializedLedger = useRef('');
  useEffect(() => {
    if (!data || !inRoom) {
      initializedLedger.current = '';
      return;
    }
    if (ledgerId !== ALL_LEDGERS_ID && !data.ledgers.some((item) => item.id === ledgerId)) {
      go({ ...route, page: 'rooms', ledgerId: ALL_LEDGERS_ID }, { replace: true });
      setActionError('이 가계부를 찾을 수 없어 목록으로 돌아왔어요.');
      return;
    }
    if (initializedLedger.current !== ledgerId) {
      initializedLedger.current = ledgerId;
      setPeriod(ledger.startDate && ledger.endDate ? 'period' : 'month');
      setIncludeDescendants(true);
    }
  }, [data, inRoom, ledgerId, ledger.startDate, ledger.endDate, go, route]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [page, ledgerId, ledgerView]);
  const entries = useMemo(
    () => (data ? visibleTransactions(data, ledgerId, month, { includeDescendants, period }) : []),
    [data, ledgerId, month, includeDescendants, period],
  );
  const calendarEntries = useMemo(() => {
    if (!data) return [];
    // Calendar months always run from the first to the last date, independent of accounting periods.
    return visibleTransactions(
      { ...data, ledgers: data.ledgers.map((item) => ({ ...item, periodStartDay: 1 })) },
      ledgerId,
      month,
      { includeDescendants, period: 'month' },
    );
  }, [data, ledgerId, month, includeDescendants]);
  function addOnDate(date: string) {
    if (ledger.archived) return;
    if (isOverall) {
      setCalendarTarget('');
      setCalendarAddDate(date);
    } else setEdit({ ledgerId, initialDate: date });
  }
  function notice(message: string) {
    setToast(message);
  }
  function navigate(id: string, view?: 'list' | 'calendar', createdLedger?: Ledger) {
    state.presence(null, null);
    const target = createdLedger ?? data?.ledgers.find((item) => item.id === id);
    const start = target?.startDate;
    const end = target?.endDate;
    setIncludeDescendants(true);
    setPeriod(start && end ? 'period' : 'month');
    let preferredView = view ?? 'list';
    if (!view && data) {
      try {
        preferredView =
          localStorage.getItem(`budget:ledger-view:${data.user.id}:${id}`) === 'calendar'
            ? 'calendar'
            : 'list';
      } catch {
        /* Device storage is optional. */
      }
    }
    go({
      page: 'ledger',
      ledgerId: id,
      view: preferredView,
      month:
        start && end && (month < start.slice(0, 7) || month > end.slice(0, 7))
          ? start.slice(0, 7)
          : month,
    });
    setActionError('');
    setMobileMenu(false);
  }
  function changePage(next: Page) {
    go({ ...route, page: next });
    setMobileMenu(false);
    state.presence(null, null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function openNewLedger(parentId: string | null = null) {
    setNewLedgerParent(parentId);
    setMobileMenu(false);
    setNewLedger(true);
  }
  async function login(userId: 'u1' | 'u2') {
    setLoginBusy(true);
    setActionError('');
    try {
      await state.login(userId);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setLoginBusy(false);
    }
  }
  const closeEdit = () => {
    setEdit(null);
    state.presence(null, null);
  };
  if (state.loading)
    return (
      <div className="loading">
        <UgaMascot size={104} />
        <p>우리의 기록을 불러오고 있어요…</p>
      </div>
    );
  if (!data || !ledger)
    return (
      <div className="login-page">
        <div className="login-art">
          <UgaLogo
            variant="primary"
            size={230}
            className="login-brand-hero"
            alt="우가 · 우리의 가계부"
          />
          <h1>
            우리가 쓰는 오늘,
            <br />더 나은 내일
          </h1>
          <p>
            함께 쓰고, 함께 살펴보는
            <br />
            우리 둘의 가계부.
          </p>
          <div className="login-brand-message">
            <UgaIcon name="sprout" size={28} />
            <span>작은 기록이 큰 변화를 만들어요.</span>
          </div>
          <span className="art-bottom">둘이서 만들어가는 좋은 습관</span>
        </div>
        <main className="login-content">
          <div className="brand">
            <UgaLogo size={180} alt="우가 · 우리의 가계부" />
          </div>
          <span className="demo-chip">
            {config.demoEnabled ? '로컬 미리보기' : '우리 둘의 기록'}
          </span>
          <h2>반가워요.</h2>
          {config.demoEnabled && (
            <p>
              예시 데이터로 가계부를 둘러보세요.
              <br />각 창에서 다른 사용자를 선택하면 공동 편집을 확인할 수 있어요.
            </p>
          )}
          {config.oidcEnabled && (
            <a className="primary" href="/api/auth/oidc/start">
              Google 계정으로 로그인
            </a>
          )}
          {(actionError || state.error) && (
            <div className="alert error" role="alert">
              {actionError || state.error}
            </div>
          )}
          {config.demoEnabled && (
            <div className="login-users">
              <button disabled={loginBusy} onClick={() => void login('u1')}>
                <span className="avatar purple">
                  <UgaAvatar mood="happy" size={44} />
                </span>
                <span>
                  <strong>나로 시작하기</strong>
                  <small>예시 사용자 1</small>
                </span>
                <ArrowUpRight size={19} />
              </button>
              <button disabled={loginBusy} onClick={() => void login('u2')}>
                <span className="avatar pink">
                  <UgaAvatar mood="calm" size={44} />
                </span>
                <span>
                  <strong>와이프로 시작하기</strong>
                  <small>예시 사용자 2</small>
                </span>
                <ArrowUpRight size={19} />
              </button>
            </div>
          )}
          <p className="login-note">
            {config.demoEnabled
              ? '로컬 예시 계정으로 확인하는 개발 환경이에요.'
              : config.oidcEnabled
                ? '등록된 두 계정만 이 가계부에 접근할 수 있어요.'
                : '운영 로그인 설정이 필요해요. 관리자에게 인증 설정을 요청해 주세요.'}
          </p>
        </main>
      </div>
    );
  const pageTitle = {
    rooms: '가계부',
    ledger: ledger.name,
    assets: '우리의 자산',
    payments: '카드와 통장',
    analytics: '기록으로 보는 우리',
    tags: '우리만의 태그',
    planning: '계획과 일정',
    data: '데이터 관리',
  }[page];
  const roomTabName =
    page === 'analytics'
      ? '통계'
      : page === 'planning'
        ? '계획 · 일정'
        : ledgerView === 'calendar'
          ? '캘린더'
          : '목록';
  const children = !isOverall ? sortedLedgerChildren(data.ledgers, ledgerId) : [];
  return (
    <div className={`app-shell room-layout ${inRoom ? 'in-room' : 'outside-room'}`}>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changePage('rooms');
          }}
        >
          <UgaLogo size={170} alt="우가 · 우리의 가계부" />
        </a>
        <div className="household">
          <div className="household-icon">
            <UgaIcon name="home" size={26} />
          </div>
          <div>
            <strong>우리 집</strong>
            <span>함께 쓰는 가계부</span>
          </div>
          <span className="household-count">2</span>
        </div>
        <nav className="main-nav" aria-label="주 메뉴">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={page === item.id || (item.id === 'rooms' && inRoom) ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => changePage(item.id)}
            >
              <UgaIcon name={item.icon} size={24} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ledger-nav">
          <div className="nav-section-title">
            <span>내 가계부</span>
            {admin && (
              <button
                className="icon-button"
                aria-label="가계부 추가"
                onClick={() => openNewLedger()}
              >
                <Plus size={17} />
              </button>
            )}
          </div>
          <LedgerTree
            data={data}
            selectedId={ledgerId}
            onNavigate={navigate}
            onMove={setMoveIntent}
          />
        </div>
        <div className="sidebar-bottom">
          {admin && (
            <button className="help-button" onClick={() => setMemberRoles(true)}>
              구성원 권한
            </button>
          )}
          <button className="help-button" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            기록 가이드
          </button>
          <div className="profile">
            <span className="avatar small" style={{ background: data.user.color }}>
              <UgaAvatar mood={data.user.id === 'u1' ? 'happy' : 'calm'} size={36} />
            </span>
            <div>
              <strong>{data.user.name}</strong>
              <span>{data.mode === 'demo' ? '로컬 예시 계정' : '공동 가계부 계정'}</span>
            </div>
            <button
              className="icon-button"
              aria-label="로그아웃"
              onClick={() => {
                void state.logout().catch((e) => setActionError(e.message));
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            {inRoom ? '내 가계부' : page === 'rooms' ? '우리 집' : '우리 집 공통'}{' '}
            <ChevronRight size={13} />
            <span>{inRoom ? roomTabName : pageTitle}</span>
          </div>
          <div className="collaboration">
            <div className="avatar-group">
              <Tooltip content={`${data.user.name} (나)`}>
                <span
                  className="avatar tiny"
                  role="img"
                  aria-label={`${data.user.name} (나)`}
                  style={{ background: data.user.color }}
                >
                  <UgaAvatar mood={data.user.id === 'u1' ? 'happy' : 'calm'} size={28} />
                </span>
              </Tooltip>
              {state.peers.map((peer, index) => (
                <Tooltip
                  content={`${peer.name} · ${data.ledgers.find((l) => l.id === peer.ledgerId)?.name ?? '가계부'}`}
                  key={`${peer.userId}-${index}`}
                >
                  <span
                    className="avatar tiny"
                    role="img"
                    aria-label={peer.name}
                    style={{ background: peer.color }}
                  >
                    <UgaAvatar mood={peer.userId === 'u1' ? 'happy' : 'calm'} size={28} />
                  </span>
                </Tooltip>
              ))}
            </div>
            <span className={`live-status ${state.connection}`} data-testid="connection">
              <i />
              {state.connection === 'live'
                ? '실시간 연결됨'
                : state.connection === 'connecting'
                  ? '연결 중'
                  : '다시 연결 중'}
            </span>
            {data.mode === 'demo' && <span className="demo-chip">로컬 환경</span>}
          </div>
        </header>
        {inRoom && (
          <section className="room-context" aria-label="현재 가계부">
            <div className="room-context-heading">
              <button
                className="icon-button room-back"
                aria-label="가계부 목록"
                onClick={() => changePage('rooms')}
              >
                <ChevronLeft size={23} />
              </button>
              <span className="room-context-icon">
                <UgaLedgerIcon value={ledger.icon} size={34} />
              </span>
              <div className="room-context-title">
                <Tooltip content={ledgerPath(data.ledgers, ledger.id) || ledger.name}>
                  <h1 tabIndex={0}>{ledger.name}</h1>
                </Tooltip>
                <span>
                  {isOverall
                    ? '모든 가계부 모아보기'
                    : `${
                        ledgerAncestors(data.ledgers, ledger.id)
                          .map((item) => item.name)
                          .join(' / ') || '우리 집 공동 가계부'
                      }${ledger.archived ? ' · 보관됨' : ''}`}{' '}
                  · {roomTabName}
                </span>
              </div>
              {!isOverall && (
                <button
                  className="icon-button room-settings-mobile"
                  aria-label="가계부 설정"
                  onClick={() => setSettingsLedger(ledger)}
                >
                  <Settings2 size={20} />
                </button>
              )}
              <button
                className="icon-button room-menu"
                aria-label="우리 집 메뉴"
                onClick={() => setMobileMenu(true)}
              >
                <Menu size={21} />
              </button>
            </div>
            <div className="room-tabs" role="group" aria-label="가계부 보기">
              <button
                className={page === 'ledger' && ledgerView === 'list' ? 'selected' : ''}
                aria-pressed={page === 'ledger' && ledgerView === 'list'}
                onClick={() => changeLedgerView('list')}
              >
                <List size={17} />
                목록
              </button>
              <button
                className={page === 'ledger' && ledgerView === 'calendar' ? 'selected' : ''}
                aria-pressed={page === 'ledger' && ledgerView === 'calendar'}
                onClick={() => changeLedgerView('calendar')}
              >
                <CalendarDays size={17} />
                캘린더
              </button>
              <button
                className={page === 'analytics' ? 'selected' : ''}
                aria-pressed={page === 'analytics'}
                onClick={() => changePage('analytics')}
              >
                <UgaIcon name="analytics" size={19} />
                통계
              </button>
              <button
                className={page === 'planning' ? 'selected' : ''}
                aria-pressed={page === 'planning'}
                onClick={() => changePage('planning')}
              >
                <UgaIcon name="planning" size={19} />
                계획 · 일정
              </button>
            </div>
          </section>
        )}
        <main className={`main-content page-${page}`} id="main-content" tabIndex={-1}>
          <div className="page-heading">
            {!inRoom && (
              <div>
                {page !== 'rooms' && <span className="common-scope-label">우리 집 공통</span>}
                <h1>
                  <span className="heading-emoji">
                    {page === 'ledger' ? (
                      <UgaLedgerIcon value={ledger.icon} size={30} />
                    ) : (
                      <UgaIcon name={page === 'rooms' ? 'home' : page} size={30} />
                    )}
                  </span>
                  {pageTitle}
                </h1>
                <p>
                  {page === 'rooms'
                    ? '함께 기록할 가계부를 선택하세요.'
                    : page === 'ledger'
                      ? isOverall
                        ? '모든 가계부의 원본 기록을 중복 없이 모아 봐요.'
                        : '이 가계부와 하위 가계부의 기록을 함께 살펴보세요.'
                      : page === 'assets'
                        ? '어디에 얼마가 있는지, 우리의 자산을 함께 살펴보세요.'
                        : page === 'payments'
                          ? '사용 내역과 앞으로 나갈 카드 대금을 확인해요.'
                          : page === 'tags'
                            ? '태그 유형과 옵션을 우리 생활에 맞게 구성해요.'
                            : page === 'planning'
                              ? '예산과 목표, 급여 배분과 일정을 함께 계획해요.'
                              : page === 'data'
                                ? '원본 자료를 가져오고, 기록을 검토하고 보관해요.'
                                : '태그로 기록을 모아, 소비의 흐름을 발견해 보세요.'}
                </p>
              </div>
            )}
            <div className="heading-actions">
              {page === 'rooms' && admin && (
                <button className="primary" onClick={() => openNewLedger()}>
                  <Plus size={17} />새 가계부
                </button>
              )}
              {page !== 'rooms' && page !== 'tags' && page !== 'data' && (
                <div className="month-picker">
                  <button
                    className="icon-button"
                    aria-label="이전 달"
                    onClick={() => setMonth(shiftMonth(month, -1))}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <label>
                    <span className="sr-only">조회 월</span>
                    <MonthField
                      aria-label="조회 월"
                      required
                      value={month}
                      onValueChange={(value) => {
                        if (value) setMonth(value);
                      }}
                    />
                  </label>
                  <button
                    className="icon-button"
                    aria-label="다음 달"
                    onClick={() => setMonth(shiftMonth(month, 1))}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              )}
              {inRoom && !isOverall && (
                <button className="secondary" onClick={() => setSettingsLedger(ledger)}>
                  가계부 설정
                </button>
              )}
              {inRoom && !isOverall && (
                <button
                  className="primary"
                  disabled={ledger.archived}
                  onClick={() => {
                    setEdit({ ledgerId });
                    state.presence(null, '새 내역');
                  }}
                >
                  <Plus size={17} />
                  내역 추가
                </button>
              )}
            </div>
          </div>
          {inRoom && !isOverall && (children.length > 0 || admin) && (
            <details className="room-child-ledgers" key={`children:${ledger.id}`}>
              <summary>
                하위 가계부 <span>{children.length}개</span>
                <ChevronRight size={16} />
              </summary>
              <div className="room-child-list">
                {children.map((child) => (
                  <button key={child.id} onClick={() => navigate(child.id)}>
                    <UgaLedgerIcon value={child.icon} size={24} />
                    <span>
                      {child.name}
                      {child.archived && <small>보관됨</small>}
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
                {admin && !ledger.archived && (
                  <button className="room-child-create" onClick={() => openNewLedger(ledger.id)}>
                    <Plus size={18} />
                    <span>하위 가계부 추가</span>
                  </button>
                )}
              </div>
            </details>
          )}
          {page === 'ledger' && (
            <>
              <div className="ledger-context-toolbar">
                <nav className="ledger-breadcrumbs" aria-label="가계부 경로">
                  <button onClick={() => navigate(ALL_LEDGERS_ID)}>전체 가계부</button>
                  {!isOverall &&
                    [...ledgerAncestors(data.ledgers, ledger.id), ledger].map((item) => (
                      <span key={item.id}>
                        <ChevronRight size={12} />
                        <button
                          onClick={() => navigate(item.id)}
                          aria-current={item.id === ledger.id ? 'page' : undefined}
                        >
                          {item.name}
                        </button>
                      </span>
                    ))}
                </nav>
                <div className="ledger-view-controls">
                  <label>
                    조회 기간
                    <SelectField
                      value={ledgerView === 'calendar' ? 'month' : period}
                      disabled={ledgerView === 'calendar'}
                      onValueChange={(value) => setPeriod(value as typeof period)}
                    >
                      <SelectOption value="month">선택 월</SelectOption>
                      <SelectOption value="year">선택 연도</SelectOption>
                      <SelectOption value="period">
                        {isOverall ? '전체 기록 기간' : '가계부 설정 기간'}
                      </SelectOption>
                    </SelectField>
                  </label>
                  {!isOverall && (
                    <label>
                      조회 대상
                      <SelectField
                        value={includeDescendants ? 'descendants' : 'self'}
                        onValueChange={(value) => setIncludeDescendants(value === 'descendants')}
                      >
                        <SelectOption value="descendants">하위 가계부 포함</SelectOption>
                        <SelectOption value="self">이 가계부만</SelectOption>
                      </SelectField>
                    </label>
                  )}
                </div>
              </div>
              {isOverall && (
                <div className="overall-ledger-notice">
                  <span>기록을 추가할 원본 가계부를 먼저 선택하세요.</span>
                  <label>
                    <span className="sr-only">기록할 가계부</span>
                    <SelectField
                      value=""
                      onValueChange={(id) => {
                        if (id) navigate(id);
                      }}
                    >
                      <SelectOption value="">가계부 선택</SelectOption>
                      {data.ledgers
                        .filter((item) => !item.archived)
                        .map((item) => (
                          <SelectOption key={item.id} value={item.id}>
                            {ledgerPath(data.ledgers, item.id)}
                          </SelectOption>
                        ))}
                    </SelectField>
                  </label>
                </div>
              )}
            </>
          )}
          {navigationWarning && (
            <div className="alert" role="alert">
              {navigationWarning}
            </div>
          )}
          {(state.error || actionError) && (
            <div className="alert error" role="alert">
              {actionError || state.error}
              <button
                type="button"
                onClick={() => {
                  setActionError('');
                  void state.refresh();
                }}
              >
                새로고침
              </button>
            </div>
          )}
          {state.connection === 'offline' && (
            <div className="alert">
              <WifiOff size={17} />
              연결을 복구하고 있어요. 재연결되면 최신 기록을 불러와요.
            </div>
          )}
          {page === 'rooms' && (
            <LedgerRooms data={data} onOpen={navigate} onCreate={() => openNewLedger()} />
          )}
          {page === 'ledger' && ledgerView === 'calendar' && (
            <LedgerCalendar
              data={data}
              ledger={ledger}
              month={month}
              entries={calendarEntries}
              onAdd={addOnDate}
              onOpen={(tx) => {
                navigate(tx.ledgerId);
                setEdit({ ledgerId: tx.ledgerId, original: tx });
              }}
            />
          )}
          {page === 'ledger' && ledgerView === 'list' && (
            <LedgerView
              key={`transactions:${ledger.id}`}
              data={data}
              ledger={ledger}
              entries={entries}
              month={month}
              peers={state.peers}
              onEdit={(tx) => {
                setEdit({ ledgerId: tx.ledgerId, original: tx });
              }}
              onNavigate={navigate}
              period={period}
              includeDescendants={includeDescendants}
            />
          )}
          {page === 'assets' && (
            <AssetsView data={data} month={month} onChanged={state.refresh} onNotice={notice} />
          )}
          {page === 'tags' && <TagManager data={data} onChanged={state.refresh} />}
          {page === 'payments' && (
            <PaymentsView data={data} month={month} onChanged={state.refresh} onNotice={notice} />
          )}
          {page === 'planning' && (
            <PlanningView
              key={`plans:${ledgerId}`}
              lockedLedger
              data={data}
              month={month}
              ledgerId={ledgerId}
              onChanged={state.refresh}
              onNotice={notice}
            />
          )}
          {page === 'data' && (
            <DataView
              data={data}
              onChanged={state.refresh}
              onNotice={notice}
              excelImport={
                <Suspense fallback={<p className="muted">엑셀 가져오기 준비 중…</p>}>
                  <ExcelImportView
                    data={data}
                    onChanged={state.refresh}
                    onNotice={notice}
                    onOpenLedger={(id) => {
                      navigate(id, 'list');
                      setPeriod('period');
                    }}
                  />
                </Suspense>
              }
            />
          )}
          {page === 'analytics' && (
            <AnalyticsView
              key={`analytics:${ledgerId}`}
              lockedLedger
              data={data}
              ledgerId={ledgerId}
              setLedgerId={(id) => go({ ...route, ledgerId: id })}
              month={month}
              onEdit={(tx) => {
                navigate(tx.ledgerId);
                setEdit({ ledgerId: tx.ledgerId, original: tx });
              }}
            />
          )}
          <footer className="page-footer">
            <span>
              <UgaIcon name="sprout" size={18} /> 우가 · 우리의 가계부
            </span>
            <span>{data.mode === 'demo' ? '로컬 미리보기 · 가상 데이터' : '우리 둘만의 기록'}</span>
          </footer>
        </main>
      </div>
      <nav
        className="mobile-navigation"
        aria-label="모바일 주 메뉴"
        aria-hidden={mobileMenu || undefined}
      >
        {inRoom ? (
          <>
            <button onClick={() => changePage('rooms')}>
              <ChevronLeft size={22} />
              <span>가계부 목록</span>
            </button>
            {!isOverall && (
              <button
                className="room-add-entry"
                disabled={ledger.archived}
                onClick={() => {
                  setEdit({ ledgerId });
                  state.presence(null, '새 내역');
                }}
              >
                <Plus size={22} />
                <span>내역 추가</span>
              </button>
            )}
          </>
        ) : (
          navigation.slice(0, 4).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => changePage(item.id)}
            >
              <UgaIcon name={item.icon} size={24} />
              <span>{item.label}</span>
            </button>
          ))
        )}
        <button onClick={() => setMobileMenu(true)} aria-expanded={mobileMenu}>
          <Menu size={22} />
          <span>더보기</span>
        </button>
      </nav>
      {mobileMenu && (
        <Dialog title="전체 메뉴" onClose={() => setMobileMenu(false)}>
          <div className="form-body mobile-menu-content">
            <div className="mobile-menu-grid">
              {navigation.map((item) => (
                <button key={item.id} onClick={() => changePage(item.id)}>
                  <UgaIcon name={item.icon} size={28} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            <div className="section-heading">
              <h3>내 가계부</h3>
              {admin && (
                <button
                  className="text-button"
                  onClick={() => {
                    setMobileMenu(false);
                    openNewLedger();
                  }}
                >
                  <Plus size={16} />
                  가계부 추가
                </button>
              )}
            </div>
            <LedgerTree
              data={data}
              selectedId={ledgerId}
              onNavigate={navigate}
              onMove={(intent) => {
                setMobileMenu(false);
                setMoveIntent(intent);
              }}
              name="모바일 가계부 트리"
            />
            {admin && (
              <button
                className="help-button"
                onClick={() => {
                  setMobileMenu(false);
                  setMemberRoles(true);
                }}
              >
                구성원 권한
              </button>
            )}
            <button
              className="help-button"
              onClick={() => {
                setMobileMenu(false);
                setHelp(true);
              }}
            >
              <CircleHelp size={18} />
              기록 가이드
            </button>
            <button
              className="help-button"
              onClick={() => {
                setMobileMenu(false);
                void state.logout().catch((e) => setActionError(e.message));
              }}
            >
              <LogOut size={18} />
              로그아웃
            </button>
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="알림 닫기" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      )}
      {edit && inRoom && edit.ledgerId === ledgerId && (
        <TransactionForm
          key={`${data.householdId ?? data.mode}:${data.user.id}:${edit.ledgerId}:${edit.original?.id ?? `new:${edit.initialDate ?? ''}`}`}
          data={data}
          ledgerId={edit.ledgerId}
          month={month}
          original={edit.original}
          initialDate={edit.initialDate}
          onClose={closeEdit}
          onSaved={(message) => {
            closeEdit();
            notice(message);
            void state.refresh();
          }}
          presence={state.presence}
          onChanged={state.refresh}
        />
      )}
      {calendarAddDate && (
        <Dialog
          title="기록할 가계부 선택"
          subtitle={`${calendarAddDate}의 기록을 남길 곳을 선택해 주세요.`}
          onClose={() => setCalendarAddDate(null)}
        >
          <div className="form-body">
            <label>
              원본 가계부
              <SelectField value={calendarTarget} onValueChange={setCalendarTarget}>
                <SelectOption value="">가계부 선택</SelectOption>
                {data.ledgers
                  .filter((item) => !item.archived)
                  .map((item) => (
                    <SelectOption key={item.id} value={item.id}>
                      {ledgerPath(data.ledgers, item.id)}
                    </SelectOption>
                  ))}
              </SelectField>
            </label>
            {!data.ledgers.some((item) => !item.archived) && (
              <p className="small muted">관리자가 기록할 가계부를 먼저 만들어 주세요.</p>
            )}
          </div>
          <div className="form-footer">
            <span />
            <button
              className="primary"
              disabled={!data.ledgers.some((item) => item.id === calendarTarget && !item.archived)}
              onClick={() => {
                const date = calendarAddDate;
                navigate(calendarTarget);
                setCalendarAddDate(null);
                setEdit({ ledgerId: calendarTarget, initialDate: date });
              }}
            >
              이 가계부에 기록
            </button>
          </div>
        </Dialog>
      )}
      {settingsLedger && (
        <LedgerForm
          data={data}
          original={settingsLedger}
          onChanged={state.refresh}
          onClose={() => {
            setSettingsLedger(null);
            void state.refresh();
          }}
          onSaved={() => {
            setSettingsLedger(null);
            void state.refresh();
            notice('가계부 설정을 저장했어요.');
          }}
        />
      )}
      {newLedger && (
        <LedgerForm
          data={data}
          initialParentId={newLedgerParent}
          onChanged={state.refresh}
          onClose={() => setNewLedger(false)}
          onSaved={(created) => {
            setNewLedger(false);
            void state.refresh().then(() => navigate(created.id, 'list', created));
            notice('새 가계부를 만들었어요.');
          }}
        />
      )}
      {moveIntent && (
        <HierarchyDialog
          key={`${moveIntent.ledger.id}:${moveIntent.hierarchyVersion}`}
          data={data}
          intent={moveIntent}
          onChanged={state.refresh}
          onClose={() => setMoveIntent(null)}
          onSaved={() => {
            setMoveIntent(null);
            notice('가계부 위치를 변경했어요.');
          }}
        />
      )}
      {memberRoles && (
        <MemberRoles data={data} onChanged={state.refresh} onClose={() => setMemberRoles(false)} />
      )}
      {help && (
        <Dialog title="함께 쓰는 기록 가이드" onClose={() => setHelp(false)}>
          <div className="form-body guide">
            <div className="uga-guide">
              <UgaMascot pose="record" size={80} />
              <p>작은 기록부터 우가와 함께 시작해요.</p>
            </div>
            <h3>기록은 한 번, 조회는 함께</h3>
            <p>
              상위 가계부에서는 모든 단계의 하위 기록을 함께 볼 수 있어요. 수정은 기록을 작성한 원본
              가계부에서 해요.
            </p>
            <h3>태그와 자산 반영</h3>
            <p>
              태그 설정에서 유형과 옵션을 만들고 기록에 붙여보세요. 수입·지출을 자산에 배분하면
              잔액에도 반영돼요. 자산 이동과 잔액 조정, 저축 집계는 자산 화면에서 관리해요.
            </p>
            <h3>카드 지출은 사용한 날 한 번</h3>
            <p>
              카드 대금은 카드 화면에서 예상 금액과 납부일을 확인해요. 수입·지출에 한 번 더 더하지
              않아요.
            </p>
            <h3>두 사람이 같은 내역을 수정하면</h3>
            <p>
              먼저 저장한 내용을 보호해요. 뒤에 저장한 사람에게 최신 내용을 보여주고 다시 확인하도록
              안내해요.
            </p>
            <h3>입력과 저장</h3>
            <p>
              새 내역은 기기에 초안으로 보관하고 저장 버튼으로 등록해요. 입력 완료 후 자동 저장을
              선택할 수도 있어요. 기존 내역은 유효한 값을 입력하고 필드를 벗어나면 자동 저장해요.
              저장 실패나 충돌은 화면에서 확인할 수 있어요.
            </p>
            <h3>이관과 백업</h3>
            <p>
              데이터 관리에서 엑셀·CSV를 대조한 뒤 가져오고 JSON으로 전체 백업할 수 있어요.
              날짜·연결이 불분명한 원본은 검토함에서 확인해요.
            </p>
            {data.mode === 'demo' && (
              <p className="small muted">
                현재는 로컬 예시 계정과 가상 자료를 사용해요. 실제 공동 사용은 두 사람의 로그인과
                배포 설정 후 이용할 수 있어요.
              </p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function LedgerView({
  data,
  ledger,
  entries,
  month,
  peers,
  onEdit,
  onNavigate,
  period,
  includeDescendants,
}: {
  data: Bootstrap;
  ledger: Ledger;
  entries: Transaction[];
  month: string;
  peers: ReturnType<typeof useBudget>['peers'];
  onEdit(tx: Transaction): void;
  onNavigate(id: string): void;
  period: 'month' | 'year' | 'period';
  includeDescendants: boolean;
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [summaryGroupId, setSummaryGroupId] = useState('');
  const [sourceScope, setSourceScope] = useState('all');
  const [sort, setSort] = useState('date-desc');
  const sourceLedgers = data.ledgers.filter(
    (item) =>
      item.id !== ledger.id &&
      (ledger.id === ALL_LEDGERS_ID || ledgerDescendantIds(data.ledgers, ledger.id).has(item.id)),
  );
  const canFilterSource =
    (ledger.id === ALL_LEDGERS_ID || includeDescendants) && sourceLedgers.length > 0;
  // A hidden source filter must not keep excluding records after a scope change or hierarchy move.
  const activeSource =
    canFilterSource &&
    (sourceScope === ledger.id || sourceLedgers.some((item) => item.id === sourceScope))
      ? sourceScope
      : 'all';
  useEffect(() => {
    if (sourceScope !== activeSource) setSourceScope(activeSource);
  }, [sourceScope, activeSource]);
  const query = search.trim().toLocaleLowerCase();
  const hasFilters = !!query || type !== 'all' || activeSource !== 'all';
  const resetFilters = () => {
    setSearch('');
    setType('all');
    setSourceScope('all');
  };
  const sum = totals(entries);
  const budgetState = budgetSummary(data, ledger.id, month, { includeDescendants, period });
  const budgetExpense = budgetState.expense;
  const budget = budgetState.amount;
  const remaining = budget - budgetExpense;
  const percent = budget > 0 ? Math.round((budgetExpense / budget) * 100) : 0;
  const summaryGroups = data.tagGroups.filter(
    (g) =>
      g.appliesTo === 'transaction' &&
      (!g.archived ||
        entries.some((t) =>
          t.tagIds.some((id) => data.tags.some((tag) => tag.id === id && tag.groupId === g.id)),
        )),
  );
  const usedGroups = summaryGroups.filter((g) =>
    entries.some((t) =>
      t.tagIds.some((id) => data.tags.some((tag) => tag.id === id && tag.groupId === g.id)),
    ),
  );
  const categoryGroup =
    summaryGroups.find((g) => g.id === summaryGroupId) ??
    usedGroups.find((g) => g.role === 'category') ??
    usedGroups[0] ??
    summaryGroups[0];
  const groups = categoryGroup
    ? tagGroupBreakdown(
        data,
        entries.map((tx) => transactionForLedger(data.ledgers, ledger.id, tx)),
        categoryGroup.id,
      )
        .filter((row) => row.count > 0)
        .sort((a, b) => b.amount - a.amount)
    : [];
  const filtered = entries
    .filter(
      (tx) =>
        (activeSource === 'all' || tx.ledgerId === activeSource) &&
        (type === 'all' || tx.type === type) &&
        `${tx.description} ${categoryNames(data, tx).join(' ')} ${tx.tagIds.map((id) => data.tags.find((t) => t.id === id)?.name).join(' ')}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .sort((a, b) => {
      const order =
        sort === 'amount-desc'
          ? b.amount - a.amount
          : sort === 'amount-asc'
            ? a.amount - b.amount
            : sort === 'date-asc'
              ? a.date.localeCompare(b.date)
              : b.date.localeCompare(a.date);
      return order || b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt);
    });
  const filteredSum = totals(filtered);
  return (
    <>
      <p className="ledger-period small muted">
        집계 기간 {budgetState.periodStart ?? '전체'} ~ {budgetState.periodEnd ?? '전체'} ·{' '}
        {ledger.id === ALL_LEDGERS_ID
          ? '모든 원본 가계부'
          : includeDescendants
            ? '모든 하위 가계부 포함'
            : '현재 가계부만'}
      </p>
      <section className="stats-grid" aria-label="조회 기간 요약">
        <Stat
          label={period === 'month' ? '이번 달 지출' : '조회 기간 지출'}
          amount={sum.expense}
          hint={
            ledger.id === ALL_LEDGERS_ID
              ? '모든 원본 기록을 한 번씩 집계'
              : includeDescendants
                ? '모든 하위 가계부 포함'
                : '현재 가계부만'
          }
          accent
        />
        <Stat
          label={period === 'month' ? '이번 달 수입' : '조회 기간 수입'}
          amount={sum.income}
          hint={
            period === 'month'
              ? `${monthLabel(month)} 기록 기준`
              : period === 'year'
                ? `${month.slice(0, 4)}년 기록 기준`
                : '선택한 가계부 기간 기준'
          }
        />
        <Stat
          label="수입 − 지출"
          amount={sum.income - sum.expense}
          hint="자산 이동·잔액 조정은 포함하지 않아요"
        />
        {ledger.id === ALL_LEDGERS_ID ? (
          <div className="stat">
            <span className="stat-label">원본 가계부</span>
            <strong>{new Set(entries.map((entry) => entry.ledgerId)).size}개</strong>
            <p>예산은 각 가계부에서 독립적으로 관리해요.</p>
          </div>
        ) : !budgetState.hasBudget ? (
          <div className="stat">
            <span className="stat-label">조회 기간 예산</span>
            <strong>미설정</strong>
            <p>계획에서 이 기간의 예산을 설정해 주세요.</p>
          </div>
        ) : (
          <Stat
            label="남은 예산"
            amount={remaining}
            hint={`예산 ${won(budget)}원 · ${budgetState.periodStart === '0001-01-01' && budgetState.periodEnd === '9999-12-31' ? '전체 기간' : `${budgetState.periodStart ?? '전체'} ~ ${budgetState.periodEnd ?? '전체'}`}`}
          />
        )}
      </section>
      <div className="ledger-body-grid">
        <section className="panel transactions-panel">
          <div className="transactions-heading">
            <div>
              <h2>
                거래 내역 <span className="count">{filtered.length}</span>
              </h2>
              <p>
                {includeDescendants
                  ? '하위 기록은 원본 가계부에서 수정해요.'
                  : '이 가계부에서 작성한 내역이에요.'}
              </p>
            </div>
            <label className="search">
              <Search size={16} />
              <input
                aria-label="내역 검색"
                placeholder="내용, 분류, 태그 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="검색어 지우기"
                  onClick={() => setSearch('')}
                >
                  <X size={16} />
                </button>
              )}
            </label>
          </div>
          {canFilterSource && (
            <label className="ledger-scope-select small muted">
              거래 목록의 가계부 범위
              <SelectField
                aria-label="거래 목록의 가계부 범위"
                value={activeSource}
                onValueChange={(value) => setSourceScope(value)}
              >
                <SelectOption value="all">조회 대상 전체</SelectOption>
                {ledger.id !== ALL_LEDGERS_ID && (
                  <SelectOption value={ledger.id}>이 가계부에 직접 기록한 내역</SelectOption>
                )}
                {sourceLedgers.map((l) => (
                  <SelectOption key={l.id} value={l.id}>
                    {ledgerPath(data.ledgers, l.id)}
                  </SelectOption>
                ))}
              </SelectField>
            </label>
          )}
          <div className="transaction-list-tools">
            <div className="transaction-tabs" role="group" aria-label="내역 종류 필터">
              {(['all', ...Object.keys(labels)] as const).map((t) => (
                <button
                  key={t}
                  aria-pressed={type === t}
                  className={type === t ? 'active' : ''}
                  onClick={() => setType(t)}
                >
                  {t === 'all' ? '전체' : labels[t as TransactionType]}
                </button>
              ))}
            </div>
            <SelectField
              aria-label="내역 정렬"
              value={sort}
              onValueChange={setSort}
              className="transaction-sort"
            >
              <SelectOption value="date-desc">최신순</SelectOption>
              <SelectOption value="date-asc">오래된순</SelectOption>
              <SelectOption value="amount-desc">금액 높은순</SelectOption>
              <SelectOption value="amount-asc">금액 낮은순</SelectOption>
            </SelectField>
          </div>
          {hasFilters && (
            <div className="transaction-filter-summary">
              <p role="status" aria-label="목록 조회 결과">
                전체 {entries.length}건 중 <strong>{filtered.length}건</strong>
                {query && <span>검색 “{search.trim()}”</span>}
                {type !== 'all' && <span>{labels[type as TransactionType]}</span>}
                {activeSource !== 'all' && (
                  <span>{data.ledgers.find((item) => item.id === activeSource)?.name}</span>
                )}
              </p>
              <button type="button" className="text-button" onClick={resetFilters}>
                조회 조건 초기화
              </button>
            </div>
          )}
          <div className="table-scroll" role="region" aria-label="거래 내역 목록" tabIndex={0}>
            <table className="transactions">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>내용</th>
                  <th>분류 · 태그</th>
                  <th>결제수단</th>
                  <th>귀속</th>
                  <th className="money-cell">금액</th>
                  <th>
                    <span className="sr-only">관리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const source = data.ledgers.find((l) => l.id === tx.ledgerId);
                  const indirect = tx.ledgerId !== ledger.id;
                  const editing = peers.find((p) => p.transactionId === tx.id);
                  return (
                    <tr
                      key={tx.id}
                      data-testid={`transaction-${tx.id}`}
                      className={editing ? 'peer-editing' : ''}
                    >
                      <td className="date-cell">
                        {Number(tx.date.slice(5, 7))}.{tx.date.slice(8)}
                      </td>
                      <td className="description-cell">
                        <strong className="transaction-name">{tx.description}</strong>
                        <div className="transaction-sub">
                          {indirect && (
                            <span className="source-label">
                              <UgaLedgerIcon value={source?.icon} size={16} /> {source?.name}
                            </span>
                          )}
                          {editing && (
                            <span className="peer-label">
                              {editing.name} · {fieldName(editing.field)} 편집 중
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="tags-cell">
                        <div className="row-tags transaction-tag-badges">
                          {categoryNames(data, tx).length === 0 && (
                            <span className="category-name">미분류</span>
                          )}
                          {tx.tagIds.map((id) => {
                            const tag = data.tags.find((t) => t.id === id);
                            return (
                              tag && (
                                <TagBadge
                                  key={id}
                                  name={tag.name}
                                  color={tag.color}
                                  title={data.tagGroups.find((g) => g.id === tag.groupId)?.name}
                                />
                              )
                            );
                          })}
                        </div>
                      </td>
                      <td className="payment-cell">
                        {tx.paymentMethodId === null
                          ? '미지정'
                          : (data.paymentMethods.find((p) => p.id === tx.paymentMethodId)?.name ??
                            '알 수 없는 결제수단')}
                      </td>
                      <td className="owner-cell">
                        <span className={`owner-badge ${tx.ownerId}`}>{ownerName(tx.ownerId)}</span>
                      </td>
                      <td className={`money-cell ${tx.type}`}>
                        <strong>
                          {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
                          {won(tx.amount)}
                        </strong>
                        <small>{labels[tx.type]}</small>
                      </td>
                      <td className="action-cell">
                        {indirect ? (
                          <button
                            className="row-action"
                            aria-label={`${tx.description} 원본 가계부 열기`}
                            onClick={() => onNavigate(tx.ledgerId)}
                          >
                            원본
                            <ArrowUpRight size={14} />
                          </button>
                        ) : (
                          <button
                            className="row-action"
                            aria-label={`${tx.description} 수정`}
                            onClick={() => onEdit(tx)}
                          >
                            수정
                            <ChevronRight size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <Empty illustration={entries.length ? 'search' : 'empty'}>
              {entries.length
                ? '조건에 맞는 내역이 없어요. 검색어나 필터를 바꿔보세요.'
                : '아직 내역이 없어요. 첫 기록을 남겨보세요.'}
            </Empty>
          )}
          <div className="table-summary">
            <span>현재 목록 기준</span>
            <span>
              수입 <b>{won(filteredSum.income)}원</b>
              <i />
              지출 <b>{won(filteredSum.expense)}원</b>
            </span>
          </div>
        </section>
        <div className="overview-grid">
          <aside className="brand-welcome" aria-label="우가의 한마디">
            <UgaIllustration name="card-header" size={132} />
            <div>
              <strong>오늘도 우가우가!</strong>
              <p>작은 기록이 큰 변화를 만들어요.</p>
            </div>
          </aside>
          {ledger.id !== ALL_LEDGERS_ID && (
            <section className="panel budget-panel">
              <div className="panel-title">
                <h2>예산 현황</h2>
                <span className="pill">
                  {period === 'month'
                    ? `${Number(month.slice(5))}월`
                    : period === 'year'
                      ? `${month.slice(0, 4)}년`
                      : '설정 기간'}
                </span>
              </div>
              <div className="budget-summary">
                <div>
                  <span className="muted small">예산 대비 지출</span>
                  <strong>
                    {budget ? percent : '—'}
                    <small>{budget ? '%' : ''}</small>
                  </strong>
                </div>
                <span className={`budget-message ${remaining < 0 ? 'over' : ''}`}>
                  {!budgetState.hasBudget
                    ? '예산이 설정되지 않았어요'
                    : remaining < 0
                      ? `${won(-remaining)}원 초과했어요`
                      : `${won(remaining)}원 더 사용할 수 있어요`}
                </span>
              </div>
              <div className="progress-track">
                <div style={{ width: `${Math.min(percent, 100)}%` }} />
              </div>
              <div className="progress-labels">
                <span>사용 {won(budgetExpense)}원</span>
                <span>예산 {won(budget)}원</span>
              </div>
              {includeDescendants ? (
                <div className="linked-ledgers">
                  {data.ledgers
                    .filter(
                      (l) =>
                        l.id !== ledger.id &&
                        (ledger.id === ALL_LEDGERS_ID ||
                          ledgerDescendantIds(data.ledgers, ledger.id).has(l.id)),
                    )
                    .map((l) => (
                      <button key={l.id} onClick={() => onNavigate(l.id)}>
                        <UgaLedgerIcon value={l.icon} size={24} />
                        <span>{l.name}</span>
                        <span className="muted">연결됨</span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  {!data.ledgers.some((l) => l.parentId === ledger.id) && (
                    <p className="small muted">하위 가계부를 추가하면 이곳에 함께 보여요.</p>
                  )}
                </div>
              ) : (
                <div className="budget-note">
                  <Sparkles size={16} />
                  <span>이 예산은 가계부의 소비 기준이에요. 자산과 독립적으로 관리돼요.</span>
                </div>
              )}
            </section>
          )}
          <section className="panel categories-panel">
            <div className="panel-title">
              <h2>많이 쓴 곳</h2>
              <span className="muted small">조회 기간 지출</span>
            </div>
            <label className="ledger-category-select small muted">
              요약할 태그 유형
              <SelectField
                aria-label="요약할 태그 유형"
                value={categoryGroup?.id ?? ''}
                onValueChange={(value) => setSummaryGroupId(value)}
              >
                {summaryGroups.map((g) => (
                  <SelectOption key={g.id} value={g.id}>
                    {g.name}
                  </SelectOption>
                ))}
              </SelectField>
            </label>
            <CategoryBars groups={groups} total={sum.expense} />
            {categoryGroup?.selectionMode === 'multiple' && (
              <p className="small muted">한 내역에 여러 옵션이 있으면 각 옵션에 포함돼요.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function CategoryBars({
  groups,
  total,
}: {
  groups: ReturnType<typeof tagGroupBreakdown>;
  total: number;
}) {
  return groups.length ? (
    <div className="category-bars">
      {groups.slice(0, 5).map(({ tagId, name, color, amount }, index) => (
        <div className="category-bar" key={`${index}-${name}`}>
          <div>
            <span>
              <i style={{ background: colors[index % colors.length] }} />
              {tagId ? <TagBadge name={name} color={color} /> : name}
            </span>
            <strong>
              {won(amount)}
              <small>원</small>
            </strong>
          </div>
          <div className="mini-track">
            <span
              style={{
                width: `${total ? (amount / total) * 100 : 0}%`,
                background: colors[index % colors.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty>지출을 기록하면 흐름이 보여요.</Empty>
  );
}
