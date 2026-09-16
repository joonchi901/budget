import { useRef, useState, type FormEvent } from 'react';
import { Dialog, useUnsavedGuard } from './components';
import { RequestError, request } from './api';
import type { MutationResult } from '../shared/types';

export default function LedgerForm({
  onClose,
  onSaved,
}: {
  onClose(): void;
  onSaved(id: string): void;
}) {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [icon, setIcon] = useState('✈️');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [linked, setLinked] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  useUnsavedGuard(
    busy || uncertain || Boolean(name || budget || start || end) || icon !== '✈️' || !linked,
  );
  const pending = useRef<unknown>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    pending.current ??= {
      mutationId: crypto.randomUUID(),
      name,
      icon,
      budget: Number(budget),
      startDate: start || null,
      endDate: end || null,
      parentId: linked ? 'main' : null,
    };
    try {
      const result = await request<MutationResult>('/api/ledgers', 'POST', pending.current);
      onSaved(result.ledger!.id);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.status > 0 && e.status < 500) {
        pending.current = null;
        setUncertain(false);
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="목적 가계부 만들기"
      subtitle="여행도, 이사도. 필요한 기록을 따로 모아보세요."
      onClose={onClose}
      locked={busy || uncertain}
    >
      <form onSubmit={save}>
        <div className="form-body">
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {uncertain && <div className="alert">같은 요청으로 저장 결과를 다시 확인해 주세요.</div>}
          <fieldset disabled={busy || uncertain}>
            <div className="emoji-options">
              {['✈️', '🍊', '🏠', '🎉', '📒'].map((emoji) => (
                <button
                  type="button"
                  aria-label={`${emoji} 아이콘`}
                  aria-pressed={icon === emoji}
                  className={icon === emoji ? 'active' : ''}
                  key={emoji}
                  onClick={() => setIcon(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <label>
              가계부 이름
              <input
                autoFocus
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 우리의 여름 여행"
              />
            </label>
            <label>
              전체 예산 (원)
              <input
                type="number"
                min="0"
                max="1000000000000"
                step="1"
                required
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="0"
              />
            </label>
            <div className="form-grid">
              <label>
                시작일 (선택)
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label>
                종료일 (선택)
                <input
                  type="date"
                  min={start || undefined}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={linked}
                onChange={(e) => setLinked(e.target.checked)}
              />
              메인 가계부에 함께 표시
            </label>
            <p className="small muted">
              예산은 이 가계부의 지출 기준이에요. 만들거나 연결해도 자산 금액은 바뀌지 않아요.
            </p>
          </fieldset>
        </div>
        <div className="form-footer">
          <span />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? '만드는 중…' : uncertain ? '저장 결과 다시 확인' : '가계부 만들기'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
