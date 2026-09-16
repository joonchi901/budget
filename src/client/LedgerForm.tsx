import { SelectField, SelectOption } from './SelectField';
import { DateField } from './DateFields';
import { TagBadge } from './TagBadge';
import { useRef, useState, type FormEvent } from 'react';
import { Dialog, useUnsavedGuard } from './components';
import { RequestError, request } from './api';
import type { Bootstrap, Ledger, MutationResult } from '../shared/types';

export default function LedgerForm({
  onClose,
  onSaved,
  original,
  data,
}: {
  onClose(): void;
  onSaved(id: string): void;
  original?: Ledger;
  data?: Bootstrap;
}) {
  const [name, setName] = useState(original?.name ?? '');
  const [budget, setBudget] = useState(String(original?.budget ?? ''));
  const [icon, setIcon] = useState(original?.icon ?? '✈️');
  const [start, setStart] = useState(original?.startDate ?? '');
  const [end, setEnd] = useState(original?.endDate ?? '');
  const [linked, setLinked] = useState(original ? !!original.parentId : true);
  const [archived, setArchived] = useState(original?.archived ?? false);
  const [day, setDay] = useState(original?.periodStartDay ?? 1);
  const [fixed, setFixed] = useState(original?.fixedExpenseTagIds ?? []);
  const [mapping, setMapping] = useState(original?.tagMappings ?? {});
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  useUnsavedGuard(
    busy || uncertain || Boolean(name || budget || start || end) || icon !== '✈️' || !linked,
  );
  const pending = useRef<unknown>(null);
  const availableTags =
    data?.tags.filter((t) =>
      data.tagGroups.some((g) => g.id === t.groupId && g.appliesTo === 'transaction'),
    ) ?? [];
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
      parentId:
        original?.kind === 'main'
          ? null
          : linked
            ? (data?.ledgers.find((l) => l.kind === 'main')?.id ?? 'main')
            : null,
      ...(original ? { expectedVersion: original.version, archived } : {}),
      periodStartDay: day,
      fixedExpenseTagIds: fixed,
      tagMappings: mapping,
    };
    try {
      const result = await request<MutationResult>(
        `/api/ledgers${original ? `/${encodeURIComponent(original.id)}` : ''}`,
        original ? 'PATCH' : 'POST',
        pending.current,
      );
      onSaved(result.ledger!.id);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.code === 'VERSION_CONFLICT') setConflict(true);
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
      title={original ? '가계부 설정' : '목적 가계부 만들기'}
      subtitle="가계부의 기간·예산·집계 기준을 관리해요."
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
          {conflict && (
            <p role="status">
              입력을 확인한 뒤 닫고 최신 설정을 다시 열어 주세요. 다른 사용자의 설정은 덮어쓰지
              않았어요.
            </p>
          )}
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
                <DateField value={start} onValueChange={(value) => setStart(value)} />
              </label>
              <label>
                종료일 (선택)
                <DateField
                  min={start || undefined}
                  value={end}
                  onValueChange={(value) => setEnd(value)}
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={linked}
                disabled={original?.kind === 'main'}
                onChange={(e) => setLinked(e.target.checked)}
              />
              메인 가계부에 함께 표시
            </label>
            <label>
              월 집계 시작일
              <input
                type="number"
                min="1"
                max="31"
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                required
              />
            </label>
            <p className="small muted">
              해당 날짜가 없는 달은 다음 달 1일부터 시작해요. 목적 가계부의 전체 기간 예산과 월별
              조회는 구분돼요.
            </p>
            {data && (
              <details>
                <summary>고정지출 기준과 메인 분류 대응</summary>
                <p className="small muted">선택한 태그가 있는 지출은 무지출 달력에서 제외해요.</p>
                <div className="tag-filter-options">
                  {availableTags.map((t) => (
                    <label className="checkbox" key={t.id}>
                      <input
                        type="checkbox"
                        checked={fixed.includes(t.id)}
                        onChange={(e) =>
                          setFixed(
                            e.target.checked ? [...fixed, t.id] : fixed.filter((id) => id !== t.id),
                          )
                        }
                      />
                      <TagBadge name={t.name} color={t.color} archived={t.archived} />
                    </label>
                  ))}
                </div>
                {original?.kind !== 'main' && (
                  <>
                    <p className="small muted">
                      메인에서 분석할 때 사용할 분류를 대응해요. 원본 태그와 금액은 유지돼요.
                    </p>
                    {availableTags
                      .filter((t) =>
                        data.tagGroups.some(
                          (g) =>
                            g.id === t.groupId &&
                            (g.ledgerIds?.includes(original?.id ?? '') ||
                              data.transactions.some(
                                (tx) => tx.ledgerId === original?.id && tx.tagIds.includes(t.id),
                              )),
                        ),
                      )
                      .map((t) => (
                        <label key={t.id}>
                          <span>
                            <TagBadge name={t.name} color={t.color} archived={t.archived} />의 메인
                            분류
                          </span>
                          <SelectField
                            value={mapping[t.id] ?? ''}
                            onValueChange={(value) =>
                              setMapping((previous) => {
                                const next = { ...previous };
                                if (value) next[t.id] = value;
                                else delete next[t.id];
                                return next;
                              })
                            }
                          >
                            <SelectOption value="">원본 유지</SelectOption>
                            {availableTags
                              .filter((option) => option.id !== t.id)
                              .map((option) => (
                                <SelectOption key={option.id} value={option.id}>
                                  <TagBadge name={option.name} color={option.color} />
                                </SelectOption>
                              ))}
                          </SelectField>
                        </label>
                      ))}
                  </>
                )}
              </details>
            )}
            {original?.kind === 'purpose' && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(e) => setArchived(e.target.checked)}
                />
                가계부 보관 (과거 기록·메인 연결 유지)
              </label>
            )}
            <p className="small muted">
              예산은 이 가계부의 지출 기준이에요. 만들거나 연결해도 자산 금액은 바뀌지 않아요.
            </p>
          </fieldset>
        </div>
        <div className="form-footer">
          <span />
          <button className="primary" type="submit" disabled={busy || conflict}>
            {busy
              ? '저장 중…'
              : uncertain
                ? '저장 결과 다시 확인'
                : original
                  ? '설정 저장'
                  : '가계부 만들기'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
