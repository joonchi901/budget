import { SelectField, SelectOption } from './SelectField';
import { MonthField } from './DateFields';
import { useRef, useState, type FormEvent } from 'react';
import { Archive, CreditCard, Plus, Search, Settings2, Wallet } from 'lucide-react';
import type { Bootstrap, OwnerId, PaymentMethod } from '../shared/types';
import { cardStatement } from '../shared/selectors';
import {
  maskedAccountNumber,
  paymentSettingIssue,
  paymentUsage,
  type ManagedPayment,
} from '../shared/payments';
import { request, RequestError } from './api';
import { Dialog, Empty, useUnsavedGuard, won } from './components';
import './payments.css';
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;

interface Props {
  data: Bootstrap;
  month: string;
  onChanged(): Promise<void>;
  onNotice(message: string): void;
}
type Editor = { payment?: ManagedPayment; type: PaymentMethod['type'] };

export default function PaymentsView({ data, month, onChanged, onNotice }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const methods = data.paymentMethods.filter(
    (p: ManagedPayment) =>
      (showArchived || !p.archived) &&
      `${p.name} ${p.institution ?? ''} ${p.purpose ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const activeCards = data.paymentMethods.filter((p) => p.type === 'card' && !p.archived);
  const billingCards = activeCards.filter((p) => p.cardKind !== 'debit' && !paymentSettingIssue(p));
  const incompleteCards = activeCards.filter(
    (p) => p.cardKind !== 'debit' && paymentSettingIssue(p),
  );
  const billTotal = billingCards.reduce(
    (sum, p) => sum + cardStatement(data.transactions, p, month).amount,
    0,
  );
  const useTotal = activeCards.reduce(
    (sum, p) => sum + paymentUsage(data.transactions, p.id, month).expense,
    0,
  );
  const name = (id: OwnerId) =>
    id === 'shared' ? '공동' : (data.users.find((user) => user.id === id)?.name ?? id);
  return (
    <div className="payments-workspace">
      <section className="payment-overview" aria-label="카드 사용 요약">
        <div>
          <span className="payment-overview-date">{monthLabel(month)}</span>
          <h2>{incompleteCards.length ? '설정된 카드의 예상 대금' : '이번 달 납부 예정'}</h2>
          <strong>
            {billingCards.length === 0 && incompleteCards.length > 0 ? '—' : won(billTotal)}
            {(billingCards.length > 0 || incompleteCards.length === 0) && <small>원</small>}
          </strong>
          <p>기록한 사용액 기준 · 지출로 다시 집계하지 않아요</p>
        </div>
        <div className="payment-overview-side">
          <span className="payment-overview-icon">
            <CreditCard size={26} />
          </span>
          <span>이번 달 카드 사용액</span>
          <strong>
            {won(useTotal)}
            <small>원</small>
          </strong>
          <span className="small muted">
            신용·체크카드 {activeCards.length}개
            {incompleteCards.length ? ` · 납부일 설정 필요 ${incompleteCards.length}개` : ''}
          </span>
        </div>
      </section>
      <div className="section-heading payment-toolbar">
        <div>
          <h2>카드 · 통장 관리</h2>
          <p className="muted small">사용 내역부터 결제일, 혜택까지 한곳에서</p>
        </div>
        <div className="payment-actions">
          <button className="primary" onClick={() => setEditor({ type: 'card' })}>
            <Plus size={16} /> 카드 추가
          </button>
          <button className="secondary" onClick={() => setEditor({ type: 'account' })}>
            <Plus size={16} /> 통장 추가
          </button>
          <button className="secondary" onClick={() => setEditor({ type: 'cash' })}>
            현금 추가
          </button>
        </div>
      </div>
      <div className="payment-filters">
        <div className="payment-search">
          <Search size={19} aria-hidden="true" />
          <input
            aria-label="결제수단 검색"
            placeholder="이름 · 기관 · 용도 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />{' '}
          보관 항목 포함
        </label>
      </div>
      <div className="payment-grid">
        {methods
          .filter((p) => p.type === 'card')
          .map((card: ManagedPayment) => {
            const usage = paymentUsage(data.transactions, card.id, month);
            const issue = paymentSettingIssue(card);
            const debit = card.cardKind === 'debit';
            const statement =
              !debit && !issue ? cardStatement(data.transactions, card, month) : null;
            const account = data.paymentMethods.find((p) => p.id === card.linkedAccountId);
            return (
              <section
                key={card.id}
                className={`panel payment-card ${card.archived ? 'payment-archived' : ''}`}
              >
                <div className="payment-card-heading">
                  <span className="payment-method-icon">
                    <CreditCard size={24} />
                  </span>
                  <div className="payment-card-identity">
                    <h3>{card.name}</h3>
                    <p>
                      {name(card.ownerId)} · {debit ? '체크카드' : '신용카드'}
                      {card.archived ? ' · 보관' : ''}
                    </p>
                    <span>
                      {card.institution || '카드사 미등록'}
                      {card.purpose ? ` · ${card.purpose}` : ''}
                    </span>
                  </div>
                  <button
                    className="secondary payment-settings"
                    aria-label={`${card.name} 설정`}
                    onClick={() => setEditor({ payment: card, type: 'card' })}
                  >
                    <Settings2 size={15} /> 설정
                  </button>
                </div>
                <div className="payment-info">
                  <h2>{debit ? '이번 달 사용액' : '예상 카드 대금'}</h2>
                  {issue ? (
                    <p className="payment-setup-note">{issue}</p>
                  ) : (
                    <strong className="bill-amount">
                      {won(debit ? usage.expense : statement!.amount)}
                      <small>원</small>
                    </strong>
                  )}
                  {statement && <Detail label="예상 납부일" value={statement.paymentDate} />}
                  <Detail label="결제 통장" value={account?.name ?? '미연결'} />
                  <Detail label="이번 달 사용액" value={`${won(usage.expense)}원`} />
                  {card.monthlyBudget !== undefined && (
                    <Detail
                      label="월 사용 예산 / 잔여"
                      value={`${won(card.monthlyBudget)}원 / ${won(card.monthlyBudget - usage.expense)}원`}
                    />
                  )}
                  <details className="payment-more">
                    <summary>카드 상세 · 혜택</summary>
                    {statement && (
                      <Detail
                        label="사용 기간"
                        value={`${statement.startDate} ~ ${statement.endDate}`}
                      />
                    )}
                    {card.performanceTarget !== undefined && (
                      <Detail
                        label="기록 사용액 / 실적 기준"
                        value={`${won(usage.expense)}원 / ${won(card.performanceTarget)}원`}
                      />
                    )}
                    {card.creditLimit !== undefined && (
                      <Detail label="한도" value={`${won(card.creditLimit)}원`} />
                    )}

                    <Detail label="유효기간" value={card.expiry || '미등록'} />
                    <Detail
                      label="연회비"
                      value={card.annualFee === undefined ? '미등록' : `${won(card.annualFee)}원`}
                    />
                    <Detail label="사용 기간 메모" value={card.usagePeriodNote || '없음'} />
                    <Detail label="혜택" value={card.benefits || '미등록'} />
                    <Detail label="비고" value={card.notes || '없음'} />
                    {card.performanceTarget !== undefined && (
                      <p className="small muted">
                        기록한 지출 합계예요. 카드사의 실적 제외 조건은 혜택 메모와 함께 확인해
                        주세요.
                      </p>
                    )}
                  </details>
                  <UsageDetails
                    title={statement ? '청구 기간 사용 내역' : '이번 달 사용 내역'}
                    transactions={statement?.transactions ?? usage.transactions}
                    data={data}
                  />
                </div>
              </section>
            );
          })}
      </div>
      {!methods.some((p) => p.type === 'card') && (
        <Empty>등록된 카드가 없어요. 카드 추가에서 결제일과 혜택을 설정해 보세요.</Empty>
      )}
      <p className="small muted statement-note">
        예상 대금은 직접 기록한 사용 내역과 마감일·납부일을 기준으로 해요. 할부·취소·이월·휴일 및
        카드사의 실적 제외 조건은 반영하지 않아요.
      </p>
      <div className="section-heading">
        <h2>통장 · 현금</h2>
      </div>
      <div className="payment-account-grid">
        {methods
          .filter((p) => p.type !== 'card')
          .map((payment: ManagedPayment) => {
            const usage = paymentUsage(data.transactions, payment.id, month);
            const asset = data.assets.find((a) => a.id === payment.assetId);
            const cards = data.paymentMethods.filter(
              (p: ManagedPayment) => p.linkedAccountId === payment.id,
            );
            return (
              <section
                key={payment.id}
                className={`panel payment-account ${payment.archived ? 'payment-archived' : ''}`}
              >
                <div className="panel-title">
                  <div>
                    <h3>
                      <Wallet size={18} /> {payment.name}
                    </h3>
                    <p className="muted small">
                      {name(payment.ownerId)} ·{' '}
                      {payment.type === 'account' ? payment.accountKind || '통장' : '현금'}
                      {payment.archived ? ' · 보관' : ''}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    aria-label={`${payment.name} 설정`}
                    onClick={() => setEditor({ payment, type: payment.type })}
                  >
                    <Settings2 size={15} /> 설정
                  </button>
                </div>
                <div className="payment-account-balance">
                  <span>{asset ? '연결 자산의 현재 잔액' : '이번 달 사용액'}</span>
                  <strong>
                    {won(asset ? asset.balance : usage.expense)}
                    <small>원</small>
                  </strong>
                  {asset && <span className="small muted">{asset.name}</span>}
                </div>
                <div className="payment-account-flows">
                  <div>
                    <span>이번 달 수입</span>
                    <strong>{won(usage.income)}원</strong>
                  </div>
                  <div>
                    <span>이번 달 지출</span>
                    <strong>{won(usage.expense)}원</strong>
                  </div>
                </div>
                <details className="payment-more">
                  <summary>통장 · 현금 상세</summary>
                  {payment.type === 'account' && (
                    <>
                      <Detail label="은행" value={payment.institution || '미등록'} />
                      <Detail label="계좌번호" value={maskedAccountNumber(payment.accountNumber)} />
                    </>
                  )}
                  <Detail label="용도" value={payment.purpose || '미등록'} />
                  <Detail label="연결 자산" value={asset?.name || '미연결'} />
                  {cards.length > 0 && (
                    <Detail label="연결 카드" value={cards.map((p) => p.name).join(', ')} />
                  )}
                  {payment.notes && <Detail label="비고" value={payment.notes} />}
                </details>
                <UsageDetails
                  title="이번 달 사용 내역"
                  transactions={usage.transactions}
                  data={data}
                />
              </section>
            );
          })}
      </div>
      {!methods.some((p) => p.type !== 'card') && (
        <Empty>통장이나 현금 항목을 등록해 주세요.</Empty>
      )}
      <p className="small muted">
        통장 연결은 잔액 조회용이에요. 실제 잔액은 거래의 자산 반영과 자산 이동·조정으로 바뀌어요.
      </p>
      {editor && (
        <PaymentEditor
          key={editor.payment?.id ?? editor.type}
          editor={editor}
          data={data}
          onClose={() => setEditor(null)}
          onChanged={onChanged}
          onSaved={async () => {
            await onChanged();
            setEditor(null);
            onNotice('결제수단을 저장했어요.');
          }}
        />
      )}
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="asset-detail payment-detail">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
function UsageDetails({
  title,
  transactions,
  data,
}: {
  title: string;
  transactions: Bootstrap['transactions'];
  data: Bootstrap;
}) {
  return (
    <details className="payment-more">
      <summary>
        {title} · {transactions.length}건
      </summary>
      <div className="statement-list">
        {transactions.map((tx) => (
          <div key={tx.id}>
            <span>
              <span className="small muted">
                {tx.date} · {data.ledgers.find((l) => l.id === tx.ledgerId)?.name}
              </span>
              <br />
              {tx.description}
            </span>
            <strong>
              {tx.type === 'income' ? '+' : ''}
              {won(tx.amount)}원
            </strong>
          </div>
        ))}
        {!transactions.length && <p className="muted small">이 기간에 기록한 내역이 없어요.</p>}
      </div>
    </details>
  );
}

function PaymentEditor({
  editor,
  data,
  onClose,
  onChanged,
  onSaved,
}: {
  editor: Editor;
  data: Bootstrap;
  onClose(): void;
  onChanged(): Promise<void>;
  onSaved(): Promise<void>;
}) {
  const initialPayment = editor.payment;
  const empty: ManagedPayment = {
    id: '',
    name: '',
    type: editor.type,
    ownerId: 'shared',
    closingDay: null,
    paymentDay: null,
    cardKind: 'credit',
    version: 1,
  };
  const [draft, setDraft] = useState<ManagedPayment>(initialPayment ?? empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const pending = useRef<{ method: string; url: string; body: Record<string, unknown> } | null>(
    null,
  );
  const baseline = useRef(JSON.stringify(draft));
  useUnsavedGuard(busy || uncertain || JSON.stringify(draft) !== baseline.current);
  const locked = busy || uncertain;
  function field<K extends keyof ManagedPayment>(key: K, value: ManagedPayment[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (busy || conflict) return;
    if (!pending.current)
      pending.current = {
        url: initialPayment ? `/api/payment-methods/${initialPayment.id}` : '/api/payment-methods',
        method: initialPayment ? 'PATCH' : 'POST',
        body: {
          ...draft,
          monthlyBudget: draft.monthlyBudget ?? null,
          annualFee: draft.annualFee ?? null,
          creditLimit: draft.creditLimit ?? null,
          performanceTarget: draft.performanceTarget ?? null,
          mutationId: crypto.randomUUID(),
          expectedVersion: draft.version ?? 1,
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
      const latest = fresh.paymentMethods.find((p) => p.id === initialPayment?.id);
      if (!latest) {
        setError('항목을 찾지 못했어요. 목록을 새로 확인해 주세요.');
        return;
      }
      setDraft(latest);
      baseline.current = JSON.stringify(latest);
      setConflict(false);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title = editor.type === 'card' ? '카드' : editor.type === 'account' ? '통장' : '현금';
  const textInput = (
    key: 'institution' | 'accountKind' | 'purpose' | 'accountNumber' | 'usagePeriodNote',
    label: string,
  ) => (
    <label>
      {label}
      <input
        maxLength={key === 'accountNumber' ? 64 : 240}
        value={draft[key] ?? ''}
        onChange={(e) => field(key, e.target.value)}
        autoComplete="off"
      />
    </label>
  );
  const moneyInput = (
    key: 'monthlyBudget' | 'annualFee' | 'creditLimit' | 'performanceTarget',
    label: string,
  ) => (
    <label>
      {label}
      <input
        type="number"
        min="0"
        max="1000000000000"
        step="1"
        inputMode="numeric"
        placeholder="미설정"
        value={draft[key] ?? ''}
        onChange={(e) => field(key, e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </label>
  );
  return (
    <Dialog
      title={`${title} ${initialPayment ? '설정' : '추가'}`}
      subtitle={initialPayment?.name}
      onClose={onClose}
      locked={locked}
    >
      <form className="payment-editor" onSubmit={(e) => void save(e)}>
        <div className="form-body">
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
              <strong>다른 변경이 먼저 반영되었어요.</strong>
              <p>최신 설정을 불러오면 현재 입력을 최신 내용으로 바꿔요.</p>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void reload()}
              >
                최신 설정 불러오기
              </button>
            </div>
          )}
          <fieldset disabled={busy || uncertain || conflict}>
            <section className="payment-form-section">
              <h3>기본 정보</h3>
              <label>
                {title} 이름
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={draft.name}
                  onChange={(e) => field('name', e.target.value)}
                />
              </label>
              <div className="form-grid">
                <label>
                  명의
                  <SelectField
                    value={draft.ownerId}
                    onValueChange={(value) => field('ownerId', value as OwnerId)}
                  >
                    <SelectOption value="shared">공동</SelectOption>
                    {data.users.map((u) => (
                      <SelectOption key={u.id} value={u.id}>
                        {u.name}
                      </SelectOption>
                    ))}
                  </SelectField>
                </label>
                {textInput('purpose', '용도')}
              </div>
            </section>
            {editor.type === 'card' ? (
              <>
                <section className="payment-form-section">
                  <h3>결제 설정</h3>
                  <div className="form-grid">
                    {textInput('institution', '카드사')}
                    <label>
                      카드 종류
                      <SelectField
                        value={draft.cardKind ?? 'credit'}
                        onValueChange={(value) => field('cardKind', value as 'credit' | 'debit')}
                      >
                        <SelectOption value="credit">신용카드</SelectOption>
                        <SelectOption value="debit">체크카드</SelectOption>
                      </SelectField>
                    </label>
                  </div>
                  {(draft.cardKind ?? 'credit') === 'credit' && (
                    <div className="form-grid">
                      {(['closingDay', 'paymentDay'] as const).map((key) => (
                        <label key={key}>
                          {key === 'closingDay' ? '사용 마감일' : '대금 납부일'}
                          <input
                            type="number"
                            min="1"
                            max="31"
                            step="1"
                            placeholder="미설정"
                            value={draft[key] ?? ''}
                            onChange={(e) =>
                              field(key, e.target.value === '' ? null : Number(e.target.value))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="small muted">
                    마감일 다음 날부터 다음 마감일까지의 사용액을 모아 납부일에 표시해요. 29~31일이
                    없는 달은 말일로 계산해요.
                  </p>
                  <label>
                    결제 통장
                    <SelectField
                      value={draft.linkedAccountId ?? ''}
                      onValueChange={(value) => field('linkedAccountId', value || null)}
                    >
                      <SelectOption value="">연결 안 함</SelectOption>
                      {data.paymentMethods
                        .filter(
                          (p: ManagedPayment) =>
                            p.type === 'account' && (!p.archived || p.id === draft.linkedAccountId),
                        )
                        .map((p: ManagedPayment) => (
                          <SelectOption key={p.id} value={p.id}>
                            {p.name}
                            {p.archived ? ' (보관)' : ''}
                          </SelectOption>
                        ))}
                    </SelectField>
                  </label>
                </section>
                <section className="payment-form-section">
                  <h3>예산과 혜택</h3>
                  <div className="form-grid">
                    {moneyInput('monthlyBudget', '월 사용 예산 (원)')}
                    {moneyInput('performanceTarget', '실적 기준 (원)')}
                    {moneyInput('creditLimit', '이용 한도 (원)')}
                    {moneyInput('annualFee', '연회비 (원)')}
                    <label>
                      유효기간
                      <MonthField
                        value={draft.expiry ?? ''}
                        onValueChange={(value) => field('expiry', value)}
                      />
                    </label>
                    {textInput('usagePeriodNote', '사용 기간 메모')}
                  </div>
                  <label>
                    혜택 · 실적 제외 조건
                    <textarea
                      rows={3}
                      maxLength={3000}
                      value={draft.benefits ?? ''}
                      onChange={(e) => field('benefits', e.target.value)}
                    />
                  </label>
                </section>
              </>
            ) : (
              <section className="payment-form-section">
                <h3>계좌와 자산 연결</h3>
                {editor.type === 'account' && (
                  <>
                    <div className="form-grid">
                      {textInput('institution', '은행')}
                      {textInput('accountKind', '통장 종류')}
                    </div>
                    {textInput('accountNumber', '계좌번호')}
                  </>
                )}
                <label>
                  연결 자산
                  <SelectField
                    value={draft.assetId ?? ''}
                    onValueChange={(value) => field('assetId', value || null)}
                  >
                    <SelectOption value="">연결 안 함</SelectOption>
                    {data.assets
                      .filter((a) => a.kind === 'asset')
                      .map((a) => (
                        <SelectOption key={a.id} value={a.id}>
                          {a.name}
                        </SelectOption>
                      ))}
                  </SelectField>
                </label>
                <p className="small muted">
                  자산의 현재 잔액을 함께 표시해요. 연결만으로 잔액이나 수입·지출이 추가되지는
                  않아요.
                </p>
              </section>
            )}
            <section className="payment-form-section">
              <h3>메모와 관리</h3>
              <label>
                비고
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={draft.notes ?? ''}
                  onChange={(e) => field('notes', e.target.value)}
                />
              </label>
              {initialPayment && (
                <label className="checkbox payment-archive-control">
                  <input
                    type="checkbox"
                    checked={draft.archived ?? false}
                    onChange={(e) => field('archived', e.target.checked)}
                  />
                  <Archive size={16} /> 보관하기 (기존 거래와 연결은 유지)
                </label>
              )}
            </section>
          </fieldset>
        </div>
        <div className="form-footer">
          <div className="footer-actions">
            <button type="button" className="secondary" disabled={locked} onClick={onClose}>
              닫기
            </button>
            <button className="primary" type="submit" disabled={busy || conflict}>
              {busy ? '저장 중…' : uncertain ? '저장 결과 다시 확인' : '저장'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
