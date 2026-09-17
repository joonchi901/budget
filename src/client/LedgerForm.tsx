import { ledgerDescendantIds, ledgerPath } from '../shared/hierarchy';
import { SelectField, SelectOption } from './SelectField';
import { UgaLedgerIcon, UGA_LEDGER_ICONS } from './brand/Uga';
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
  initialParentId = null,
  onChanged,
}: {
  onClose(): void;
  onSaved(id: string): void;
  original?: Ledger;
  data: Bootstrap;
  initialParentId?: string | null;
  onChanged(): Promise<void>;
}) {
  const [name, setName] = useState(original?.name ?? '');
  const [budget, setBudget] = useState(String(original?.budget ?? ''));
  const [icon, setIcon] = useState(original?.icon ?? '✈️');
  const [start, setStart] = useState(original?.startDate ?? '');
  const [end, setEnd] = useState(original?.endDate ?? '');
  const [parentId, setParentId] = useState(original?.parentId ?? initialParentId ?? '');
  const [baseline, setBaseline] = useState({
    ledger: original,
    hierarchyVersion: data.hierarchyVersion ?? 0,
  });
  const admin = data.user.role === 'admin';
  const excluded = original ? ledgerDescendantIds(data.ledgers, original.id) : new Set<string>();
  const parents = data.ledgers.filter((ledger) => !ledger.archived && !excluded.has(ledger.id));
  const [archived, setArchived] = useState(original?.archived ?? false);
  const [day, setDay] = useState(original?.periodStartDay ?? 1);
  const [fixed, setFixed] = useState(original?.fixedExpenseTagIds ?? []);
  const [mapping, setMapping] = useState(original?.tagMappings ?? {});
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  useUnsavedGuard(
    busy ||
      uncertain ||
      Boolean(name || budget || start || end) ||
      icon !== '✈️' ||
      Boolean(parentId),
  );
  const pending = useRef<unknown>(null);
  const availableTags =
    data?.tags.filter((t) =>
      data.tagGroups.some((g) => g.id === t.groupId && g.appliesTo === 'transaction'),
    ) ?? [];
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      !pending.current &&
      ((!original && !admin) ||
        (((parentId || null) !== (baseline.ledger?.parentId ?? null) ||
          archived !== baseline.ledger?.archived) &&
          !admin))
    )
      return;
    setError('');
    setBusy(true);
    pending.current ??= {
      mutationId: crypto.randomUUID(),
      name,
      icon,
      budget: Number(budget),
      startDate: start || null,
      endDate: end || null,
      ...(!original || (parentId || null) !== baseline.ledger?.parentId
        ? { parentId: parentId || null }
        : {}),
      ...(!original ||
      (parentId || null) !== baseline.ledger?.parentId ||
      archived !== baseline.ledger?.archived
        ? { expectedHierarchyVersion: baseline.hierarchyVersion }
        : {}),
      ...(original
        ? {
            expectedVersion: baseline.ledger!.version,
            ...(archived !== baseline.ledger?.archived ? { archived } : {}),
          }
        : {}),
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
      if (e instanceof RequestError && e.status === 409) setConflict(true);
      if (e instanceof RequestError && (e.status === 409 || e.status === 403)) await onChanged();
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
      title={original ? '가계부 설정' : '가계부 만들기'}
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
          {!admin && !original && (
            <p role="status">
              관리자 권한이 변경되어 새 가계부를 만들 수 없어요. 작성한 내용은 유지했어요.
            </p>
          )}
          {uncertain && <div className="alert">같은 요청으로 저장 결과를 다시 확인해 주세요.</div>}
          {conflict && (
            <div className="hierarchy-conflict" role="status">
              <strong>가계부 설정 또는 구조가 변경되었어요.</strong>
              <p>작성한 내용은 유지했어요. 최신 위치와 권한을 확인한 뒤 다시 저장해 주세요.</p>
              <ul>
                {data.ledgers.map((ledger) => (
                  <li key={ledger.id}>{ledgerPath(data.ledgers, ledger.id)}</li>
                ))}
              </ul>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const latest = data.ledgers.find((ledger) => ledger.id === original?.id);
                  if (original && (parentId || null) === baseline.ledger?.parentId)
                    setParentId(latest?.parentId ?? '');
                  if (original && archived === baseline.ledger?.archived)
                    setArchived(latest?.archived ?? false);
                  setBaseline({ ledger: latest, hierarchyVersion: data.hierarchyVersion ?? 0 });
                  setConflict(false);
                  setError('');
                }}
              >
                최신 설정을 확인했어요
              </button>
            </div>
          )}
          <fieldset disabled={busy || uncertain}>
            <div className="emoji-options">
              {UGA_LEDGER_ICONS.map(({ value, label }) => (
                <button
                  type="button"
                  aria-label={`${label} 아이콘`}
                  aria-pressed={icon === value}
                  className={icon === value ? 'active' : ''}
                  key={value}
                  onClick={() => setIcon(value)}
                >
                  <UgaLedgerIcon value={value} size={30} />
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
            {admin && (
              <label>
                상위 가계부
                <SelectField value={parentId} onValueChange={setParentId}>
                  <SelectOption value="">최상위에 두기</SelectOption>
                  {parents.map((ledger) => (
                    <SelectOption key={ledger.id} value={ledger.id}>
                      {ledgerPath(data.ledgers, ledger.id)}
                    </SelectOption>
                  ))}
                </SelectField>
              </label>
            )}
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
                <summary>고정지출 기준과 상위 분류 대응</summary>
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
                {(parentId || original?.parentId) && (
                  <>
                    <p className="small muted">
                      상위 가계부에서 분석할 때 사용할 분류를 대응해요. 원본 태그와 금액은 유지돼요.
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
                            <TagBadge name={t.name} color={t.color} archived={t.archived} />의 상위
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
            {original && admin && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(e) => setArchived(e.target.checked)}
                />
                가계부 보관 (과거 기록과 하위 구조 유지)
              </label>
            )}
            <p className="small muted">
              예산은 이 가계부의 지출 기준이에요. 만들거나 연결해도 자산 금액은 바뀌지 않아요.
            </p>
          </fieldset>
        </div>
        <div className="form-footer">
          <span />
          <button
            className="primary"
            type="submit"
            disabled={busy || conflict || (!original && !admin && !uncertain)}
          >
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
