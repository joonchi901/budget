import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Bootstrap, Ledger } from '../shared/types';
import { ledgerDescendantIds, ledgerPath, sortedLedgerChildren } from '../shared/hierarchy';
import { Dialog, useUnsavedGuard } from './components';
import { SelectField, SelectOption } from './SelectField';
import { RequestError, request } from './api';

export interface MoveIntent {
  ledger: Ledger;
  hierarchyVersion: number;
  parentId: string | null;
  beforeId: string | null;
  automatic?: boolean;
}
export default function HierarchyDialog({
  data,
  intent,
  onChanged,
  onClose,
  onSaved,
}: {
  data: Bootstrap;
  intent: MoveIntent;
  onChanged(): Promise<void>;
  onClose(): void;
  onSaved(): void;
}) {
  const [parentId, setParentId] = useState(intent.parentId ?? '');
  const [beforeId, setBeforeId] = useState(intent.beforeId ?? '');
  const [baseline, setBaseline] = useState({
    version: intent.ledger.version,
    hierarchyVersion: intent.hierarchyVersion,
  });
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<unknown>(null);
  const started = useRef(false);
  const admin = data.user.role === 'admin';
  const current = data.ledgers.find((ledger) => ledger.id === intent.ledger.id);
  const excluded = ledgerDescendantIds(data.ledgers, intent.ledger.id);
  const destinations = data.ledgers.filter(
    (ledger) => !ledger.archived && !excluded.has(ledger.id),
  );
  const siblings = sortedLedgerChildren(data.ledgers, parentId || null).filter(
    (ledger) => ledger.id !== intent.ledger.id,
  );
  const valid = Boolean(
    current &&
    (!parentId || destinations.some((ledger) => ledger.id === parentId)) &&
    (!beforeId || siblings.some((ledger) => ledger.id === beforeId)),
  );
  useUnsavedGuard(busy || uncertain);
  async function save() {
    if ((!admin && !pending.current) || conflict || (!valid && !pending.current) || busy) return;
    setBusy(true);
    setError('');
    pending.current ??= {
      mutationId: crypto.randomUUID(),
      expectedVersion: baseline.version,
      expectedHierarchyVersion: baseline.hierarchyVersion,
      parentId: parentId || null,
      beforeId: beforeId || null,
    };
    try {
      await request(
        `/api/ledgers/${encodeURIComponent(intent.ledger.id)}`,
        'PATCH',
        pending.current,
      );
      await onChanged();
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
      if (reason instanceof RequestError && reason.status > 0 && reason.status < 500) {
        pending.current = null;
        setUncertain(false);
        if (reason.status === 409) setConflict(true);
        await onChanged();
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (intent.automatic && !started.current) {
      started.current = true;
      void save();
    }
  }, []);
  return (
    <Dialog
      title="가계부 위치 변경"
      subtitle={intent.ledger.name}
      onClose={onClose}
      locked={busy || uncertain}
    >
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="form-body">
          <p className="small muted">
            이 가계부와 모든 하위 가계부가 함께 이동해요. 원본 거래와 자산 금액은 유지돼요.
          </p>
          {(parentId || null) !== (intent.ledger.parentId ?? null) &&
            Object.keys(intent.ledger.tagMappings ?? {}).length > 0 && (
              <p className="small muted">
                상위 가계부가 바뀌면 기존 분류 대응을 초기화해요. 새 상위 기준으로 다시 설정해 주세요.
              </p>
            )}
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {!admin && <p role="status">관리자 권한이 변경되었어요. 최신 권한으로 새로고침했어요.</p>}
          {conflict && (
            <div className="hierarchy-conflict" role="status">
              <strong>다른 관리자가 구조를 먼저 변경했어요.</strong>
              <p>요청한 위치는 유지했어요. 최신 구조와 목적지를 확인한 뒤 다시 적용해 주세요.</p>
              <p>
                현재 위치:{' '}
                {current ? ledgerPath(data.ledgers, current.id) : '가계부를 확인할 수 없음'}
              </p>
              <ul>
                {data.ledgers.map((ledger) => (
                  <li key={ledger.id}>{ledgerPath(data.ledgers, ledger.id)}</li>
                ))}
              </ul>
              <button
                type="button"
                className="secondary"
                disabled={!admin || !valid}
                onClick={() => {
                  setBaseline({
                    version: current!.version,
                    hierarchyVersion: data.hierarchyVersion ?? 0,
                  });
                  setConflict(false);
                  setError('');
                }}
              >
                최신 구조를 확인했어요
              </button>
            </div>
          )}
          {uncertain && (
            <div className="alert">
              응답을 확인하지 못했어요. 같은 요청으로 결과를 다시 확인해 주세요.
            </div>
          )}
          <fieldset disabled={busy || uncertain || !admin}>
            <label>
              상위 가계부
              <SelectField
                value={parentId}
                onValueChange={(id) => {
                  setParentId(id);
                  setBeforeId('');
                }}
              >
                <SelectOption value="">최상위에 두기</SelectOption>
                {destinations.map((ledger) => (
                  <SelectOption key={ledger.id} value={ledger.id}>
                    {ledgerPath(data.ledgers, ledger.id)}
                  </SelectOption>
                ))}
              </SelectField>
            </label>
            <label>
              같은 단계에서의 위치
              <SelectField value={beforeId} onValueChange={setBeforeId}>
                <SelectOption value="">맨 뒤</SelectOption>
                {siblings.map((ledger) => (
                  <SelectOption key={ledger.id} value={ledger.id}>
                    {ledger.name} 앞
                  </SelectOption>
                ))}
              </SelectField>
            </label>
            {!valid && (
              <p className="error" role="alert">
                목적지가 변경되었어요. 이동할 상위 가계부와 순서를 다시 선택해 주세요.
              </p>
            )}
          </fieldset>
        </div>
        <div className="form-footer">
          <span />
          <button
            className="primary"
            disabled={busy || conflict || (!admin && !uncertain) || (!valid && !uncertain)}
          >
            {busy ? '이동 중…' : uncertain ? '이동 결과 다시 확인' : '이 위치로 이동'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
