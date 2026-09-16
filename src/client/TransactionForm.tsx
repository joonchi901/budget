import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Info, Trash2 } from 'lucide-react';
import type {
  Bootstrap,
  Transaction,
  TransactionInput,
  TransactionMutation,
  TransactionType,
} from '../shared/types';
import { RequestError, request } from './api';
import { Dialog, labels, ownerName, useUnsavedGuard, won } from './components';

interface Props {
  data: Bootstrap;
  ledgerId: string;
  month: string;
  original?: Transaction;
  onClose(): void;
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
          category: '식비',
          ownerId: 'shared',
          paymentMethodId: data.paymentMethods[0]?.id ?? '',
          tagIds: [],
          assetId: null,
          toAssetId: null,
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
  const rule = data.rules.find((rule) => draft.tagIds.includes(rule.tagId));
  const assets = data.assets.filter((asset) => asset.kind === 'asset');
  const ordinaryTags = data.tags.filter((tag) => !data.rules.some((rule) => rule.tagId === tag.id));
  const matchingRule = data.rules.find(
    (rule) =>
      rule.type ===
      { expense: 'asset-expense', income: 'asset-income', saving: 'saving', transfer: 'transfer' }[
        draft.type
      ],
  );
  const dual = draft.type === 'saving' || draft.type === 'transfer';
  const locked = busy || uncertain;
  const patch = (next: Partial<TransactionInput>) => {
    setDraft((old) => ({ ...old, ...next }));
    setError('');
  };
  const switchType = (type: TransactionType) => {
    const tagIds = draft.tagIds.filter((id) => ordinaryTags.some((tag) => tag.id === id));
    const action = data.rules.find((rule) => rule.type === type);
    if (action) tagIds.push(action.tagId);
    patch({
      type,
      tagIds,
      assetId: null,
      toAssetId: null,
      category: { expense: '식비', income: '급여', saving: '저축', transfer: '이체' }[type],
    });
  };
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
          if (e.current && typeof e.current === 'object' && 'description' in e.current)
            setConflict(e.current as Transaction);
          else setDeleted(true);
        }
        if (e.status === 404) setDeleted(true);
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!conflict && !deleted) void submit();
  };
  const sourceName = data.assets.find((a) => a.id === draft.assetId)?.name ?? '자산 미선택';
  const destName = data.assets.find((a) => a.id === draft.toAssetId)?.name ?? '자산 미선택';
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
          <fieldset disabled={locked || deleted}>
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
              <label>
                분류
                <input
                  name="category"
                  list="categories"
                  required
                  maxLength={80}
                  value={draft.category}
                  onChange={(e) => patch({ category: e.target.value })}
                />
                <datalist id="categories">
                  {[
                    '식비',
                    '외식',
                    '카페',
                    '교통',
                    '생활',
                    '주거',
                    '문화',
                    '여행',
                    '급여',
                    '저축',
                    '이체',
                  ].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </datalist>
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
            <div className="field-label">분석 태그</div>
            <div className="tag-options">
              {ordinaryTags.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  className={`tag-option ${draft.tagIds.includes(tag.id) ? 'active' : ''}`}
                  aria-pressed={draft.tagIds.includes(tag.id)}
                  onClick={() =>
                    patch({
                      tagIds: draft.tagIds.includes(tag.id)
                        ? draft.tagIds.filter((id) => id !== tag.id)
                        : [...draft.tagIds, tag.id],
                    })
                  }
                >
                  # {tag.name}
                </button>
              ))}
            </div>
            <div className="rule-section">
              <div className="field-label">자산 반영 규칙</div>
              {!dual && matchingRule && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="assetRule"
                    checked={Boolean(rule)}
                    onChange={(e) =>
                      patch({
                        tagIds: e.target.checked
                          ? [...draft.tagIds, matchingRule.tagId]
                          : draft.tagIds.filter((id) => id !== matchingRule.tagId),
                        assetId: null,
                        toAssetId: null,
                      })
                    }
                  />
                  {matchingRule.name}
                </label>
              )}
              {dual && (
                <p className="small">
                  #{data.tags.find((tag) => tag.id === matchingRule?.tagId)?.name} 규칙으로 두 자산
                  사이의 금액을 이동해요.
                </p>
              )}
              {rule && (
                <>
                  <div className="form-grid">
                    <label>
                      {draft.type === 'income' ? '입금 자산' : '출금 자산'}
                      <select
                        name="assetId"
                        required
                        value={draft.assetId ?? ''}
                        onChange={(e) => patch({ assetId: e.target.value || null })}
                      >
                        <option value="">선택해 주세요</option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {dual && (
                      <label>
                        입금 자산
                        <select
                          name="toAssetId"
                          required
                          value={draft.toAssetId ?? ''}
                          onChange={(e) => patch({ toAssetId: e.target.value || null })}
                        >
                          <option value="">선택해 주세요</option>
                          {assets
                            .filter((a) => a.id !== draft.assetId)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="effect-preview">
                    <Info size={16} />
                    <span>
                      이 거래의 자산 반영
                      <br />
                      <strong>
                        {sourceName} {draft.type === 'income' ? '+' : '−'}
                        {won(draft.amount)}원
                        {dual && (
                          <>
                            {' '}
                            <ArrowRight size={13} /> {destName} +{won(draft.amount)}원
                          </>
                        )}
                      </strong>
                    </span>
                  </div>
                </>
              )}
              {!rule && (
                <p className="small muted">
                  이 내역은 수입·지출에만 집계돼요. 자산 금액은 바뀌지 않아요.
                </p>
              )}
            </div>
          </fieldset>
        </div>
        <div className="form-footer">
          {original && !uncertain && (
            <button
              type="button"
              className="danger-link"
              disabled={busy || deleted || Boolean(conflict)}
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
                disabled={busy || Boolean(conflict) || deleted}
              >
                {busy ? '저장 중…' : '저장'}
              </button>
            )}
          </div>
        </div>
        {confirmDelete && !uncertain && (
          <div className="delete-confirm">
            <span>이 내역과 연결된 자산 반영을 삭제할까요?</span>
            <button type="button" disabled={busy} onClick={() => void submit(true)}>
              삭제 확인
            </button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
