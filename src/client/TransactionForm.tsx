import { useRef, useState, type FormEvent } from 'react';
import { Info, Plus, Trash2 } from 'lucide-react';
import type {
  Bootstrap,
  Transaction,
  TransactionInput,
  TransactionMutation,
  TransactionType,
} from '../shared/types';
import { RequestError, request } from './api';
import { Dialog, labels, ownerName, useUnsavedGuard, won } from './components';
import { TagFields } from './TagFields';

interface Props {
  data: Bootstrap;
  ledgerId: string;
  month: string;
  original?: Transaction;
  onClose(): void;
  onChanged(): Promise<void>;
  onSaved(message: string): void;
  presence(id: string | null, field: string | null): void;
}
export default function TransactionForm({
  data,
  ledgerId,
  month,
  original,
  onClose,
  onSaved,
  presence,
  onChanged,
}: Props) {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [draft, setDraft] = useState<TransactionInput>(
    original
      ? { ...original }
      : {
          ledgerId,
          date: date.startsWith(month) ? date : `${month}-01`,
          description: '',
          amount: 0,
          type: 'expense',
          ownerId: 'shared',
          paymentMethodId: data.paymentMethods[0]?.id ?? '',
          tagIds: [],
          allocations: [],
        },
  );
  const [version, setVersion] = useState(original?.version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Transaction | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const initialDraft = useRef(JSON.stringify(draft));
  useUnsavedGuard(busy || uncertain || JSON.stringify(draft) !== initialDraft.current);
  const pending = useRef<{ url: string; method: string; body: unknown; deleting: boolean } | null>(
    null,
  );
  const [tagPending, setTagPending] = useState(false);
  const assets = data.assets.filter((asset) => asset.kind === 'asset');
  const allocated = draft.allocations.reduce((sum, row) => sum + row.amount, 0);
  const locked = busy || uncertain || tagPending;
  const patch = (next: Partial<TransactionInput>) => {
    setDraft((old) => ({ ...old, ...next }));
    setError('');
  };
  const switchType = (type: TransactionType) => patch({ type });
  async function submit(deleting = false) {
    if (!pending.current)
      pending.current = deleting
        ? {
            url: `/api/transactions/${original!.id}`,
            method: 'DELETE',
            body: { mutationId: crypto.randomUUID(), expectedVersion: version },
            deleting: true,
          }
        : {
            url: '/api/transactions',
            method: 'POST',
            body: {
              mutationId: crypto.randomUUID(),
              expectedVersion: version,
              transaction: draft,
            } satisfies TransactionMutation,
            deleting: false,
          };
    const op = pending.current;
    setBusy(true);
    setError('');
    try {
      await request(op.url, op.method, op.body);
      pending.current = null;
      onSaved(
        op.deleting ? '내역을 삭제했어요. 자산 반영도 함께 취소했어요.' : '내역을 저장했어요.',
      );
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.status > 0 && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        if (e.status === 409) {
          if (
            e.current &&
            typeof e.current === 'object' &&
            'allocations' in e.current &&
            (e.current as Transaction).version !== version
          )
            setConflict(e.current as Transaction);
          else if (original && !e.current && e.code === 'VERSION_CONFLICT') setDeleted(true);
          else {
            await onChanged();
            setError('태그나 자산 설정이 변경되었어요. 입력을 확인한 뒤 다시 저장해 주세요.');
          }
        }
        if (e.status === 404) setDeleted(true);
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (locked || conflict || deleted) return;
    if (draft.allocations.length && allocated !== draft.amount) {
      setError('자산에 나눈 금액의 합계가 내역 금액과 같아야 해요.');
      return;
    }
    void submit();
  };
  return (
    <Dialog
      title={original ? '내역 수정' : '새 내역'}
      subtitle={`${data.ledgers.find((l) => l.id === ledgerId)?.name}에 기록해요`}
      onClose={onClose}
      locked={locked}
    >
      <form
        onSubmit={onSubmit}
        onFocus={(e) =>
          presence(
            original?.id ?? null,
            e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement
              ? e.target.name || null
              : null,
          )
        }
      >
        <div className="form-body">
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {uncertain && (
            <div className="alert">
              저장 결과를 아직 확인하지 못했어요. 같은 요청을 다시 확인하면 중복 저장을 막을 수
              있어요.
            </div>
          )}
          {conflict && (
            <div className="conflict">
              <strong>상대방이 먼저 수정했어요</strong>
              <p>
                내 입력: {draft.description} · {won(draft.amount)}원<br />
                최신 내용: {conflict.description} · {won(conflict.amount)}원
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDraft({ ...conflict });
                  setVersion(conflict.version);
                  setConflict(null);
                  setError('');
                }}
              >
                최신 내용 불러오기
              </button>
              <p className="small muted">
                불러오면 현재 입력을 최신 내용으로 바꿔요. 확인 후 다시 수정할 수 있어요.
              </p>
            </div>
          )}
          {deleted && (
            <div className="alert">
              이 내역이 삭제되었거나 변경 상태를 확인할 수 없어요. 창을 닫고 목록에서 다시 확인해
              주세요.
            </div>
          )}
          <fieldset disabled={busy || uncertain || deleted}>
            <div className="segmented" aria-label="거래 종류">
              {(Object.keys(labels) as TransactionType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={draft.type === type}
                  className={draft.type === type ? 'selected' : ''}
                  onClick={() => switchType(type)}
                >
                  {labels[type]}
                </button>
              ))}
            </div>
            <label className="amount-field">
              금액
              <div>
                <input
                  name="amount"
                  aria-label="금액"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="1000000000000"
                  step="1"
                  required
                  value={draft.amount || ''}
                  onChange={(e) => patch({ amount: Number(e.target.value) })}
                  placeholder="0"
                  autoFocus={!original}
                />
                <span>원</span>
              </div>
            </label>
            <label>
              내용
              <input
                name="description"
                required
                maxLength={240}
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="어디에 사용했나요?"
              />
            </label>
            <div className="form-grid">
              <label>
                날짜
                <input
                  name="date"
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => patch({ date: e.target.value })}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                누구의 내역인가요?
                <select
                  name="ownerId"
                  value={draft.ownerId}
                  onChange={(e) =>
                    patch({ ownerId: e.target.value as TransactionInput['ownerId'] })
                  }
                >
                  {['shared', 'u1', 'u2'].map((id) => (
                    <option key={id} value={id}>
                      {ownerName(id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                결제수단
                <select
                  name="paymentMethodId"
                  value={draft.paymentMethodId}
                  onChange={(e) => patch({ paymentMethodId: e.target.value })}
                >
                  {data.paymentMethods.map((method) => (
                    <option value={method.id} key={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <TagFields
              data={data}
              value={draft.tagIds}
              onChange={(tagIds) => patch({ tagIds })}
              appliesTo="transaction"
              ledgerId={ledgerId}
              disabled={busy || uncertain}
              onChanged={onChanged}
              onPendingChange={setTagPending}
            />
            <div className="rule-section">
              <div className="panel-title">
                <div className="field-label">
                  {draft.type === 'income' ? '입금할 자산' : '사용한 자산'}
                </div>
                <button
                  type="button"
                  className="text-button"
                  disabled={draft.allocations.length >= assets.length}
                  onClick={() =>
                    patch({
                      allocations: [
                        ...draft.allocations,
                        { assetId: '', amount: Math.max(0, draft.amount - allocated) },
                      ],
                    })
                  }
                >
                  <Plus size={14} /> 자산 배분 추가
                </button>
              </div>
              <p className="small muted">
                자산을 선택하면 잔액에도 함께 반영해요. 여러 자산으로 금액을 나눌 수 있어요.
              </p>
              {draft.allocations.map((allocation, index) => (
                <div className="allocation-row" key={index}>
                  <label>
                    {draft.type === 'income' ? '입금 자산' : '출금 자산'} {index + 1}
                    <select
                      name="allocationAsset"
                      required
                      value={allocation.assetId}
                      onChange={(e) =>
                        patch({
                          allocations: draft.allocations.map((row, i) =>
                            i === index ? { ...row, assetId: e.target.value } : row,
                          ),
                        })
                      }
                    >
                      <option value="">선택해 주세요</option>
                      {assets
                        .filter(
                          (asset) =>
                            asset.id === allocation.assetId ||
                            !draft.allocations.some((row) => row.assetId === asset.id),
                        )
                        .map((asset) => (
                          <option value={asset.id} key={asset.id}>
                            {asset.name}
                            {asset.trackSavings ? ' · 저축 집계' : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    배분 금액 {index + 1}
                    <input
                      name="allocationAmount"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="1000000000000"
                      step="1"
                      required
                      value={allocation.amount || ''}
                      onChange={(e) =>
                        patch({
                          allocations: draft.allocations.map((row, i) =>
                            i === index ? { ...row, amount: Number(e.target.value) } : row,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`자산 배분 ${index + 1} 삭제`}
                    onClick={() =>
                      patch({ allocations: draft.allocations.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              <div className="effect-preview">
                <Info size={16} />
                <span>
                  {draft.allocations.length ? (
                    <>
                      배분 합계 <strong>{won(allocated)}원</strong> / 내역 {won(draft.amount)}원
                      <br />
                      {allocated !== draft.amount
                        ? `남은 배분 ${won(draft.amount - allocated)}원`
                        : '내역은 한 번만 집계하고, 자산별 잔액을 반영해요.'}
                    </>
                  ) : (
                    '자산 배분을 추가하지 않으면 수입·지출만 기록해요.'
                  )}
                </span>
              </div>
              <p className="small muted">
                태그 이름이나 선택만으로 잔액이 바뀌지는 않아요. 자산 간 이동과 잔액 조정은 자산
                화면에서 기록해요.
              </p>
            </div>
          </fieldset>
        </div>
        <div className="form-footer">
          {original && !uncertain && (
            <button
              type="button"
              className="danger-link"
              disabled={locked || deleted || Boolean(conflict)}
              onClick={() => setConfirmDelete(!confirmDelete)}
            >
              <Trash2 size={16} />
              삭제
            </button>
          )}
          <div className="footer-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={locked}>
              닫기
            </button>
            {uncertain ? (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void submit()}
              >
                저장 결과 다시 확인
              </button>
            ) : (
              <button
                className="primary"
                type="submit"
                disabled={locked || Boolean(conflict) || deleted}
              >
                {busy ? '저장 중…' : '저장'}
              </button>
            )}
          </div>
        </div>
        {confirmDelete && !uncertain && (
          <div className="delete-confirm">
            <span>이 내역과 연결된 자산 반영을 삭제할까요?</span>
            <button type="button" disabled={locked} onClick={() => void submit(true)}>
              삭제 확인
            </button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
