import { useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Plus, Settings2 } from 'lucide-react';
import type { Bootstrap } from '../shared/types';
import {
  accountingPeriod,
  payrollSummary,
  planActual,
  planTransactions,
  scheduleOccurrences,
  weeklyActuals,
  type Plan,
  type PlanKind,
  type PayrollLine,
  type Rounding,
} from '../shared/planning';
import { request, RequestError } from './api';
import { Dialog, Empty, ownerName, useUnsavedGuard, won } from './components';
import './planning.css';

interface Props {
  data: Bootstrap;
  month: string;
  ledgerId: string;
  onChanged(): Promise<void>;
  onNotice(message: string): void;
}
const names: Record<PlanKind, string> = {
  budget: '예산',
  goal: '목표',
  payroll: '월급 배분',
  event: '행사',
  schedule: '결제 일정',
};
const roundingNames: Record<Rounding, string> = {
  none: '원 단위 유지',
  floor10000: '만 원 단위 내림',
  ceil10000: '만 원 단위 올림',
};
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function initialPlan(data: Bootstrap, ledgerId: string, month: string, kind: PlanKind): Plan {
  const ledger = data.ledgers.find((l) => l.id === ledgerId);
  const period = accountingPeriod(
    month,
    (ledger as { periodStartDay?: number })?.periodStartDay ?? 1,
  );
  const base = {
    id: '',
    version: 0,
    kind,
    ledgerId,
    title: '',
    ...period,
    amount: 0,
    tagIds: [],
    paymentMethodId: null,
    ownerId: null,
    includeLinked: ledger?.kind === 'main',
    notes: '',
    archived: false,
  };
  switch (kind) {
    case 'budget':
      return { ...base, kind, cadence: 'month', budgetScope: 'total' };
    case 'goal':
      return { ...base, kind, metric: 'income', direction: 'atLeast', assetId: null };
    case 'payroll':
      return { ...base, kind, rounding: 'floor10000', lines: [] };
    case 'event':
      return { ...base, kind, actualMode: 'transactions', actualAmount: null, evaluation: '' };
    case 'schedule':
      return { ...base, kind, endDate: period.startDate, repeat: 'once', payments: [] };
  }
}
export default function PlanningView({ data, month, ledgerId, onChanged, onNotice }: Props) {
  const [kind, setKind] = useState<PlanKind>('budget');
  const [editor, setEditor] = useState<Plan | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [allDates, setAllDates] = useState(false);
  const [selectedLedger, setSelectedLedger] = useState(ledgerId);
  const ledger =
    data.ledgers.find((l) => l.id === selectedLedger) ??
    data.ledgers.find((l) => l.id === ledgerId) ??
    data.ledgers[0];
  if (!ledger) return <Empty>가계부를 만든 뒤 계획을 등록해 주세요.</Empty>;
  const period = accountingPeriod(
    month,
    (ledger as { periodStartDay?: number }).periodStartDay ?? 1,
  );
  const plans = (data.plans ?? [])
    .filter(
      (p) =>
        p.ledgerId === ledger.id &&
        p.kind === kind &&
        (showArchived || !p.archived) &&
        (allDates || (p.startDate <= period.endDate && p.endDate >= period.startDate)),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
  return (
    <div className="planning-view">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PLAN & REVIEW</span>
          <h2>계획하고 돌아보기</h2>
          <p className="muted small">
            예산과 목표를 실제 기록과 비교해요. 계획을 저장해도 수입·지출이나 자산 잔액은 바뀌지
            않아요.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => setEditor(initialPlan(data, ledger.id, month, kind))}
        >
          <Plus size={16} />
          {names[kind]} 추가
        </button>
      </div>
      <div className="planning-toolbar">
        <label>
          계획 가계부
          <select value={ledger.id} onChange={(e) => setSelectedLedger(e.target.value)}>
            {data.ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.icon} {l.name}
                {l.archived ? ' · 보관됨' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(e) => setAllDates(e.target.checked)}
          />
          전체 기간
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          보관한 계획 포함
        </label>
        <span className="small muted">
          {allDates ? '모든 계획' : `${period.startDate} ~ ${period.endDate}`}
        </span>
      </div>
      <div className="planning-tabs" aria-label="계획 종류">
        {(Object.keys(names) as PlanKind[]).map((value) => (
          <button
            key={value}
            className={kind === value ? 'selected' : ''}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {names[value]}
          </button>
        ))}
      </div>
      {kind === 'budget' && (
        <p className="small muted">
          전체 예산과 항목·주간 예산은 각각 비교해요. 겹치는 태그의 항목 예산을 전체 예산에 중복
          합산하지 않아요.
        </p>
      )}
      {!plans.length && (
        <Empty>
          등록된 {names[kind]}이 없어요. 원하는 기간과 항목으로 첫 계획을 만들어 보세요.
        </Empty>
      )}
      <div className="planning-grid">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            data={data}
            plan={plan}
            month={month}
            onEdit={() => setEditor(plan)}
          />
        ))}
      </div>
      {editor && (
        <PlanEditor
          key={editor.id || `new-${editor.kind}`}
          data={data}
          month={month}
          plan={editor}
          onClose={() => setEditor(null)}
          onChanged={onChanged}
          onSaved={async () => {
            setEditor(null);
            await onChanged();
            onNotice('계획을 저장했어요.');
          }}
        />
      )}
    </div>
  );
}
function PlanCard({
  data,
  plan,
  month,
  onEdit,
}: {
  data: Bootstrap;
  plan: Plan;
  month: string;
  onEdit(): void;
}) {
  const actual = planActual(data, plan),
    remaining = plan.amount - actual;
  const filtered = plan.tagIds.map((id) => data.tags.find((t) => t.id === id)?.name ?? '이전 태그');
  const progress = plan.amount > 0 ? Math.max(0, Math.min(100, (actual / plan.amount) * 100)) : 0;
  const payroll = plan.kind === 'payroll' ? payrollSummary(plan) : null;
  const schedule = plan.kind === 'schedule' ? scheduleOccurrences(plan, month) : [];
  const achieved =
    plan.kind === 'goal' &&
    (plan.direction === 'atLeast' ? actual >= plan.amount : actual <= plan.amount);
  return (
    <section className={`panel planning-card ${plan.archived ? 'archived' : ''}`}>
      <div className="panel-title">
        <div>
          <span className="small muted">
            {names[plan.kind]}
            {plan.kind === 'budget'
              ? ` · ${{ month: '월간', week: '주간', period: '전체 기간' }[plan.cadence]} · ${plan.budgetScope === 'total' ? '전체' : '항목'}`
              : ''}
            {plan.archived ? ' · 보관됨' : ''}
          </span>
          <h3>{plan.title}</h3>
        </div>
        <button className="icon-button" aria-label={`${plan.title} 수정`} onClick={onEdit}>
          <Settings2 size={18} />
        </button>
      </div>
      <p className="small muted">
        <CalendarDays size={13} /> {plan.startDate} ~ {plan.endDate}
      </p>
      {(filtered.length > 0 || plan.ownerId || plan.paymentMethodId) && (
        <p className="planning-condition">
          {[
            ...filtered,
            plan.ownerId ? ownerName(plan.ownerId) : '',
            plan.paymentMethodId
              ? data.paymentMethods.find((p) => p.id === plan.paymentMethodId)?.name
              : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {plan.kind === 'schedule' ? (
        <>
          <strong className="planning-amount">
            회당 {won(plan.amount)}
            <small>원</small>
          </strong>
          <p className="small muted">
            {plan.repeat === 'monthly' ? '매월 반복 · 해당 일이 없으면 말일' : '일회성 결제'} · 납부
            확인은 가계부 지출을 추가하지 않아요.
          </p>
          {schedule.length ? (
            <div className="planning-list">
              {schedule.map((due) => (
                <div key={due.date}>
                  <span>{due.date}</span>
                  <strong>
                    {due.payment
                      ? `${won(due.payment.amount)}원 납부 확인`
                      : `${won(due.amount)}원 예정`}
                  </strong>
                  {due.payment && (
                    <small>
                      {due.payment.paidDate} · {due.payment.note}
                    </small>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="small muted">조회 월에 결제 일정이 없어요.</p>
          )}
        </>
      ) : payroll ? (
        <>
          <div className="planning-metrics">
            <div>
              <span>배분할 급여</span>
              <strong>{won(payroll.available)}원</strong>
            </div>
            <div>
              <span>배분 합계</span>
              <strong>{won(payroll.allocated)}원</strong>
            </div>
            <div className={payroll.remaining < 0 ? 'planning-negative' : ''}>
              <span>남은 금액</span>
              <strong>{won(payroll.remaining)}원</strong>
            </div>
            <div>
              <span>조건에 맞는 실제 수입</span>
              <strong>{won(actual)}원</strong>
            </div>
          </div>
          <div className="planning-list">
            {payroll.lines.map((line) => (
              <div key={line.id}>
                <span>
                  {line.title}{' '}
                  <small>
                    {line.purpose === 'savings'
                      ? '저축'
                      : line.purpose === 'expense'
                        ? '지출'
                        : '기타'}
                    {line.assetId
                      ? ` · ${data.assets.find((a) => a.id === line.assetId)?.name ?? ''}`
                      : ''}
                  </small>
                </span>
                <strong>{won(line.allocated)}원</strong>
              </div>
            ))}
          </div>
          {payroll.remaining < 0 && (
            <p className="planning-negative small">
              배분 계획이 급여를 {won(-payroll.remaining)}원 초과해요.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="planning-metrics">
            <div>
              <span>{plan.kind === 'goal' ? '목표 금액' : '예산'}</span>
              <strong>{won(plan.amount)}원</strong>
            </div>
            <div>
              <span>
                {plan.kind === 'goal' && plan.metric === 'savings'
                  ? '실제 순저축'
                  : plan.kind === 'event' && plan.actualMode === 'manual'
                    ? '직접 기록한 실적'
                    : '실제 기록'}
              </span>
              <strong>{won(actual)}원</strong>
            </div>
          </div>
          <div
            className="planning-progress"
            role="progressbar"
            aria-label={`${plan.title} 실적 비율`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <p
            className={`small ${remaining < 0 && !(plan.kind === 'goal' && plan.direction === 'atLeast') ? 'planning-negative' : 'muted'}`}
          >
            {plan.kind === 'goal'
              ? `${plan.direction === 'atLeast' ? '이상 달성' : '이하 유지'} · ${achieved ? '기준 충족' : '진행 중'} · ${plan.amount ? `${((actual / plan.amount) * 100).toFixed(1)}%` : '0원 기준'}`
              : `${remaining >= 0 ? '남은 예산' : '예산 초과'} ${won(Math.abs(remaining))}원`}
          </p>
          {plan.kind === 'goal' && plan.metric === 'savings' && (
            <p className="small muted">
              {plan.assetId ? data.assets.find((a) => a.id === plan.assetId)?.name : '가구 전체'}{' '}
              순저축. 최초 잔액·평가 조정은 제외해요.
            </p>
          )}
          {plan.kind === 'event' && plan.evaluation && (
            <p className="planning-note">
              <b>결산</b> {plan.evaluation}
            </p>
          )}
          {plan.kind === 'budget' && (
            <details>
              <summary>
                주차별 사용액과 거래{' '}
                {planTransactions(data, plan).filter((t) => t.type === 'expense').length}건
              </summary>
              <div className="planning-list">
                {weeklyActuals(data, plan).map((week, index) => (
                  <div key={week.startDate}>
                    <span>
                      {index + 1}주{' '}
                      <small>
                        {week.startDate} ~ {week.endDate}
                      </small>
                    </span>
                    <strong>{won(week.amount)}원</strong>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
      {plan.notes && <p className="planning-note">{plan.notes}</p>}
      {plan.kind !== 'schedule' &&
        !(plan.kind === 'event' && plan.actualMode === 'manual') &&
        !(plan.kind === 'goal' && plan.metric === 'savings') && (
          <details className="planning-transactions">
            <summary>집계한 원본 거래 보기</summary>
            <div className="planning-list">
              {planTransactions(data, plan)
                .filter(
                  (t) =>
                    t.type ===
                    (plan.kind === 'payroll' || (plan.kind === 'goal' && plan.metric === 'income')
                      ? 'income'
                      : 'expense'),
                )
                .map((t) => (
                  <div key={t.id}>
                    <span>
                      {t.date} · {t.description}
                      <small>{data.ledgers.find((l) => l.id === t.ledgerId)?.name}</small>
                    </span>
                    <strong>{won(t.amount)}원</strong>
                  </div>
                ))}
            </div>
          </details>
        )}
    </section>
  );
}
function PlanEditor({
  data,
  month,
  plan,
  onClose,
  onChanged,
  onSaved,
}: {
  data: Bootstrap;
  month: string;
  plan: Plan;
  onClose(): void;
  onChanged(): Promise<void>;
  onSaved(): Promise<void>;
}) {
  const [draft, setDraft] = useState(plan),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [error, setError] = useState('');
  const [dueDate, setDueDate] = useState(
    plan.kind === 'schedule' ? (scheduleOccurrences(plan, month)[0]?.date ?? plan.startDate) : '',
  );
  const dueOptions = draft.kind === 'schedule' ? scheduleOccurrences(draft) : [];
  const selectedDueDate = dueOptions.some((o) => o.date === dueDate)
    ? dueDate
    : (dueOptions[0]?.date ?? '');
  const pending = useRef<{ url: string; method: string; body: unknown } | null>(null);
  const initial = useRef(JSON.stringify(plan));
  useUnsavedGuard(busy || uncertain || JSON.stringify(draft) !== initial.current);
  function update(patch: Partial<Plan>) {
    setDraft((current) => ({ ...current, ...patch }) as Plan);
  }
  const ledger = data.ledgers.find((l) => l.id === draft.ledgerId);
  const noFilters = draft.kind === 'goal' && draft.metric === 'savings';
  const groups = data.tagGroups.filter(
    (g) =>
      g.appliesTo === 'transaction' &&
      (!g.archived ||
        draft.tagIds.some((id) => data.tags.find((t) => t.id === id)?.groupId === g.id)) &&
      (!g.ledgerIds ||
        g.ledgerIds.includes(draft.ledgerId) ||
        draft.tagIds.some((id) => data.tags.find((t) => t.id === id)?.groupId === g.id)),
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || conflict) return;
    if (!pending.current)
      pending.current = {
        url: plan.id ? `/api/plans/${plan.id}` : '/api/plans',
        method: plan.id ? 'PATCH' : 'POST',
        body: {
          ...draft,
          mutationId: crypto.randomUUID(),
          expectedVersion: draft.version || undefined,
        },
      };
    setBusy(true);
    setError('');
    try {
      const op = pending.current;
      await request(op.url, op.method, op.body);
      pending.current = null;
      setUncertain(false);
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.status > 0 && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        if (e.status === 409) {
          setConflict(true);
          await onChanged();
        }
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError('');
    try {
      const fresh = await request<Bootstrap>('/api/bootstrap');
      const current = fresh.plans?.find((p) => p.id === plan.id);
      if (plan.id && !current) {
        setError('계획을 찾을 수 없습니다. 창을 닫고 목록을 새로 확인해 주세요.');
        return;
      }
      if (current) {
        setDraft(current);
        initial.current = JSON.stringify(current);
      }
      setConflict(false);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function lineChange(id: string, patch: Partial<PayrollLine>) {
    if (draft.kind === 'payroll')
      update({ lines: draft.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)) });
  }
  return (
    <Dialog
      title={`${names[draft.kind]} ${plan.id ? '설정' : '추가'}`}
      subtitle={ledger?.name}
      onClose={onClose}
      locked={busy || uncertain}
    >
      <form onSubmit={(e) => void save(e)}>
        <div className="form-body planning-form">
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {uncertain && (
            <div className="alert">
              저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.
            </div>
          )}
          {conflict && (
            <div className="conflict">
              <strong>다른 변경이 먼저 저장됐어요.</strong>
              <p>최신 계획을 불러오면 현재 입력 대신 저장된 내용이 표시돼요.</p>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void reload()}
              >
                최신 계획 불러오기
              </button>
            </div>
          )}
          <fieldset disabled={busy || uncertain || conflict}>
            <label>
              계획 이름
              <input
                required
                autoFocus
                maxLength={120}
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder={
                  draft.kind === 'payroll'
                    ? '예: 9월 월급 배분'
                    : draft.kind === 'budget'
                      ? '예: 9월 생활비'
                      : ''
                }
              />
            </label>
            <div className="form-grid">
              <label>
                시작일
                <input
                  required
                  type="date"
                  value={draft.startDate}
                  onChange={(e) =>
                    update({
                      startDate: e.target.value,
                      ...(draft.kind === 'schedule' && draft.repeat === 'once'
                        ? { endDate: e.target.value }
                        : {}),
                    })
                  }
                />
              </label>
              <label>
                {draft.kind === 'schedule' ? '마지막 결제일' : '종료일'}
                <input
                  required
                  type="date"
                  min={draft.startDate}
                  value={draft.endDate}
                  disabled={draft.kind === 'schedule' && draft.repeat === 'once'}
                  onChange={(e) => update({ endDate: e.target.value })}
                />
              </label>
            </div>
            {draft.kind === 'budget' && (
              <div className="form-grid">
                <label>
                  예산 기간
                  <select
                    value={draft.cadence}
                    onChange={(e) =>
                      update({ cadence: e.target.value as 'month' | 'week' | 'period' })
                    }
                  >
                    <option value="month">월간</option>
                    <option value="week">주간 (최대 7일)</option>
                    <option value="period">전체 기간</option>
                  </select>
                </label>
                <label>
                  예산 범위
                  <select
                    value={draft.budgetScope}
                    onChange={(e) =>
                      update({
                        budgetScope: e.target.value as 'total' | 'category',
                        ...(e.target.value === 'total' ? { tagIds: [] } : {}),
                      })
                    }
                  >
                    <option value="total">전체 예산</option>
                    <option value="category">태그 항목별 예산</option>
                  </select>
                </label>
              </div>
            )}
            {draft.kind === 'goal' && (
              <>
                <div className="form-grid">
                  <label>
                    목표 대상
                    <select
                      value={draft.metric}
                      onChange={(e) =>
                        update({
                          metric: e.target.value as 'income' | 'expense' | 'savings',
                          assetId: null,
                          ...(e.target.value === 'savings'
                            ? { tagIds: [], paymentMethodId: null, ownerId: null }
                            : {}),
                        })
                      }
                    >
                      <option value="income">수입</option>
                      <option value="expense">지출</option>
                      {ledger?.kind === 'main' && <option value="savings">순저축</option>}
                    </select>
                  </label>
                  <label>
                    달성 기준
                    <select
                      value={draft.direction}
                      onChange={(e) =>
                        update({ direction: e.target.value as 'atLeast' | 'atMost' })
                      }
                    >
                      <option value="atLeast">목표 금액 이상 달성</option>
                      <option value="atMost">목표 금액 이하 유지</option>
                    </select>
                  </label>
                </div>
                {draft.metric === 'savings' && (
                  <label>
                    저축 자산
                    <select
                      value={draft.assetId ?? ''}
                      onChange={(e) => update({ assetId: e.target.value || null })}
                    >
                      <option value="">가구 전체 순저축</option>
                      {data.assets
                        .filter(
                          (a) =>
                            a.kind === 'asset' &&
                            (!a.archived || (draft.kind === 'goal' && draft.assetId === a.id)),
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                    <small className="muted">실제 저축 유입에서 인출을 뺀 금액을 집계해요.</small>
                  </label>
                )}
              </>
            )}
            <Amount
              label={
                draft.kind === 'payroll'
                  ? '급여 원금액'
                  : draft.kind === 'schedule'
                    ? '회당 결제 예정액'
                    : draft.kind === 'goal'
                      ? '목표 금액'
                      : '예산 금액'
              }
              value={draft.amount}
              onChange={(amount) => update({ amount })}
            />
            {draft.kind === 'payroll' && (
              <>
                <RoundSelect
                  label="급여 계산 방식"
                  value={draft.rounding}
                  onChange={(rounding) => update({ rounding })}
                />
                <h3>배분할 항목</h3>
                <p className="small muted">
                  저축·생활비·이자 등을 계획해요. 실제 이체와 지출은 해당 화면에 별도로 기록해요.
                </p>
                {draft.lines.map((line, index) => (
                  <div className="planning-editor-row" key={line.id}>
                    <label>
                      {index + 1}. 배분 항목
                      <input
                        required
                        maxLength={120}
                        value={line.title}
                        onChange={(e) => lineChange(line.id, { title: e.target.value })}
                      />
                    </label>
                    <div className="form-grid">
                      <Amount
                        label="배분 금액"
                        value={line.amount}
                        onChange={(amount) => lineChange(line.id, { amount })}
                      />
                      <RoundSelect
                        label="배분 금액 계산"
                        value={line.rounding}
                        onChange={(rounding) => lineChange(line.id, { rounding })}
                      />
                    </div>
                    <div className="form-grid">
                      <label>
                        배분 목적
                        <select
                          value={line.purpose}
                          onChange={(e) =>
                            lineChange(line.id, {
                              purpose: e.target.value as PayrollLine['purpose'],
                            })
                          }
                        >
                          <option value="expense">지출</option>
                          <option value="savings">저축</option>
                          <option value="other">기타</option>
                        </select>
                      </label>
                      <label>
                        예정 배분 자산
                        <select
                          value={line.assetId ?? ''}
                          onChange={(e) => lineChange(line.id, { assetId: e.target.value || null })}
                        >
                          <option value="">연결 안 함</option>
                          {data.assets
                            .filter(
                              (a) => a.kind === 'asset' && (!a.archived || line.assetId === a.id),
                            )
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => update({ lines: draft.lines.filter((l) => l.id !== line.id) })}
                    >
                      배분 항목 삭제
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary"
                  disabled={draft.lines.length >= 100}
                  onClick={() =>
                    update({
                      lines: [
                        ...draft.lines,
                        {
                          id: crypto.randomUUID(),
                          title: '',
                          amount: 0,
                          rounding: 'none',
                          purpose: 'expense',
                          assetId: null,
                        },
                      ],
                    })
                  }
                >
                  <Plus size={15} />
                  배분 항목 추가
                </button>
                <div className="effect-preview">
                  <span>
                    배분 가능한 금액 {won(payrollSummary(draft).available)}원<br />
                    배분 합계 {won(payrollSummary(draft).allocated)}원<br />
                    <strong>잔여금 {won(payrollSummary(draft).remaining)}원</strong>
                  </span>
                </div>
              </>
            )}
            {draft.kind === 'event' && (
              <>
                <label>
                  실적 기록 방식
                  <select
                    value={draft.actualMode}
                    onChange={(e) =>
                      update({
                        actualMode: e.target.value as 'transactions' | 'manual',
                        actualAmount:
                          e.target.value === 'manual' ? (draft.actualAmount ?? 0) : null,
                      })
                    }
                  >
                    <option value="transactions">조건에 맞는 지출 자동 집계</option>
                    <option value="manual">행사 실적 금액 직접 기록</option>
                  </select>
                </label>
                {draft.actualMode === 'manual' && (
                  <>
                    <Amount
                      label="행사 실제 금액"
                      value={draft.actualAmount ?? 0}
                      onChange={(actualAmount) => update({ actualAmount })}
                    />
                    <p className="small muted">
                      행사 결산용 금액이에요. 수입·지출 합계에는 자동으로 추가되지 않아요.
                    </p>
                  </>
                )}
                <label>
                  결산·평가
                  <textarea
                    maxLength={2000}
                    rows={3}
                    value={draft.evaluation}
                    onChange={(e) => update({ evaluation: e.target.value })}
                  />
                </label>
              </>
            )}
            {draft.kind === 'schedule' && (
              <>
                <label>
                  결제 반복
                  <select
                    value={draft.repeat}
                    onChange={(e) =>
                      update({
                        repeat: e.target.value as 'once' | 'monthly',
                        ...(e.target.value === 'once' ? { endDate: draft.startDate } : {}),
                      })
                    }
                  >
                    <option value="once">한 번</option>
                    <option value="monthly">매월 시작일과 같은 날짜</option>
                  </select>
                </label>
                <p className="small muted">
                  매월 같은 날짜가 없으면 해당 월 말일로 표시해요. 납부 확인은 정보 기록이며
                  지출·잔액에는 영향을 주지 않아요.
                </p>
                <h3>납부 확인</h3>
                <div className="form-grid">
                  <label>
                    예정 결제일
                    <select value={selectedDueDate} onChange={(e) => setDueDate(e.target.value)}>
                      {dueOptions.map((o) => (
                        <option key={o.date} value={o.date}>
                          {o.date}
                          {o.payment ? ' · 확인됨' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary planning-add-payment"
                    disabled={!dueOptions.some((o) => o.date === selectedDueDate && !o.payment)}
                    onClick={() =>
                      update({
                        payments: [
                          ...draft.payments,
                          {
                            date: selectedDueDate,
                            paidDate: today(),
                            amount: draft.amount,
                            note: '',
                          },
                        ],
                      })
                    }
                  >
                    납부 확인 추가
                  </button>
                </div>
                {draft.payments.map((payment) => (
                  <div className="planning-editor-row" key={payment.date}>
                    <strong>{payment.date} 예정 건</strong>
                    <div className="form-grid">
                      <label>
                        실제 납부일
                        <input
                          type="date"
                          required
                          value={payment.paidDate}
                          onChange={(e) =>
                            update({
                              payments: draft.payments.map((p) =>
                                p.date === payment.date ? { ...p, paidDate: e.target.value } : p,
                              ),
                            })
                          }
                        />
                      </label>
                      <Amount
                        label="실제 납부액"
                        value={payment.amount}
                        onChange={(amount) =>
                          update({
                            payments: draft.payments.map((p) =>
                              p.date === payment.date ? { ...p, amount } : p,
                            ),
                          })
                        }
                      />
                    </div>
                    <label>
                      납부 메모
                      <input
                        maxLength={500}
                        value={payment.note}
                        onChange={(e) =>
                          update({
                            payments: draft.payments.map((p) =>
                              p.date === payment.date ? { ...p, note: e.target.value } : p,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        update({ payments: draft.payments.filter((p) => p.date !== payment.date) })
                      }
                    >
                      납부 확인 취소
                    </button>
                  </div>
                ))}
              </>
            )}
            {!noFilters && (
              <>
                <h3>{draft.kind === 'schedule' ? '일정 정보' : '실제 기록 집계 조건'}</h3>
                <div className="form-grid">
                  <label>
                    귀속
                    <select
                      value={draft.ownerId ?? ''}
                      onChange={(e) =>
                        update({ ownerId: (e.target.value || null) as Plan['ownerId'] })
                      }
                    >
                      <option value="">전체</option>
                      {data.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                      <option value="shared">공동</option>
                    </select>
                  </label>
                  <label>
                    결제수단
                    <select
                      value={draft.paymentMethodId ?? ''}
                      onChange={(e) => update({ paymentMethodId: e.target.value || null })}
                    >
                      <option value="">전체 / 지정 안 함</option>
                      {data.paymentMethods
                        .filter((p) => !p.archived || p.id === draft.paymentMethodId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                {ledger?.kind === 'main' && draft.kind !== 'schedule' && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={draft.includeLinked}
                      onChange={(e) => update({ includeLinked: e.target.checked })}
                    />
                    연결된 하위 가계부의 원본 거래 포함
                  </label>
                )}
                {!(draft.kind === 'budget' && draft.budgetScope === 'total') &&
                  draft.kind !== 'schedule' && (
                    <>
                      <p className="small muted">
                        같은 태그 유형 안에서는 하나라도 일치하면 포함하고, 서로 다른 유형은 모두
                        일치해야 해요. 아무 조건도 선택하지 않으면 기간 내 전체 거래를 집계해요.
                      </p>
                      {groups.map((group) => (
                        <div className="planning-tag-group" key={group.id}>
                          <strong>{group.name}</strong>
                          <div>
                            {data.tags
                              .filter(
                                (tag) =>
                                  tag.groupId === group.id &&
                                  (!tag.archived || draft.tagIds.includes(tag.id)),
                              )
                              .map((tag) => (
                                <label className="checkbox" key={tag.id}>
                                  <input
                                    type="checkbox"
                                    checked={draft.tagIds.includes(tag.id)}
                                    onChange={(e) =>
                                      update({
                                        tagIds: e.target.checked
                                          ? [...draft.tagIds, tag.id]
                                          : draft.tagIds.filter((id) => id !== tag.id),
                                      })
                                    }
                                  />
                                  {tag.name}
                                </label>
                              ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
              </>
            )}
            <label>
              메모
              <textarea
                rows={3}
                maxLength={2000}
                value={draft.notes}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </label>
            {plan.id && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.archived}
                  onChange={(e) => update({ archived: e.target.checked })}
                />
                이 계획 보관하기 <small className="muted">해제하면 다시 표시돼요.</small>
              </label>
            )}
          </fieldset>
        </div>
        <div className="form-footer">
          <div className="footer-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={busy || uncertain}
            >
              닫기
            </button>
            <button className="primary" type="submit" disabled={busy || conflict}>
              {busy ? '저장 중…' : uncertain ? '저장 결과 다시 확인' : '계획 저장'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
function Amount({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
}) {
  return (
    <label>
      {label}
      <input
        required
        type="number"
        inputMode="numeric"
        min={0}
        max={1000000000000}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function RoundSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Rounding;
  onChange(value: Rounding): void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as Rounding)}>
        {(Object.keys(roundingNames) as Rounding[]).map((rounding) => (
          <option value={rounding} key={rounding}>
            {roundingNames[rounding]}
          </option>
        ))}
      </select>
    </label>
  );
}
