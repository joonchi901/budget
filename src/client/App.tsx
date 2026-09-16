import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  CalendarDays,
  Database,
  Home,
  Link2,
  LogOut,
  Menu,
  Plus,
  Search,
  Sparkles,
  Tags,
  Wallet,
  WifiOff,
} from 'lucide-react';
import type { Bootstrap, Ledger, Transaction, TransactionType } from '../shared/types';
import { categoryNames, tagGroupBreakdown, totals, visibleTransactions } from '../shared/selectors';
import { request, useBudget } from './api';
import { Dialog, Empty, Stat, fieldName, labels, ownerName, won } from './components';
import TransactionForm from './TransactionForm';
import LedgerForm from './LedgerForm';
import AssetsView from './AssetsView';
import TagManager from './TagManager';
import PaymentsView from './PaymentsView';
import PlanningView from './PlanningView';
import AnalyticsView from './AnalyticsView';
import { accountingPeriod, budgetSummary } from '../shared/planning';
import DataView from './DataView';
import { transactionForLedger } from '../shared/classification';
const ExcelImportView = lazy(() => import('./ExcelImportView'));

type Page = 'ledger' | 'assets' | 'payments' | 'analytics' | 'tags' | 'planning' | 'data';
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const colors = ['#3182f6', '#64a8ff', '#20c997', '#9270e8', '#ffb331', '#f66570'];
const navigation = [
  { id: 'ledger', label: '가계부', icon: Home },
  { id: 'assets', label: '자산', icon: Wallet },
  { id: 'payments', label: '카드 · 통장', icon: CreditCard },
  { id: 'analytics', label: '통계', icon: BarChart3 },
  { id: 'planning', label: '계획 · 일정', icon: CalendarDays },
  { id: 'tags', label: '태그 설정', icon: Tags },
  { id: 'data', label: '데이터 관리', icon: Database },
] as const;

export default function App() {
  const [ledgerId, setLedgerId] = useState('main');
  const [page, setPage] = useState<Page>('ledger');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const state = useBudget(ledgerId);
  const [edit, setEdit] = useState<{ original?: Transaction } | null>(null);
  const [newLedger, setNewLedger] = useState(false);
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
  const [linkBusy, setLinkBusy] = useState(false);
  const data = state.data;
  const ledger = data?.ledgers.find((l) => l.id === ledgerId) ?? data?.ledgers[0];
  const entries = useMemo(
    () => (data ? visibleTransactions(data, ledgerId, month) : []),
    [data, ledgerId, month],
  );
  function notice(message: string) {
    setToast(message);
  }
  function navigate(id: string) {
    state.presence(null, null);
    setLedgerId(id);
    setPage('ledger');
    setActionError('');
    setMobileMenu(false);
  }
  function changePage(next: Page) {
    setPage(next);
    setMobileMenu(false);
    state.presence(null, null);
    window.scrollTo({ top: 0, behavior: 'instant' });
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
  async function toggleLink() {
    if (!ledger) return;
    setLinkBusy(true);
    setActionError('');
    try {
      await request(`/api/ledgers/${ledger.id}`, 'PATCH', {
        mutationId: crypto.randomUUID(),
        expectedVersion: ledger.version,
        parentId: ledger.parentId ? null : 'main',
      });
      await state.refresh();
      notice(ledger.parentId ? '메인 가계부 연결을 해제했어요.' : '메인 가계부에 연결했어요.');
    } catch (e) {
      setActionError((e as Error).message);
      await state.refresh();
    } finally {
      setLinkBusy(false);
    }
  }
  const closeEdit = () => {
    setEdit(null);
    state.presence(null, null);
  };
  if (state.loading)
    return (
      <div className="loading">
        <div className="brand-mark">
          <BookOpen size={24} />
        </div>
        <p>우리의 기록을 불러오고 있어요…</p>
      </div>
    );
  if (!data || !ledger)
    return (
      <div className="login-page">
        <div className="login-art">
          <span className="eyebrow">OUR DAYS, TOGETHER</span>
          <h1>
            오늘의 기록이
            <br />
            우리의 내일로.
          </h1>
          <p>
            함께 쓰고, 함께 살펴보는
            <br />
            우리 둘의 가계부.
          </p>
          <div className="art-ledger">
            <div className="art-emoji">🌿</div>
            <span>작은 기록, 차곡차곡</span>
            <div className="art-line" />
            <div className="art-line short" />
          </div>
          <span className="art-bottom">둘이서 만들어가는 좋은 습관</span>
        </div>
        <main className="login-content">
          <div className="brand">
            <div className="brand-mark">
              <BookOpen size={22} />
            </div>
            <strong>우리의 가계부</strong>
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
                <span className="avatar purple">나</span>
                <span>
                  <strong>나로 시작하기</strong>
                  <small>예시 사용자 1</small>
                </span>
                <ArrowUpRight size={19} />
              </button>
              <button disabled={loginBusy} onClick={() => void login('u2')}>
                <span className="avatar pink">와</span>
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
    ledger: ledger.name,
    assets: '우리의 자산',
    payments: '카드와 통장',
    analytics: '기록으로 보는 우리',
    tags: '우리만의 태그',
    planning: '계획과 일정',
    data: '데이터 관리',
  }[page];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">본문으로 바로가기</a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('main');
          }}
        >
          <div className="brand-mark">
            <BookOpen size={22} />
          </div>
          <strong>우리의 가계부</strong>
        </a>
        <div className="household">
          <div className="household-icon">
            <Wallet size={21} />
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
              className={page === item.id ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => changePage(item.id)}
            >
              <item.icon size={19} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ledger-nav">
          <div className="nav-section-title">
            <span>내 가계부</span>
            <button
              className="icon-button"
              aria-label="목적 가계부 추가"
              onClick={() => setNewLedger(true)}
            >
              <Plus size={17} />
            </button>
          </div>
          {data.ledgers.map((item) => (
            <button
              key={item.id}
              title={item.name}
              className={ledgerId === item.id && page === 'ledger' ? 'active' : ''}
              onClick={() => navigate(item.id)}
            >
              <span>{item.icon}</span>
              <span className="truncate">
                {item.name}
                {item.archived ? ' (보관)' : ''}
              </span>
              {item.parentId && <Link2 size={13} />}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button className="help-button" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            기록 가이드
          </button>
          <div className="profile">
            <span className="avatar small" style={{ background: data.user.color }}>
              {data.user.name.slice(0, 1)}
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
            우리 집 <ChevronRight size={13} />
            <span>{page === 'ledger' ? '가계부' : pageTitle}</span>
          </div>
          <div className="collaboration">
            <div className="avatar-group">
              <span
                className="avatar tiny"
                title={`${data.user.name} (나)`}
                style={{ background: data.user.color }}
              >
                {data.user.name.slice(0, 1)}
              </span>
              {state.peers.map((peer, index) => (
                <span
                  key={`${peer.userId}-${index}`}
                  className="avatar tiny"
                  title={`${peer.name} · ${data.ledgers.find((l) => l.id === peer.ledgerId)?.name ?? '가계부'}`}
                  style={{ background: peer.color }}
                >
                  {peer.name.slice(0, 1)}
                </span>
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
        <main className={`main-content page-${page}`} id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <h1>
                {page === 'ledger' && <span className="heading-emoji">{ledger.icon}</span>}
                {pageTitle}
              </h1>
              <p>
                {page === 'ledger'
                  ? ledger.kind === 'main'
                    ? '함께 기록하고, 한눈에 확인해요.'
                    : '이 가계부의 기록과 예산을 독립적으로 관리해요.'
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
            <div className="heading-actions">
              {page !== 'tags' && page !== 'data' && (
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
                    <input
                      aria-label="조회 월"
                      type="month"
                      value={month}
                      onChange={(e) => {
                        if (e.target.value) setMonth(e.target.value);
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
              {page === 'ledger' && (
                <button className="secondary" onClick={() => setSettingsLedger(ledger)}>
                  가계부 설정
                </button>
              )}
              {page === 'ledger' && (
                <button
                  className="primary"
                  onClick={() => {
                    setEdit({});
                    state.presence(null, '새 내역');
                  }}
                >
                  <Plus size={17} />
                  내역 추가
                </button>
              )}
            </div>
          </div>
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
          {page === 'ledger' && (
            <LedgerView
              data={data}
              ledger={ledger}
              entries={entries}
              month={month}
              peers={state.peers}
              onEdit={(tx) => {
                setEdit({ original: tx });
                state.presence(tx.id, null);
              }}
              onNavigate={navigate}
              onLink={() => void toggleLink()}
              linkBusy={linkBusy}
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
                  <ExcelImportView data={data} onChanged={state.refresh} onNotice={notice} />
                </Suspense>
              }
            />
          )}
          {page === 'analytics' && (
            <AnalyticsView
              data={data}
              ledgerId={ledgerId}
              setLedgerId={setLedgerId}
              month={month}
              onEdit={(tx) => {
                navigate(tx.ledgerId);
                setEdit({ original: tx });
                state.presence(tx.id, null);
              }}
            />
          )}
          <footer className="page-footer">
            <span>우리의 가계부</span>
            <span>{data.mode === 'demo' ? '로컬 미리보기 · 가상 데이터' : '우리 둘만의 기록'}</span>
          </footer>
        </main>
      </div>
      <nav
        className="mobile-navigation"
        aria-label="모바일 주 메뉴"
        aria-hidden={mobileMenu || undefined}
      >
        {navigation.slice(0, 4).map((item) => (
          <button
            key={item.id}
            className={page === item.id ? 'active' : ''}
            aria-current={page === item.id ? 'page' : undefined}
            onClick={() => changePage(item.id)}
          >
            <item.icon size={22} />
            <span>{item.label}</span>
          </button>
        ))}
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
                  <item.icon size={24} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            <div className="section-heading">
              <h3>내 가계부</h3>
              <button
                className="text-button"
                onClick={() => {
                  setMobileMenu(false);
                  setNewLedger(true);
                }}
              >
                <Plus size={16} />
                목적 가계부 추가
              </button>
            </div>
            <div className="mobile-ledger-list">
              {data.ledgers.map((item) => (
                <button key={item.id} onClick={() => navigate(item.id)}>
                  <span>{item.icon}</span>
                  <strong>
                    {item.name}
                    {item.archived ? ' (보관)' : ''}
                  </strong>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
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
      {edit && (
        <TransactionForm
          key={`${data.householdId ?? data.mode}:${data.user.id}:${ledgerId}:${edit.original?.id ?? 'new'}`}
          data={data}
          ledgerId={ledgerId}
          month={month}
          original={edit.original}
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
      {settingsLedger && (
        <LedgerForm
          data={data}
          original={settingsLedger}
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
          onClose={() => setNewLedger(false)}
          onSaved={(id) => {
            setNewLedger(false);
            void state.refresh().then(() => navigate(id));
            notice('새 가계부를 만들었어요.');
          }}
        />
      )}
      {help && (
        <Dialog title="함께 쓰는 기록 가이드" onClose={() => setHelp(false)}>
          <div className="form-body guide">
            <h3>기록은 한 번, 조회는 함께</h3>
            <p>
              목적 가계부를 메인에 연결하면 기록이 함께 보여요. 수정은 기록을 작성한 원본 가계부에서
              해요.
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
  onLink,
  linkBusy,
}: {
  data: Bootstrap;
  ledger: Ledger;
  entries: Transaction[];
  month: string;
  peers: ReturnType<typeof useBudget>['peers'];
  onEdit(tx: Transaction): void;
  onNavigate(id: string): void;
  onLink(): void;
  linkBusy: boolean;
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [summaryGroupId, setSummaryGroupId] = useState('');
  const [sourceScope, setSourceScope] = useState('all');
  const sum = totals(entries);
  const budgetState = budgetSummary(data, ledger.id, month);
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
        .map((row) => [row.name, row.amount] as [string, number])
    : [];
  const filtered = entries
    .filter(
      (tx) =>
        (ledger.kind !== 'main' || sourceScope === 'all' || tx.ledgerId === sourceScope) &&
        (type === 'all' || tx.type === type) &&
        `${tx.description} ${categoryNames(data, tx).join(' ')} ${tx.tagIds.map((id) => data.tags.find((t) => t.id === id)?.name).join(' ')}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      {ledger.kind === 'purpose' && (
        <div className="purpose-info">
          <div>
            <span className={`badge ${ledger.parentId ? 'green' : ''}`}>
              <Link2 size={12} />
              {ledger.parentId ? '메인에 연결됨' : '독립 가계부'}
            </span>
            <span>
              {ledger.startDate ?? '시작일 없음'} — {ledger.endDate ?? '종료일 없음'}
            </span>
          </div>
          <button className="text-button" disabled={linkBusy} onClick={onLink}>
            {linkBusy ? '변경 중…' : ledger.parentId ? '메인 연결 해제' : '메인에 연결'}
          </button>
        </div>
      )}
      <p className="ledger-period small muted">
        집계 기간 {accountingPeriod(month, ledger.periodStartDay ?? 1).startDate} ~{' '}
        {accountingPeriod(month, ledger.periodStartDay ?? 1).endDate}
      </p>
      <section className="stats-grid" aria-label="월 요약">
        <Stat
          label="이번 달 지출"
          amount={sum.expense}
          hint={ledger.kind === 'main' ? '연결된 가계부 포함' : '이 가계부의 월 지출'}
          accent
        />
        <Stat label="이번 달 수입" amount={sum.income} hint={`${monthLabel(month)} 기록 기준`} />
        <Stat
          label="수입 − 지출"
          amount={sum.income - sum.expense}
          hint="자산 이동·잔액 조정은 포함하지 않아요"
        />
        <Stat
          label="남은 예산"
          amount={remaining}
          hint={`예산 ${won(budget)}원 · ${budgetState.periodStart === '0001-01-01' && budgetState.periodEnd === '9999-12-31' ? '전체 기간' : `${budgetState.periodStart ?? '전체'} ~ ${budgetState.periodEnd ?? '전체'}`}`}
        />
      </section>
      <div className="ledger-body-grid">
        <section className="panel transactions-panel">
          <div className="transactions-heading">
            <div>
              <h2>
                거래 내역 <span className="count">{filtered.length}</span>
              </h2>
              <p>
                {ledger.kind === 'main'
                  ? '연결된 목적 가계부의 내역도 함께 보여요.'
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
            </label>
          </div>
          {ledger.kind === 'main' && (
            <label className="ledger-scope-select small muted">
              거래 목록의 가계부 범위
              <select
                aria-label="거래 목록의 가계부 범위"
                value={sourceScope}
                onChange={(e) => setSourceScope(e.target.value)}
              >
                <option value="all">메인과 연결된 가계부 전체</option>
                <option value={ledger.id}>메인에 직접 기록한 내역</option>
                {data.ledgers
                  .filter((l) => l.parentId === ledger.id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
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
          <div className="table-scroll">
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
                              {source?.icon} {source?.name}
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
                        <span className="category-name">
                          {categoryNames(data, tx).join(' · ') || '미분류'}
                        </span>
                        <div className="row-tags">
                          {tx.tagIds.map((id) => {
                            const tag = data.tags.find((t) => t.id === id);
                            return (
                              tag &&
                              data.tagGroups.find((g) => g.id === tag.groupId)?.role !==
                                'category' && (
                                <span
                                  key={id}
                                  title={data.tagGroups.find((g) => g.id === tag.groupId)?.name}
                                >
                                  #{tag.name}
                                </span>
                              )
                            );
                          })}
                        </div>
                      </td>
                      <td className="payment-cell">
                        {data.paymentMethods.find((p) => p.id === tx.paymentMethodId)?.name}
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
            <Empty>
              {entries.length
                ? '조건에 맞는 내역이 없어요. 검색어나 필터를 바꿔보세요.'
                : '아직 내역이 없어요. 첫 기록을 남겨보세요.'}
            </Empty>
          )}
          <div className="table-summary">
            <span>현재 목록 기준</span>
            <span>
              수입 <b>{won(totals(filtered).income)}원</b>
              <i />
              지출 <b>{won(totals(filtered).expense)}원</b>
            </span>
          </div>
        </section>
        <div className="overview-grid">
          <section className="panel budget-panel">
            <div className="panel-title">
              <h2>{ledger.kind === 'main' ? '예산 현황' : '목적 가계부 예산'}</h2>
              <span className="pill">
                {ledger.kind === 'main' ? `${Number(month.slice(5))}월` : '전체 기간'}
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
                {budget === 0
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
            {ledger.kind === 'main' ? (
              <div className="linked-ledgers">
                {data.ledgers
                  .filter((l) => l.parentId === ledger.id)
                  .map((l) => (
                    <button key={l.id} onClick={() => onNavigate(l.id)}>
                      <span>{l.icon}</span>
                      <span>{l.name}</span>
                      <span className="muted">연결됨</span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                {!data.ledgers.some((l) => l.parentId === ledger.id) && (
                  <p className="small muted">목적 가계부를 연결하면 이곳에 함께 보여요.</p>
                )}
              </div>
            ) : (
              <div className="budget-note">
                <Sparkles size={16} />
                <span>이 예산은 가계부의 소비 기준이에요. 자산과 독립적으로 관리돼요.</span>
              </div>
            )}
          </section>
          <section className="panel categories-panel">
            <div className="panel-title">
              <h2>많이 쓴 곳</h2>
              <span className="muted small">이번 달 지출</span>
            </div>
            <label className="ledger-category-select small muted">
              요약할 태그 유형
              <select
                aria-label="요약할 태그 유형"
                value={categoryGroup?.id ?? ''}
                onChange={(e) => setSummaryGroupId(e.target.value)}
              >
                {summaryGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
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

function CategoryBars({ groups, total }: { groups: [string, number][]; total: number }) {
  return groups.length ? (
    <div className="category-bars">
      {groups.slice(0, 5).map(([name, amount], index) => (
        <div className="category-bar" key={`${index}-${name}`}>
          <div>
            <span>
              <i style={{ background: colors[index % colors.length] }} />
              {name}
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
