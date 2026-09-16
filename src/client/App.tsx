import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Home,
  Link2,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Wallet,
  WifiOff,
} from 'lucide-react';
import type { Bootstrap, Ledger, Transaction, TransactionType } from '../shared/types';
import { cardStatement, totals, visibleTransactions } from '../shared/selectors';
import { request, useBudget } from './api';
import { Dialog, Empty, Stat, fieldName, labels, ownerName, won } from './components';
import TransactionForm from './TransactionForm';
import LedgerForm from './LedgerForm';

type Page = 'ledger' | 'assets' | 'payments' | 'analytics';
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const colors = ['#31725f', '#97b5a4', '#cfac6c', '#839bb7', '#b2a5c4', '#c58d7e'];

export default function App() {
  const [ledgerId, setLedgerId] = useState('main');
  const [page, setPage] = useState<Page>('ledger');
  const [month, setMonth] = useState(currentMonth);
  const state = useBudget(ledgerId);
  const [edit, setEdit] = useState<{ original?: Transaction } | null>(null);
  const [newLedger, setNewLedger] = useState(false);
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
          <span className="demo-chip">로컬 미리보기</span>
          <h2>반가워요.</h2>
          <p>
            예시 데이터로 가계부를 둘러보세요.
            <br />각 창에서 다른 사용자를 선택하면 공동 편집을 확인할 수 있어요.
          </p>
          {(actionError || state.error) && (
            <div className="alert error" role="alert">
              {actionError || state.error}
            </div>
          )}
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
          <p className="login-note">
            실제 계정 로그인은 준비 중이에요.
            <br />이 미리보기에는 가상의 내역만 들어 있어요.
          </p>
        </main>
      </div>
    );
  const pageTitle = {
    ledger: ledger.name,
    assets: '우리의 자산',
    payments: '카드와 통장',
    analytics: '기록으로 보는 우리',
  }[page];
  return (
    <div className="app-shell">
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
          <strong>
            우리의 가계부<span>OUR LITTLE LEDGER</span>
          </strong>
        </a>
        <div className="household">
          <div className="household-icon">🌿</div>
          <div>
            <strong>우리 집</strong>
            <span>함께 기록하는 공간</span>
          </div>
          <span className="household-count">2</span>
        </div>
        <nav className="main-nav" aria-label="주 메뉴">
          {(
            [
              { id: 'ledger', label: '가계부', icon: Home },
              { id: 'assets', label: '자산', icon: Wallet },
              { id: 'payments', label: '카드 · 통장', icon: CreditCard },
              { id: 'analytics', label: '통계', icon: BarChart3 },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => {
                setPage(item.id);
                state.presence(null, null);
              }}
            >
              <item.icon size={19} />
              {item.label}
              {page === item.id && <span className="nav-dot" />}
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
              <span className="truncate">{item.name}</span>
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
              <span>로컬 예시 계정</span>
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
            <span className="demo-chip">예시 데이터</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === 'ledger'
                  ? ledger.kind === 'main'
                    ? 'EVERYDAY, TOGETHER'
                    : 'A CHAPTER OF OUR DAYS'
                  : 'OUR MONEY, AT A GLANCE'}
              </div>
              <h1>
                {page === 'ledger' && <span className="heading-emoji">{ledger.icon}</span>}
                {pageTitle}
              </h1>
              <p>
                {page === 'ledger'
                  ? ledger.kind === 'main'
                    ? '일상의 기록부터 특별한 순간까지, 한눈에 살펴보세요.'
                    : '이 가계부의 기록과 예산을 독립적으로 관리해요.'
                  : page === 'assets'
                    ? '어디에 얼마가 있는지, 우리의 자산을 함께 살펴보세요.'
                    : page === 'payments'
                      ? '사용 내역과 앞으로 나갈 카드 대금을 확인해요.'
                      : '태그로 기록을 모아, 소비의 흐름을 발견해 보세요.'}
              </p>
            </div>
            <div className="heading-actions">
              {page !== 'assets' && (
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
          {page === 'assets' && <AssetsView data={data} />}
          {page === 'payments' && <PaymentsView data={data} month={month} />}
          {page === 'analytics' && (
            <AnalyticsView
              data={data}
              ledgerId={ledgerId}
              setLedgerId={setLedgerId}
              month={month}
            />
          )}
          <footer className="page-footer">
            <span>작은 기록이 쌓여, 우리의 생활이 보여요.</span>
            <span>로컬 미리보기 · 가상 데이터</span>
          </footer>
        </main>
      </div>
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
        />
      )}
      {newLedger && (
        <LedgerForm
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
              분석 태그로 원하는 내역을 모아보세요. 자산 사용·입금 규칙을 선택한 경우에만 지정한
              자산 금액도 바뀌어요. 저축과 이체는 두 자산 사이의 이동으로 기록해요.
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
            <p className="small muted">
              현재는 예시 계정으로 사용하는 첫 미리보기예요. 직접 저장 버튼으로 저장하며, 실제
              로그인·자동 입력 저장·설정 편집은 후속 개발 범위예요.
            </p>
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
  const sum = totals(entries);
  const lifetime = totals(data.transactions.filter((tx) => tx.ledgerId === ledger.id));
  const budgetExpense = ledger.kind === 'main' ? sum.expense : lifetime.expense;
  const remaining = ledger.budget - budgetExpense;
  const percent = ledger.budget > 0 ? Math.round((budgetExpense / ledger.budget) * 100) : 0;
  const groups = categoryGroups(entries);
  const filtered = entries
    .filter(
      (tx) =>
        (type === 'all' || tx.type === type) &&
        `${tx.description} ${tx.category} ${tx.tagIds.map((id) => data.tags.find((t) => t.id === id)?.name).join(' ')}`
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
      <section className="stats-grid" aria-label="월 요약">
        <Stat label="이번 달 수입" amount={sum.income} hint={`${monthLabel(month)} 기록 기준`} />
        <Stat
          label="이번 달 지출"
          amount={sum.expense}
          hint={ledger.kind === 'main' ? '연결된 가계부 포함' : '이 가계부의 월 지출'}
        />
        <Stat label="이번 달 저축" amount={sum.saving} hint="자산 사이의 저축 이동" />
        <Stat
          label={ledger.kind === 'main' ? '이번 달 남은 예산' : '가계부 전체 남은 예산'}
          amount={remaining}
          hint={`예산 ${won(ledger.budget)}원`}
          accent
        />
      </section>
      <div className="overview-grid">
        <section className="panel budget-panel">
          <div className="panel-title">
            <h2>{ledger.kind === 'main' ? '이번 달, 잘 쓰고 있나요?' : '목적 가계부 예산'}</h2>
            <span className="pill">
              {ledger.kind === 'main' ? `${Number(month.slice(5))}월` : '전체 기간'}
            </span>
          </div>
          <div className="budget-summary">
            <div>
              <span className="muted small">예산 대비 지출</span>
              <strong>
                {ledger.budget ? percent : '—'}
                <small>{ledger.budget ? '%' : ''}</small>
              </strong>
            </div>
            <span className={`budget-message ${remaining < 0 ? 'over' : ''}`}>
              {ledger.budget === 0
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
            <span>예산 {won(ledger.budget)}원</span>
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
            <h2>어디에 썼을까요?</h2>
            <span className="muted small">이번 달 지출</span>
          </div>
          <CategoryBars groups={groups} total={sum.expense} />
        </section>
      </div>
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
                    <td>
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
                    <td>
                      <span className="category-name">{tx.category}</span>
                      <div className="row-tags">
                        {tx.tagIds.map((id) => {
                          const tag = data.tags.find((t) => t.id === id);
                          return tag && <span key={id}>#{tag.name}</span>;
                        })}
                      </div>
                    </td>
                    <td className="payment-cell">
                      {data.paymentMethods.find((p) => p.id === tx.paymentMethodId)?.name}
                    </td>
                    <td>
                      <span className={`owner-badge ${tx.ownerId}`}>{ownerName(tx.ownerId)}</span>
                    </td>
                    <td className={`money-cell ${tx.type}`}>
                      <strong>
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
                        {won(tx.amount)}
                      </strong>
                      <small>{labels[tx.type]}</small>
                    </td>
                    <td>
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
        {!filtered.length && <Empty>아직 내역이 없어요. 첫 기록을 남겨보세요.</Empty>}
        <div className="table-summary">
          <span>현재 목록 기준</span>
          <span>
            수입 <b>{won(totals(filtered).income)}원</b>
            <i />
            지출 <b>{won(totals(filtered).expense)}원</b>
          </span>
        </div>
      </section>
    </>
  );
}

function categoryGroups(entries: Transaction[]) {
  const values = new Map<string, number>();
  for (const tx of entries)
    if (tx.type === 'expense') values.set(tx.category, (values.get(tx.category) ?? 0) + tx.amount);
  return [...values].sort((a, b) => b[1] - a[1]);
}
function CategoryBars({ groups, total }: { groups: [string, number][]; total: number }) {
  return groups.length ? (
    <div className="category-bars">
      {groups.slice(0, 5).map(([name, amount], index) => (
        <div className="category-bar" key={name}>
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

function AssetsView({ data }: { data: Bootstrap }) {
  const assets = data.assets.filter((a) => a.kind === 'asset');
  const debt = data.assets.filter((a) => a.kind === 'liability');
  const total = assets.reduce((s, a) => s + a.balance, 0);
  const liability = debt.reduce((s, a) => s + a.balance, 0);
  return (
    <>
      <div className="asset-hero">
        <div>
          <span className="eyebrow">OUR NET WORTH</span>
          <h2>우리의 순자산</h2>
          <strong>
            {won(total - liability)}
            <small>원</small>
          </strong>
          <p>현재 자산에서 부채를 뺀 금액이에요.</p>
        </div>
        <div className="asset-hero-detail">
          <span>
            전체 자산 <strong>{won(total)}원</strong>
          </span>
          <span>
            전체 부채 <strong>{won(liability)}원</strong>
          </span>
          <div className="asset-stack">
            {assets.map((a) => (
              <span
                key={a.id}
                style={{ width: `${total ? (a.balance / total) * 100 : 0}%`, background: a.color }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="section-heading">
        <h2>자산 항목</h2>
        <span className="muted small">기준 금액 + 연결된 거래 변동</span>
      </div>
      <div className="asset-grid">
        {assets.map((a) => (
          <section className="panel asset-card" key={a.id}>
            <span className="asset-icon" style={{ background: `${a.color}18`, color: a.color }}>
              <Wallet size={21} />
            </span>
            <h3>{a.name}</h3>
            <strong className="asset-balance" data-testid={`asset-${a.id}`}>
              {won(a.balance)}
              <small>원</small>
            </strong>
            <div className="asset-detail">
              <span>기준 금액</span>
              <span>{won(a.openingBalance)}원</span>
            </div>
            <div className="asset-detail">
              <span>거래 변동</span>
              <span className={a.balance - a.openingBalance >= 0 ? 'positive' : ''}>
                {a.balance - a.openingBalance > 0 ? '+' : ''}
                {won(a.balance - a.openingBalance)}원
              </span>
            </div>
          </section>
        ))}
      </div>
      <div className="section-heading">
        <h2>부채</h2>
        <span className="muted small">등록된 기준 금액</span>
      </div>
      <div className="panel liability-list">
        {debt.map((a) => (
          <div key={a.id}>
            <span className="asset-icon">
              <Wallet size={20} />
            </span>
            <div>
              <strong>{a.name}</strong>
              <span>대출 상세·상환 관리는 준비 중이에요</span>
            </div>
            <strong>{won(a.balance)}원</strong>
          </div>
        ))}
      </div>
      <div className="inline-note">
        <CircleHelp size={17} />
        <p>
          예비금·투자금·전세금은 각각의 자산 항목이에요. 가계부 예산과 별개로 관리되며, 선택한 자산
          반영 규칙이 있는 거래만 금액에 반영돼요.
        </p>
      </div>
    </>
  );
}

function PaymentsView({ data, month }: { data: Bootstrap; month: string }) {
  const cards = data.paymentMethods.filter((p) => p.type === 'card');
  return (
    <>
      <div className="inline-note top-note">
        <InfoIcon />
        <p>
          <strong>{monthLabel(month)} 납부 예정 기준</strong>으로 보여요. 카드 사용은 사용일의
          지출로 한 번만 집계돼요.
        </p>
      </div>
      <div className="payment-grid">
        {cards.map((card, index) => {
          const statement = cardStatement(data.transactions, card, month);
          return (
            <section key={card.id} className="panel payment-card">
              <div className={`card-visual card-${index % 2}`}>
                <div>
                  <span>{ownerName(card.ownerId)}의 카드</span>
                  <CreditCard size={24} />
                </div>
                <strong>{card.name}</strong>
                <span className="card-decoration">OUR EVERYDAY</span>
              </div>
              <div className="payment-info">
                <div className="panel-title">
                  <h2>예상 카드 대금</h2>
                  <span className="badge">예상</span>
                </div>
                <strong className="bill-amount">
                  {won(statement.amount)}
                  <small>원</small>
                </strong>
                <div className="asset-detail">
                  <span>예상 납부일</span>
                  <strong>{statement.paymentDate}</strong>
                </div>
                <div className="asset-detail">
                  <span>사용 기간</span>
                  <span>
                    {statement.startDate} ~ {statement.endDate}
                  </span>
                </div>
                <div className="statement-list">
                  {statement.transactions.map((tx) => (
                    <div key={tx.id}>
                      <span>{tx.description}</span>
                      <strong>{won(tx.amount)}원</strong>
                    </div>
                  ))}
                  {!statement.transactions.length && (
                    <p className="muted small">이 청구 기간에 기록한 사용 내역이 없어요.</p>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <p className="small muted statement-note">
        직접 기록한 사용 내역과 설정된 마감일·납부일로 계산한 예상 금액이에요. 할부·취소·이월·휴일
        조정과 금융기관의 실제 청구액은 아직 반영하지 않아요.
      </p>
      <div className="section-heading">
        <h2>통장 · 현금</h2>
      </div>
      <div className="panel liability-list">
        {data.paymentMethods
          .filter((p) => p.type !== 'card')
          .map((p) => (
            <div key={p.id}>
              <span className="asset-icon">
                <Wallet size={20} />
              </span>
              <div>
                <strong>{p.name}</strong>
                <span>
                  {ownerName(p.ownerId)} · {p.type === 'account' ? '계좌' : '현금'} 결제수단
                </span>
              </div>
              <span className="muted small">거래 기록용</span>
            </div>
          ))}
      </div>
    </>
  );
}
function InfoIcon() {
  return <CircleHelp size={17} />;
}

function AnalyticsView({
  data,
  ledgerId,
  setLedgerId,
  month,
}: {
  data: Bootstrap;
  ledgerId: string;
  setLedgerId(id: string): void;
  month: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const entries = visibleTransactions(data, ledgerId, month);
  const filtered = entries.filter(
    (tx) => !selected.length || selected.some((id) => tx.tagIds.includes(id)),
  );
  const sum = totals(filtered);
  const categories = categoryGroups(filtered);
  return (
    <>
      <section className="panel analytics-filter">
        <div className="panel-title">
          <h2>보고 싶은 기록을 골라보세요</h2>
          <select
            aria-label="분석할 가계부"
            value={ledgerId}
            onChange={(e) => setLedgerId(e.target.value)}
          >
            {data.ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="tag-options">
          <button
            className={`tag-option ${!selected.length ? 'active' : ''}`}
            onClick={() => setSelected([])}
          >
            전체 태그
          </button>
          {data.tags.map((tag) => (
            <button
              key={tag.id}
              className={`tag-option ${selected.includes(tag.id) ? 'active' : ''}`}
              aria-pressed={selected.includes(tag.id)}
              onClick={() =>
                setSelected((ids) =>
                  ids.includes(tag.id) ? ids.filter((id) => id !== tag.id) : [...ids, tag.id],
                )
              }
            >
              # {tag.name}
            </button>
          ))}
        </div>
        <p className="small muted">
          선택한 태그 중 하나라도 포함된 내역을 모아요. 여러 태그가 겹쳐도 같은 내역은 한 번만
          합산해요.
        </p>
      </section>
      <section className="stats-grid">
        <Stat
          label="선택한 기록의 수입"
          amount={sum.income}
          hint={`${filtered.length}건의 기록 기준`}
        />
        <Stat label="선택한 기록의 지출" amount={sum.expense} hint={monthLabel(month)} accent />
        <Stat label="선택한 기록의 저축" amount={sum.saving} hint="수입·지출과 별도 집계" />
        <Stat label="선택한 기록의 이체" amount={sum.transfer} hint="수입·지출과 별도 집계" />
      </section>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>분류별 지출</h2>
            <span className="muted small">상위 5개</span>
          </div>
          <CategoryBars groups={categories} total={sum.expense} />
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>누구의 지출인가요?</h2>
          </div>
          <div className="owner-analysis">
            {['u1', 'u2', 'shared'].map((id, index) => {
              const amount = filtered
                .filter((tx) => tx.ownerId === id && tx.type === 'expense')
                .reduce((s, tx) => s + tx.amount, 0);
              return (
                <div key={id}>
                  <span
                    className={`avatar ${index === 0 ? 'purple' : index === 1 ? 'pink' : 'sage'}`}
                  >
                    {ownerName(id).slice(0, 1)}
                  </span>
                  <div>
                    <span>{ownerName(id)}</span>
                    <div className="mini-track">
                      <span
                        style={{
                          width: `${sum.expense ? (amount / sum.expense) * 100 : 0}%`,
                          background: colors[index],
                        }}
                      />
                    </div>
                  </div>
                  <strong>{won(amount)}원</strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
