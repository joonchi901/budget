import { useRef, useState, type FormEvent } from 'react';
import { ArrowRightLeft, History, Plus, Settings2, Wallet } from 'lucide-react';
import type { Asset, AssetOperation, Bootstrap } from '../shared/types';
import { savingsSummary } from '../shared/selectors';
import { request, RequestError } from './api';
import { Dialog, Empty, Stat, ownerName, useUnsavedGuard, won } from './components';
import { TagFields } from './TagFields';
import './assets.css';

type Editor =
  | { type: 'asset'; asset?: Asset }
  | { type: 'transfer' }
  | { type: 'adjustment'; asset: Asset }
  | { type: 'void'; operation: AssetOperation };
interface Props {
  data: Bootstrap;
  month: string;
  onChanged(): Promise<void>;
  onNotice(message: string): void;
}
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export default function AssetsView({ data, month, onChanged, onNotice }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [assetFilter, setAssetFilter] = useState('all');
  const assets = data.assets.filter((a) => a.kind === 'asset');
  const total = assets.reduce((s, a) => s + a.balance, 0);
  const debt = data.assets.filter((a) => a.kind === 'liability').reduce((s, a) => s + a.balance, 0);
  const savings = savingsSummary(data, month);
  const operations = data.assetOperations.filter(
    (op) =>
      op.date.startsWith(month) &&
      (assetFilter === 'all' || [op.assetId, op.fromAssetId, op.toAssetId].includes(assetFilter)),
  );
  const movements = data.assetMovements.filter(
    (m) =>
      m.transactionId &&
      m.date.startsWith(month) &&
      (assetFilter === 'all' || m.assetId === assetFilter),
  );
  const transactionIds = [...new Set(movements.map((m) => m.transactionId!))];
  const history = [
    ...operations.map((op) => ({
      id: op.id,
      date: op.date,
      description: op.description,
      operation: op,
      transactionId: null as string | null,
    })),
    ...transactionIds.map((id) => {
      const row = movements.find((m) => m.transactionId === id)!;
      return {
        id,
        date: row.date,
        description: row.description,
        operation: null,
        transactionId: id,
      };
    }),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return (
    <>
      <div className="asset-hero">
        <div>
          <span className="eyebrow">OUR NET WORTH</span>
          <h2>우리의 순자산</h2>
          <strong>
            {won(total - debt)}
            <small>원</small>
          </strong>
          <p>현재 자산에서 부채를 뺀 금액이에요.</p>
        </div>
        <div className="asset-hero-detail">
          <span>
            전체 자산 <strong>{won(total)}원</strong>
          </span>
          <span>
            전체 부채 <strong>{won(debt)}원</strong>
          </span>
          <div className="asset-stack">
            {assets.map((a) => (
              <span
                key={a.id}
                style={{
                  width: `${total > 0 ? (Math.max(0, a.balance) / total) * 100 : 0}%`,
                  background: a.color,
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>자산과 부채</h2>
          <span className="muted small">예비금·투자금·전세금 등 원하는 항목으로 관리해요.</span>
        </div>
        <div className="asset-actions">
          <button
            className="secondary"
            onClick={() => setEditor({ type: 'transfer' })}
            disabled={assets.length < 2}
          >
            <ArrowRightLeft size={16} />
            자산 이동
          </button>
          <button className="primary" onClick={() => setEditor({ type: 'asset' })}>
            <Plus size={16} />
            자산 추가
          </button>
        </div>
      </div>
      <div className="asset-grid">
        {data.assets.map((a) => (
          <section className="panel asset-card" key={a.id}>
            <div className="asset-card-heading">
              <span className="asset-icon" style={{ background: `${a.color}18`, color: a.color }}>
                <Wallet size={21} />
              </span>
              <button
                className="icon-button"
                aria-label={`${a.name} 설정`}
                onClick={() => setEditor({ type: 'asset', asset: a })}
              >
                <Settings2 size={17} />
              </button>
            </div>
            <h3>
              {a.name} {a.kind === 'liability' && <span className="badge">부채</span>}
            </h3>
            <strong className="asset-balance" data-testid={`asset-${a.id}`}>
              {won(a.balance)}
              <small>원</small>
            </strong>
            <div className="row-tags">
              {a.trackSavings && <span className="savings-badge">저축 집계</span>}
              {a.tagIds.map((id) => {
                const t = data.tags.find((t) => t.id === id);
                return t && <span key={id}>#{t.name}</span>;
              })}
            </div>
            <div className="asset-detail">
              <span>최초 기준 잔액</span>
              <span>{won(a.openingBalance)}원</span>
            </div>
            <div className="asset-detail">
              <span>누적 변동</span>
              <span>
                {a.balance - a.openingBalance > 0 ? '+' : ''}
                {won(a.balance - a.openingBalance)}원
              </span>
            </div>
            <button
              className="text-button asset-adjust"
              onClick={() => setEditor({ type: 'adjustment', asset: a })}
            >
              현재 잔액 맞추기
            </button>
          </section>
        ))}
      </div>
      <div className="section-heading">
        <h2>이번 달 저축</h2>
        <span className="muted small">{month} · 저축 집계로 지정한 자산의 실제 변동</span>
      </div>
      <section className="stats-grid three">
        <Stat label="저축 유입" amount={savings.inflow} hint="저축 자산에 새로 들어온 금액" />
        <Stat label="저축 인출" amount={savings.outflow} hint="저축 자산에서 나간 금액" />
        <Stat label="순저축" amount={savings.net} hint="유입 − 인출" accent />
      </section>
      <p className="small muted">
        저축 자산끼리의 이동, 최초 잔액, 잔액 조정은 저축 실적에 포함하지 않아요. 저축 집계 설정을
        바꾸면 이후 새 변동부터 적용돼요.
      </p>
      <section className="panel asset-history">
        <div className="panel-title">
          <h2>
            <History size={18} /> 자산 변동 내역
          </h2>
          <select
            aria-label="변동 내역 자산"
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
          >
            <option value="all">전체 자산</option>
            {data.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {history.map((row) => {
          const op = row.operation;
          const effects = data.assetMovements
            .filter((m) => (op ? m.operationId === op.id : m.transactionId === row.transactionId))
            .filter((m) => assetFilter === 'all' || m.assetId === assetFilter);
          return (
            <div className={`history-row ${op?.deletedAt ? 'voided' : ''}`} key={row.id}>
              <div>
                <span className="small muted">
                  {row.date} ·{' '}
                  {op ? (op.type === 'transfer' ? '자산 이동' : '잔액 조정') : '수입·지출 연결'}{' '}
                  {op?.deletedAt ? '· 취소됨' : ''}
                </span>
                <strong>{row.description}</strong>
                <div className="history-effects">
                  {effects.map((m) => (
                    <span key={m.id}>
                      {data.assets.find((a) => a.id === m.assetId)?.name}{' '}
                      <b>
                        {m.amount > 0 ? '+' : ''}
                        {won(m.amount)}원
                      </b>
                    </span>
                  ))}
                  {op?.deletedAt && <span>잔액 반영이 취소되었어요.</span>}
                </div>
                <span className="small muted">
                  {ownerName(op?.createdBy ?? effects[0]?.actorId ?? 'shared')} 기록
                </span>
              </div>
              {op && !op.deletedAt ? (
                <button
                  className="text-button"
                  aria-label={`${op.description} 취소`}
                  onClick={() => setEditor({ type: 'void', operation: op })}
                >
                  취소
                </button>
              ) : !op ? (
                <span className="small muted">원본 가계부에서 수정</span>
              ) : null}
            </div>
          );
        })}
        {!history.length && <Empty>이 달의 자산 변동이 없어요.</Empty>}
      </section>
      {editor && (
        <AssetEditor
          key={
            editor.type +
            ('asset' in editor
              ? (editor.asset?.id ?? 'new')
              : 'operation' in editor
                ? editor.operation.id
                : '')
          }
          data={data}
          editor={editor}
          onClose={() => setEditor(null)}
          onChanged={onChanged}
          onSaved={async () => {
            setEditor(null);
            onNotice('자산에 반영했어요.');
            await onChanged();
          }}
        />
      )}
    </>
  );
}

function AssetEditor({
  data,
  editor,
  onClose,
  onChanged,
  onSaved,
}: {
  data: Bootstrap;
  editor: Editor;
  onClose(): void;
  onChanged(): Promise<void>;
  onSaved(): Promise<void>;
}) {
  const asset = 'asset' in editor ? editor.asset : undefined;
  const [name, setName] = useState(asset?.name ?? '');
  const [kind, setKind] = useState<'asset' | 'liability'>(asset?.kind ?? 'asset');
  const [color, setColor] = useState(asset?.color ?? '#31725f');
  const [tagIds, setTagIds] = useState(asset?.tagIds ?? []);
  const [tracking, setTracking] = useState(asset?.trackSavings ?? false);
  const [amount, setAmount] = useState(editor.type === 'adjustment' ? editor.asset.balance : 0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(localDate);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [tagPending, setTagPending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const pending = useRef<{ url: string; method: string; body: unknown } | null>(null);
  const [versions, setVersions] = useState(
    Object.fromEntries(data.assets.map((a) => [a.id, a.version])),
  );
  const [operationVersion, setOperationVersion] = useState(
    editor.type === 'void' ? editor.operation.version : undefined,
  );
  const [balances, setBalances] = useState(
    Object.fromEntries(data.assets.map((a) => [a.id, a.balance])),
  );
  const [baseBalance, setBaseBalance] = useState(asset?.balance ?? 0);
  const [assetVersion, setAssetVersion] = useState(asset?.version);
  const snapshot = JSON.stringify({
    name,
    kind,
    color,
    tagIds,
    tracking,
    amount,
    from,
    to,
    date,
    description,
  });
  const initial = useRef(snapshot);
  useUnsavedGuard(busy || uncertain || tagPending || snapshot !== initial.current);
  const locked = busy || uncertain || tagPending;
  const title =
    editor.type === 'asset'
      ? asset
        ? '자산 설정'
        : '자산 추가'
      : editor.type === 'transfer'
        ? '자산 이동'
        : editor.type === 'void'
          ? '자산 변동 취소'
          : '현재 잔액 맞추기';
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || tagPending || conflict) return;
    if (!pending.current) {
      const mutationId = crypto.randomUUID();
      if (editor.type === 'asset')
        pending.current = {
          url: asset ? `/api/assets/${asset.id}` : '/api/assets',
          method: asset ? 'PATCH' : 'POST',
          body: {
            mutationId,
            expectedVersion: assetVersion,
            name,
            color,
            tagIds,
            trackSavings: kind === 'asset' && tracking,
            ...(!asset ? { kind, openingBalance: amount } : {}),
          },
        };
      else if (editor.type === 'void')
        pending.current = {
          url: `/api/asset-operations/${editor.operation.id}`,
          method: 'DELETE',
          body: { mutationId, expectedVersion: operationVersion },
        };
      else
        pending.current = {
          url: '/api/asset-operations',
          method: 'POST',
          body: {
            mutationId,
            type: editor.type,
            date,
            description,
            ...(editor.type === 'transfer'
              ? {
                  fromAssetId: from,
                  toAssetId: to,
                  amount,
                  expectedAssetVersions: { [from]: versions[from], [to]: versions[to] },
                }
              : {
                  assetId: editor.asset.id,
                  targetBalance: amount,
                  expectedAssetVersions: { [editor.asset.id]: versions[editor.asset.id] },
                }),
          },
        };
    }
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
        if (e.status === 409 || (e.status === 404 && editor.type === 'void')) {
          setConflict(true);
          await onChanged();
        }
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  async function reloadLatest() {
    setBusy(true);
    setError('');
    try {
      const fresh = await request<Bootstrap>('/api/bootstrap');
      setVersions(Object.fromEntries(fresh.assets.map((a) => [a.id, a.version])));
      setBalances(Object.fromEntries(fresh.assets.map((a) => [a.id, a.balance])));
      if (editor.type === 'void') {
        const currentOperation = fresh.assetOperations.find((op) => op.id === editor.operation.id);
        if (!currentOperation || currentOperation.deletedAt) {
          await onChanged();
          onClose();
          return;
        }
        setOperationVersion(currentOperation.version);
      }
      const current = fresh.assets.find((a) => a.id === asset?.id);
      if (current) {
        setAssetVersion(current.version);
        setBaseBalance(current.balance);
        if (editor.type === 'asset') {
          setName(current.name);
          setColor(current.color);
          setTagIds(current.tagIds);
          setTracking(current.trackSavings);
        } else if (editor.type === 'adjustment') setAmount(current.balance);
      }
      setConflict(false);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={title} subtitle={asset?.name} onClose={onClose} locked={locked}>
      <form onSubmit={(e) => void submit(e)}>
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
              <p>최신 잔액과 설정을 불러온 다음 다시 확인해 주세요.</p>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void reloadLatest()}
              >
                최신 자산 불러오기
              </button>
            </div>
          )}
          <fieldset disabled={busy || uncertain || conflict}>
            {editor.type === 'asset' ? (
              <>
                <label>
                  자산 이름
                  <input
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </label>
                <div className="form-grid">
                  {!asset && (
                    <label>
                      종류
                      <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                        <option value="asset">자산</option>
                        <option value="liability">부채</option>
                      </select>
                    </label>
                  )}
                  <label>
                    표시 색상
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                  </label>
                </div>
                {!asset && (
                  <label>
                    최초 잔액
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="1000000000000"
                      step="1"
                      required
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                    />
                    <span className="small muted">
                      최초 잔액은 수입이나 저축 실적에 포함하지 않아요.
                    </span>
                  </label>
                )}
                {kind === 'asset' && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={tracking}
                      onChange={(e) => setTracking(e.target.checked)}
                    />
                    이 자산의 유입·인출을 저축으로 집계
                  </label>
                )}
                <p className="small muted">
                  저축 집계 설정은 이후 새 변동부터 적용해요. 자산 이름이나 태그를 바꿔도 과거
                  집계는 바뀌지 않아요.
                </p>
                <TagFields
                  data={data}
                  value={tagIds}
                  onChange={setTagIds}
                  appliesTo="asset"
                  onChanged={onChanged}
                  onPendingChange={setTagPending}
                  disabled={busy || uncertain}
                />
              </>
            ) : editor.type === 'void' ? (
              <div className="effect-preview">
                <span>
                  <strong>{editor.operation.description}</strong>
                  <br />이 변동의 잔액 반영을 되돌려요. 기록은 취소 상태로 남고 수입·지출 합계는
                  바뀌지 않아요.
                </span>
              </div>
            ) : (
              <>
                {editor.type === 'transfer' && (
                  <div className="form-grid">
                    <label>
                      보내는 자산
                      <select required value={from} onChange={(e) => setFrom(e.target.value)}>
                        <option value="">선택해 주세요</option>
                        {data.assets
                          .filter((a) => a.kind === 'asset')
                          .map((a) => (
                            <option key={a.id} value={a.id} disabled={a.id === to}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      받는 자산
                      <select required value={to} onChange={(e) => setTo(e.target.value)}>
                        <option value="">선택해 주세요</option>
                        {data.assets
                          .filter((a) => a.kind === 'asset')
                          .map((a) => (
                            <option key={a.id} value={a.id} disabled={a.id === from}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                )}
                <label>
                  {editor.type === 'transfer' ? '이동 금액' : '맞출 잔액'}
                  <input
                    type="number"
                    inputMode="numeric"
                    required
                    min={editor.type === 'transfer' ? 1 : 0}
                    max="1000000000000"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </label>
                {editor.type === 'transfer' && from && to && (
                  <div className="effect-preview">
                    <span>
                      {data.assets.find((a) => a.id === from)?.name}: {won(balances[from] ?? 0)}원 →{' '}
                      {won((balances[from] ?? 0) - amount)}원<br />
                      {data.assets.find((a) => a.id === to)?.name}: {won(balances[to] ?? 0)}원 →{' '}
                      {won((balances[to] ?? 0) + amount)}원
                    </span>
                  </div>
                )}
                {editor.type === 'adjustment' && (
                  <div className="effect-preview">
                    <span>
                      현재 {won(baseBalance)}원 → 변경 후 {won(amount)}원<br />
                      <strong>
                        조정액 {amount - baseBalance > 0 ? '+' : ''}
                        {won(amount - baseBalance)}원
                      </strong>
                      <br />
                      차액과 사유를 기록하고, 수입·지출·저축 실적에는 포함하지 않아요.
                    </span>
                  </div>
                )}
                <label>
                  날짜
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  {editor.type === 'transfer' ? '이동 내용' : '조정 사유'}
                  <input
                    required
                    maxLength={240}
                    placeholder={
                      editor.type === 'transfer' ? '예: 적금 납입' : '예: 월말 실제 잔액 확인'
                    }
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                {editor.type === 'transfer' && (
                  <p className="small muted">
                    두 자산 사이에서 금액을 옮겨요. 가계부 수입·지출에는 추가하지 않아요.
                  </p>
                )}
              </>
            )}
          </fieldset>
        </div>
        <div className="form-footer">
          <div className="footer-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={locked}>
              닫기
            </button>
            <button className="primary" type="submit" disabled={busy || tagPending || conflict}>
              {busy
                ? '반영 중…'
                : uncertain
                  ? '저장 결과 다시 확인'
                  : editor.type === 'void'
                    ? '변동 취소 확인'
                    : '저장'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
