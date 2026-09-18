import SessionScreen from './SessionScreen';
import LedgerView from './LedgerView';
import {
  ALL_LEDGERS_ID,
  ledgerAncestors,
  ledgerPath,
  sortedLedgerChildren,
} from '../shared/hierarchy';
import { isRoomPage, type AppPage } from '../shared/app-route';
import { useAppRoute } from './useAppRoute';
import LedgerRooms from './LedgerRooms';
import RoomHeader from './RoomHeader';
import { Button, Field, FormBody, FormFooter, Grid, Toolbar } from './ui';
import LedgerTree from './LedgerTree';
import HierarchyDialog, { type MoveIntent } from './HierarchyDialog';
import MemberRoles from './MemberRoles';
import LedgerCalendar from './LedgerCalendar';
import './hierarchy.css';
import { Tooltip } from './Tooltip';
import { UgaAvatar, UgaIcon, UgaLedgerIcon, UgaLogo, UgaMascot } from './brand/Uga';
import { SelectField, SelectOption } from './SelectField';
import { MonthField } from './DateFields';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LogOut,
  Menu,
  Plus,
  WifiOff,
} from 'lucide-react';
import type { Ledger, Transaction } from '../shared/types';
import { visibleTransactions } from '../shared/selectors';
import { request, useBudget } from './api';
import { Dialog } from './components';
import TransactionForm from './TransactionForm';
import LedgerForm from './LedgerForm';
import AssetsView from './AssetsView';
import TagManager from './TagManager';

import PaymentsView from './PaymentsView';
import PlanningView from './PlanningView';
import AnalyticsView from './AnalyticsView';

import DataView from './DataView';

const ExcelImportView = lazy(() => import('./ExcelImportView'));

type Page = AppPage;
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
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
  if (state.loading || !data || !ledger)
    return (
      <SessionScreen
        loading={state.loading}
        demoEnabled={config.demoEnabled}
        oidcEnabled={config.oidcEnabled}
        error={actionError || state.error || ''}
        busy={loginBusy}
        onDemoLogin={(id) => void login(id)}
      />
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
            <Button
              variant="plain"
              key={item.id}
              className={page === item.id || (item.id === 'rooms' && inRoom) ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => changePage(item.id)}
            >
              <UgaIcon name={item.icon} size={24} />
              {item.label}
            </Button>
          ))}
        </nav>
        <div className="ledger-nav">
          <div className="nav-section-title">
            <span>내 가계부</span>
            {admin && (
              <Button
                variant="plain"
                className="icon-button"
                aria-label="가계부 추가"
                onClick={() => openNewLedger()}
              >
                <Plus size={17} />
              </Button>
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
            <Button variant="plain" className="help-button" onClick={() => setMemberRoles(true)}>
              구성원 권한
            </Button>
          )}
          <Button variant="plain" className="help-button" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            기록 가이드
          </Button>
          <div className="profile">
            <span className="avatar small" style={{ background: data.user.color }}>
              <UgaAvatar mood={data.user.id === 'u1' ? 'happy' : 'calm'} size={36} />
            </span>
            <div>
              <strong>{data.user.name}</strong>
              <span>{data.mode === 'demo' ? '로컬 예시 계정' : '공동 가계부 계정'}</span>
            </div>
            <Button
              variant="plain"
              className="icon-button"
              aria-label="로그아웃"
              onClick={() => {
                void state.logout().catch((e) => setActionError(e.message));
              }}
            >
              <LogOut size={17} />
            </Button>
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
          <RoomHeader
            name={ledger.name}
            path={ledgerPath(data.ledgers, ledger.id) || ledger.name}
            parentPath={ledgerAncestors(data.ledgers, ledger.id)
              .map((item) => item.name)
              .join(' / ')}
            icon={ledger.icon}
            archived={ledger.archived}
            aggregate={isOverall}
            view={
              page === 'analytics' ? 'analytics' : page === 'planning' ? 'planning' : ledgerView
            }
            onBack={() => changePage('rooms')}
            onMenu={() => setMobileMenu(true)}
            onSettings={isOverall ? undefined : () => setSettingsLedger(ledger)}
            onViewChange={(view) => {
              if (view === 'list' || view === 'calendar') changeLedgerView(view);
              else changePage(view);
            }}
          />
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
                <Button variant="primary" onClick={() => openNewLedger()}>
                  <Plus size={17} />새 가계부
                </Button>
              )}
              {page !== 'rooms' && page !== 'tags' && page !== 'data' && (
                <div className="month-picker">
                  <Button
                    variant="plain"
                    className="icon-button"
                    aria-label="이전 달"
                    onClick={() => setMonth(shiftMonth(month, -1))}
                  >
                    <ChevronLeft size={17} />
                  </Button>
                  <Field>
                    <span className="sr-only">조회 월</span>
                    <MonthField
                      aria-label="조회 월"
                      required
                      value={month}
                      onValueChange={(value) => {
                        if (value) setMonth(value);
                      }}
                    />
                  </Field>
                  <Button
                    variant="plain"
                    className="icon-button"
                    aria-label="다음 달"
                    onClick={() => setMonth(shiftMonth(month, 1))}
                  >
                    <ChevronRight size={17} />
                  </Button>
                </div>
              )}
              {inRoom && !isOverall && (
                <Button variant="secondary" onClick={() => setSettingsLedger(ledger)}>
                  가계부 설정
                </Button>
              )}
              {inRoom && !isOverall && (
                <Button
                  variant="primary"

                  disabled={ledger.archived}
                  onClick={() => {
                    setEdit({ ledgerId });
                    state.presence(null, '새 내역');
                  }}
                >
                  <Plus size={17} />
                  내역 추가
                </Button>
              )}
            </div>
          </div>
          {inRoom && !isOverall && (children.length > 0 || admin) && (
            <details className="room-child-ledgers" key={`children:${ledger.id}`}>
              <summary>
                하위 가계부 <span>{children.length}개</span>
                <ChevronRight size={16} />
              </summary>
              <Grid className="room-child-list" columns={3} mobileColumns={2} gap={2}>
                {children.map((child) => (
                  <Button variant="plain" key={child.id} onClick={() => navigate(child.id)}>
                    <UgaLedgerIcon value={child.icon} size={24} />
                    <span>
                      {child.name}
                      {child.archived && <small>보관됨</small>}
                    </span>
                    <ChevronRight size={16} />
                  </Button>
                ))}
                {admin && !ledger.archived && (
                  <Button
                    variant="plain"
                    className="room-child-create"
                    onClick={() => openNewLedger(ledger.id)}
                  >
                    <Plus size={18} />
                    <span>하위 가계부 추가</span>
                  </Button>
                )}
              </Grid>
            </details>
          )}
          {page === 'ledger' && (
            <>
              <div className="ledger-context-toolbar">
                <nav className="ledger-breadcrumbs" aria-label="가계부 경로">
                  <Button variant="plain" onClick={() => navigate(ALL_LEDGERS_ID)}>
                    전체 가계부
                  </Button>
                  {!isOverall &&
                    [...ledgerAncestors(data.ledgers, ledger.id), ledger].map((item) => (
                      <span key={item.id}>
                        <ChevronRight size={12} />
                        <Button
                          variant="plain"
                          onClick={() => navigate(item.id)}
                          aria-current={item.id === ledger.id ? 'page' : undefined}
                        >
                          {item.name}
                        </Button>
                      </span>
                    ))}
                </nav>
                <div className="ledger-view-controls">
                  <Field>
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
                  </Field>
                  {!isOverall && (
                    <Field>
                      조회 대상
                      <SelectField
                        value={includeDescendants ? 'descendants' : 'self'}
                        onValueChange={(value) => setIncludeDescendants(value === 'descendants')}
                      >
                        <SelectOption value="descendants">하위 가계부 포함</SelectOption>
                        <SelectOption value="self">이 가계부만</SelectOption>
                      </SelectField>
                    </Field>
                  )}
                </div>
              </div>
              {isOverall && (
                <div className="overall-ledger-notice">
                  <span>기록을 추가할 원본 가계부를 먼저 선택하세요.</span>
                  <Field>
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
                  </Field>
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
              <Button
                variant="plain"
                type="button"
                onClick={() => {
                  setActionError('');
                  void state.refresh();
                }}
              >
                새로고침
              </Button>
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
              excelImport={({ onPendingChange }) => (
                <Suspense fallback={<p className="muted">엑셀 가져오기 준비 중…</p>}>
                  <ExcelImportView
                    data={data}
                    onChanged={state.refresh}
                    onNotice={notice}
                    onPendingChange={onPendingChange}
                    onOpenLedger={(id) => {
                      navigate(id, 'list');
                      setPeriod('period');
                    }}
                  />
                </Suspense>
              )}
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
            <Button variant="plain" onClick={() => changePage('rooms')}>
              <ChevronLeft size={22} />
              <span>가계부 목록</span>
            </Button>
            {!isOverall && (
              <Button
                variant="plain"
                className="room-add-entry"
                disabled={ledger.archived}
                onClick={() => {
                  setEdit({ ledgerId });
                  state.presence(null, '새 내역');
                }}
              >
                <Plus size={22} />
                <span>내역 추가</span>
              </Button>
            )}
          </>
        ) : (
          navigation.slice(0, 4).map((item) => (
            <Button
              variant="plain"
              key={item.id}
              className={page === item.id ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => changePage(item.id)}
            >
              <UgaIcon name={item.icon} size={24} />
              <span>{item.label}</span>
            </Button>
          ))
        )}
        <Button variant="plain" onClick={() => setMobileMenu(true)} aria-expanded={mobileMenu}>
          <Menu size={22} />
          <span>더보기</span>
        </Button>
      </nav>
      {mobileMenu && (
        <Dialog title="전체 메뉴" onClose={() => setMobileMenu(false)}>
          <FormBody className="mobile-menu-content">
            <div className="mobile-menu-grid">
              {navigation.map((item) => (
                <Button variant="plain" key={item.id} onClick={() => changePage(item.id)}>
                  <UgaIcon name={item.icon} size={28} />
                  <span>{item.label}</span>
                </Button>
              ))}
            </div>
            <Toolbar>
              <h3>내 가계부</h3>
              {admin && (
                <Button
                  variant="text"

                  onClick={() => {
                    setMobileMenu(false);
                    openNewLedger();
                  }}
                >
                  <Plus size={16} />
                  가계부 추가
                </Button>
              )}
            </Toolbar>
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
              <Button
                variant="plain"
                className="help-button"
                onClick={() => {
                  setMobileMenu(false);
                  setMemberRoles(true);
                }}
              >
                구성원 권한
              </Button>
            )}
            <Button
              variant="plain"
              className="help-button"
              onClick={() => {
                setMobileMenu(false);
                setHelp(true);
              }}
            >
              <CircleHelp size={18} />
              기록 가이드
            </Button>
            <Button
              variant="plain"
              className="help-button"
              onClick={() => {
                setMobileMenu(false);
                void state.logout().catch((e) => setActionError(e.message));
              }}
            >
              <LogOut size={18} />
              로그아웃
            </Button>
          </FormBody>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <Button variant="plain" aria-label="알림 닫기" onClick={() => setToast('')}>
            ×
          </Button>
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
          <FormBody>
            <Field>
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
            </Field>
            {!data.ledgers.some((item) => !item.archived) && (
              <p className="small muted">관리자가 기록할 가계부를 먼저 만들어 주세요.</p>
            )}
          </FormBody>
          <FormFooter>
            <span />
            <Button
              variant="primary"

              disabled={!data.ledgers.some((item) => item.id === calendarTarget && !item.archived)}
              onClick={() => {
                const date = calendarAddDate;
                navigate(calendarTarget);
                setCalendarAddDate(null);
                setEdit({ ledgerId: calendarTarget, initialDate: date });
              }}
            >
              이 가계부에 기록
            </Button>
          </FormFooter>
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
          <FormBody className="guide">
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
          </FormBody>
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
