import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Info, Plus, Trash2 } from 'lucide-react';
import type {
  Bootstrap,
  Transaction,
  TransactionInput,
  TransactionMutation,
  TransactionType,
  MutationResult,
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
interface PendingTransaction {
  url: string;
  method: 'POST' | 'DELETE';
  body: TransactionMutation | { mutationId: string; expectedVersion?: number };
  deleting: boolean;
  automatic: boolean;
}
interface DeviceDraft {
  draft: TransactionInput;
  version?: number;
  pending: PendingTransaction | null;
}
function inputOf(value: TransactionInput): TransactionInput {
  return {
    ...(value.id ? { id: value.id } : {}),
    ledgerId: value.ledgerId,
    date: value.date,
    description: value.description,
    amount: value.amount,
    type: value.type,
    ownerId: value.ownerId,
    paymentMethodId: value.paymentMethodId,
    tagIds: [...value.tagIds],
    allocations: value.allocations.map((a) => ({ assetId: a.assetId, amount: a.amount })),
  };
}
function readDeviceDraft(key: string, ledgerId: string, originalId?: string): DeviceDraft | null {
  try {
    const stored = localStorage.getItem(key);
    if (!stored || stored.length > 100000) return null;
    const box = JSON.parse(stored) as DeviceDraft,
      row = box.draft;
    if (
      !row ||
      row.ledgerId !== ledgerId ||
      row.id !== originalId ||
      typeof row.date !== 'string' ||
      typeof row.description !== 'string' ||
      row.description.length > 240 ||
      typeof row.amount !== 'number' ||
      !Number.isFinite(row.amount) ||
      !['income', 'expense'].includes(row.type) ||
      !['u1', 'u2', 'shared'].includes(row.ownerId) ||
      typeof row.paymentMethodId !== 'string' ||
      !Array.isArray(row.tagIds) ||
      row.tagIds.length > 100 ||
      !row.tagIds.every((id) => typeof id === 'string') ||
      !Array.isArray(row.allocations) ||
      row.allocations.length > 30 ||
      !row.allocations.every(
        (a) =>
          a &&
          typeof a.assetId === 'string' &&
          typeof a.amount === 'number' &&
          Number.isFinite(a.amount),
      )
    )
      return null;
    if (box.version !== undefined && (!Number.isSafeInteger(box.version) || box.version < 1))
      return null;
    if (box.pending) {
      const op = box.pending;
      if (
        !op.body ||
        typeof op.body.mutationId !== 'string' ||
        !/^[a-zA-Z0-9_-]+$/.test(op.body.mutationId) ||
        typeof op.automatic !== 'boolean'
      )
        return null;
      if (op.deleting) {
        if (!originalId || op.method !== 'DELETE' || op.url !== `/api/transactions/${originalId}`)
          return null;
      } else {
        if (
          op.method !== 'POST' ||
          op.url !== '/api/transactions' ||
          !('transaction' in op.body) ||
          JSON.stringify(inputOf(op.body.transaction)) !== JSON.stringify(inputOf(row))
        )
          return null;
      }
    }
    return { draft: inputOf(row), version: box.version, pending: box.pending ?? null };
  } catch {
    return null;
  }
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
  const starting: TransactionInput = original
    ? inputOf(original)
    : {
        ledgerId,
        date: date.startsWith(month) ? date : `${month}-01`,
        description: '',
        amount: 0,
        type: 'expense',
        ownerId: 'shared',
        paymentMethodId: data.paymentMethods.find((p) => !p.archived)?.id ?? '',
        tagIds: [],
        allocations: [],
      };
  const household =
    (data as Bootstrap & { householdId?: string }).householdId ??
    `${data.mode}:${data.ledgers.find((l) => l.kind === 'main')?.id ?? ledgerId}`;
  const deviceKey = `budget:transaction-draft:v1:${encodeURIComponent(household)}:${data.user.id}:${encodeURIComponent(ledgerId)}:${original?.id ?? 'new'}`;
  const [restored] = useState(() => readDeviceDraft(deviceKey, ledgerId, original?.id));
  const [draft, setDraft] = useState<TransactionInput>(restored?.draft ?? starting);
  const [version, setVersion] = useState(restored?.version ?? original?.version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Transaction | null>(
    restored && original && !restored.pending && restored.version !== original.version
      ? original
      : null,
  );
  const [deleted, setDeleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uncertain, setUncertain] = useState(Boolean(restored?.pending));
  const [restoredNotice, setRestoredNotice] = useState(Boolean(restored));
  const [localAvailable, setLocalAvailable] = useState(true);
  const [autoSave, setAutoSave] = useState(Boolean(original));
  const [autoPaused, setAutoPaused] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const initialDraft = useRef(JSON.stringify(starting));
  const pending = useRef<PendingTransaction | null>(restored?.pending ?? null);
  const inFlight = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSubmit = useRef<(automatic: boolean) => void>(() => {});
  const formRef = useRef<HTMLFormElement>(null);
  const [tagPending, setTagPending] = useState(false);
  const assets = data.assets.filter(
    (asset) =>
      asset.kind === 'asset' &&
      (!asset.archived || original?.allocations.some((a) => a.assetId === asset.id)),
  );
  const allocated = draft.allocations.reduce((sum, row) => sum + row.amount, 0);
  const locked = busy || uncertain || tagPending;
  const dirty = JSON.stringify(draft) !== initialDraft.current;
  useUnsavedGuard(busy || uncertain || dirty);
  function cancelAutoSave() {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
  }
  function persist(row = draft, currentVersion = version, op = pending.current) {
    try {
      if (op || JSON.stringify(row) !== initialDraft.current)
        localStorage.setItem(
          deviceKey,
          JSON.stringify({
            draft: row,
            version: currentVersion,
            pending: op,
          } satisfies DeviceDraft),
        );
      else localStorage.removeItem(deviceKey);
    } catch {
      setLocalAvailable(false);
    }
  }
  useEffect(() => {
    persist();
  }, [draft, version, uncertain, deviceKey]);
  useEffect(() => () => cancelAutoSave(), []);
  useEffect(() => {
    if (
      original &&
      !inFlight.current &&
      !uncertain &&
      !data.transactions.some((row) => row.id === original.id)
    ) {
      cancelAutoSave();
      setDeleted(true);
      setAutoPaused(true);
    }
  }, [data.transactions, original?.id, uncertain, busy]);
  function scheduleAutoSave() {
    cancelAutoSave();
    autoTimer.current = setTimeout(() => latestSubmit.current(true), 800);
  }
  const patch = (next: Partial<TransactionInput>, committed = false) => {
    cancelAutoSave();
    setDraft((old) => ({ ...old, ...next }));
    setSaveStatus('');
    setError('');
    if (
      committed ||
      ['type', 'ownerId', 'paymentMethodId', 'tagIds'].some((key) => Object.hasOwn(next, key))
    )
      scheduleAutoSave();
  };
  const switchType = (type: TransactionType) => patch({ type });
  function validInput() {
    const parsed = new Date(`${draft.date}T00:00:00Z`);
    return (
      draft.description.trim().length > 0 &&
      draft.description.length <= 240 &&
      Number.isSafeInteger(draft.amount) &&
      draft.amount > 0 &&
      draft.amount <= 1000000000000 &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === draft.date &&
      Boolean(draft.paymentMethodId) &&
      draft.allocations.every(
        (row) => Boolean(row.assetId) && Number.isSafeInteger(row.amount) && row.amount > 0,
      ) &&
      (!draft.allocations.length || allocated === draft.amount) &&
      (formRef.current?.checkValidity() ?? false)
    );
  }
  async function submit(deleting = false, automatic = false) {
    cancelAutoSave();
    if (
      inFlight.current ||
      tagPending ||
      conflict ||
      deleted ||
      (automatic && (!autoSave || autoPaused || uncertain || confirmDelete))
    )
      return;
    if (!deleting && !pending.current && !validInput()) {
      if (!automatic) setError('날짜·내용·금액과 자산 배분 합계를 확인해 주세요.');
      return;
    }
    if (!deleting && !pending.current && original && !dirty) {
      if (!automatic) onSaved('내역을 저장했어요.');
      return;
    }
    if (!pending.current)
      pending.current = deleting
        ? {
            url: `/api/transactions/${original!.id}`,
            method: 'DELETE',
            body: { mutationId: crypto.randomUUID(), expectedVersion: version },
            deleting: true,
            automatic: false,
          }
        : {
            url: '/api/transactions',
            method: 'POST',
            body: {
              mutationId: crypto.randomUUID(),
              expectedVersion: version,
              transaction: inputOf(draft),
            },
            deleting: false,
            automatic,
          };
    const op = pending.current;
    persist(draft, version, op);
    inFlight.current = true;
    setBusy(true);
    setError('');
    setSaveStatus(op.automatic ? '자동 저장 중…' : '저장 중…');
    let committed = false;
    try {
      const result = await request<MutationResult>(op.url, op.method, op.body);
      if (!op.deleting && !result.transaction)
        throw new RequestError(
          '저장 결과의 원본 기록을 확인할 수 없어요. 같은 요청으로 다시 확인해 주세요.',
          503,
          'INCOMPLETE_RESPONSE',
        );
      committed = true;
      pending.current = null;
      setUncertain(false);
      setRestoredNotice(false);
      setAutoPaused(false);
      if (result.transaction) {
        const saved = inputOf(result.transaction);
        initialDraft.current = JSON.stringify(saved);
        setDraft(saved);
        setVersion(result.transaction.version);
        persist(saved, result.transaction.version, null);
      } else {
        try {
          localStorage.removeItem(deviceKey);
        } catch {
          setLocalAvailable(false);
        }
      }
      setSaveStatus(op.automatic ? '자동 저장됨' : '저장됨');
      // A new entry closes after its first confirmed write so another blur cannot create it again.
      if (op.automatic && original && !op.deleting) await onChanged();
      else
        onSaved(
          op.deleting
            ? '내역을 삭제했어요. 자산 반영도 함께 취소했어요.'
            : op.automatic
              ? '새 내역을 자동 저장했어요.'
              : '내역을 저장했어요.',
        );
    } catch (e) {
      if (committed) {
        setError('내역은 저장됐어요. 목록을 새로 고침해 주세요.');
        return;
      }
      setError((e as Error).message);
      setSaveStatus('저장 확인 필요');
      if (e instanceof RequestError && e.status > 0 && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        setAutoPaused(true);
        persist(draft, version, null);
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
      } else {
        setUncertain(true);
        persist(draft, version, op);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  latestSubmit.current = (automatic) => {
    void submit(false, automatic);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (locked || conflict || deleted) return;
    void submit();
  };
  function close() {
    cancelAutoSave();
    persist();
    onClose();
  }
  function discardDraft() {
    if (pending.current || busy) return;
    cancelAutoSave();
    const newest = original ? data.transactions.find((row) => row.id === original.id) : null;
    const reset = newest ? inputOf(newest) : starting;
    initialDraft.current = JSON.stringify(reset);
    setDraft(reset);
    setVersion(newest?.version ?? original?.version);
    setRestoredNotice(false);
    setConflict(null);
    setAutoPaused(false);
    setError('');
    persist(reset, newest?.version ?? original?.version, null);
  }
  return (
    <Dialog
      title={original ? '내역 수정' : '새 내역'}
      subtitle={`${data.ledgers.find((l) => l.id === ledgerId)?.name}에 기록해요`}
      onClose={close}
      locked={locked}
    >
      <form
        ref={formRef}
        onSubmit={onSubmit}
        onBlurCapture={scheduleAutoSave}
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
          {!localAvailable && (
            <div className="alert">
              이 브라우저에서 기기 초안을 보관하지 못했어요. 창을 닫기 전에 저장해 주세요.
            </div>
          )}
          {restoredNotice && (
            <div className="alert">
              <strong>이 기기의 초안을 복원했어요.</strong>
              <p>
                {uncertain
                  ? '확인되지 않은 저장 요청도 함께 복원했어요. 같은 요청으로 결과를 확인해 주세요.'
                  : '입력 내용을 확인한 뒤 계속 작성할 수 있어요.'}
              </p>
              {!uncertain && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={discardDraft}
                >
                  복원한 초안 버리기
                </button>
              )}
            </div>
          )}
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
                  cancelAutoSave();
                  const latest = inputOf(conflict);
                  initialDraft.current = JSON.stringify(latest);
                  setDraft(latest);
                  setVersion(conflict.version);
                  persist(latest, conflict.version, null);
                  setAutoPaused(false);
                  setRestoredNotice(false);
                  setSaveStatus('최신 기록을 불러왔어요');
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
                  {data.paymentMethods
                    .filter((method) => !method.archived || method.id === original?.paymentMethodId)
                    .map((method) => (
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
          <div className="transaction-save-options">
            <div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={autoSave}
                  disabled={locked || Boolean(conflict) || deleted}
                  onChange={(e) => {
                    cancelAutoSave();
                    setAutoSave(e.target.checked);
                  }}
                />
                {original ? '수정 내용 자동 저장' : '입력 완료 후 자동 저장'}
              </label>
              {!original && (
                <p className="small">
                  {autoSave
                    ? '필수 항목을 채우고 입력 칸을 나가면 잠시 후 저장하고 창을 닫아요.'
                    : '작성 중인 내용은 이 기기에 초안으로 보관해요. 저장을 눌러 가계부에 반영해 주세요.'}
                </p>
              )}
              <span className="small" data-testid="transaction-save-status">
                {uncertain
                  ? '저장 결과 확인 필요'
                  : autoPaused
                    ? '자동 저장 멈춤 · 확인 후 저장을 눌러 주세요'
                    : busy
                      ? saveStatus
                      : dirty
                        ? autoSave
                          ? '입력 중 · 필드를 나가면 자동 저장해요'
                          : '이 기기에 초안 보관 중'
                        : saveStatus || (original ? '저장된 내역' : '새 내역 작성')}
              </span>
            </div>
          </div>
          {original && (
            <details className="record-meta">
              <summary>작성 정보</summary>
              {original &&
                (() => {
                  const record = data.transactions.find((t) => t.id === original.id) ?? original;
                  const who = (id?: string | null) =>
                    id ? (data.users.find((u) => u.id === id)?.name ?? id) : '미확인';
                  const when = (value?: string | null) =>
                    value && Number.isFinite(Date.parse(value))
                      ? new Date(value).toLocaleString('ko-KR')
                      : '미확인';
                  return (
                    <p className="small muted">
                      최초 작성: {who(record.createdBy)} · {when(record.createdAt)}
                      <br />
                      마지막 수정: {who(record.updatedBy)} · {when(record.updatedAt)}
                    </p>
                  );
                })()}
            </details>
          )}
        </div>
        <div className="form-footer">
          {original && !uncertain && (
            <button
              type="button"
              className="danger-link"
              disabled={locked || deleted || Boolean(conflict)}
              onClick={() => {
                cancelAutoSave();
                setConfirmDelete(!confirmDelete);
              }}
            >
              <Trash2 size={16} />
              삭제
            </button>
          )}
          <div className="footer-actions">
            <button type="button" className="secondary" onClick={close} disabled={locked}>
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
