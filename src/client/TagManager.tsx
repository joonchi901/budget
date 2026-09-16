import { Tooltip } from './Tooltip';
import { SelectField, SelectOption } from './SelectField';
import { useRef, useState, type FormEvent } from 'react';
import {
  Archive,
  ChevronsDown,
  ChevronsUp,
  Check,
  ChevronRight,
  Layers3,
  Pencil,
  Plus,
  RotateCcw,
  Tags,
} from 'lucide-react';
import type { Bootstrap, MutationResult, Tag, TagGroup } from '../shared/types';
import { RequestError, request } from './api';
import { Dialog, useUnsavedGuard } from './components';
import { TagBadge } from './TagBadge';
import { ColorField } from './ColorField';
import './tags.css';

const palette = [
  '#64866f',
  '#3b7990',
  '#5475ae',
  '#8370ae',
  '#b37392',
  '#ae6a57',
  '#a28246',
  '#707c83',
];
type Editor =
  { type: 'group'; original?: TagGroup } | { type: 'tag'; group: TagGroup; original?: Tag };
type Pending = { url: string; method: string; body: unknown };
const uncertainError = (error: unknown) =>
  !(error instanceof RequestError && error.status > 0 && error.status < 500);

export default function TagManager({
  data,
  onChanged,
}: {
  data: Bootstrap;
  onChanged(): Promise<void>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<Pending | null>(null);
  useUnsavedGuard(busy || uncertain);
  const groups = data.tagGroups
    .filter((group) => showArchived || !group.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'));
  const active = groups.find((group) => group.id === activeId) ?? groups[0];
  const options = active
    ? data.tags
        .filter((tag) => tag.groupId === active.id && (showArchived || !tag.archived))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'))
    : [];
  const locked = busy || uncertain;
  async function mutate(operation?: Pending) {
    if (busy) return;
    if (!pending.current && operation) pending.current = operation;
    if (!pending.current) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await request<MutationResult>(
        pending.current.url,
        pending.current.method,
        pending.current.body,
      );
      pending.current = null;
      setUncertain(false);
      setMessage('태그 설정을 저장했어요.');
      await onChanged();
    } catch (error) {
      setError((error as Error).message);
      if (uncertainError(error) && pending.current) setUncertain(true);
      else {
        pending.current = null;
        setUncertain(false);
      }
    } finally {
      setBusy(false);
    }
  }
  function patch(entity: 'tag-groups' | 'tags', item: TagGroup | Tag, changes: object) {
    void mutate({
      url: `/api/${entity}/${encodeURIComponent(item.id)}`,
      method: 'PATCH',
      body: { mutationId: crypto.randomUUID(), expectedVersion: item.version, ...changes },
    });
  }
  const scope = (group: TagGroup) =>
    group.appliesTo === 'asset'
      ? '자산에서 사용'
      : group.ledgerIds === null
        ? '모든 가계부'
        : group.ledgerIds
            .map((id) => data.ledgers.find((ledger) => ledger.id === id)?.name ?? '보관된 가계부')
            .join(' · ');
  return (
    <section className="tag-manager" aria-label="태그 설정">
      <div className="tag-manager-heading">
        <div>
          <p className="tag-manager-intro">분류부터 자산 용도까지, 원하는 기준으로 관리해요.</p>
          <span className="tag-manager-helper">
            태그 유형을 선택하면 옵션을 추가하거나 수정할 수 있어요.
          </span>
        </div>
        <button
          type="button"
          className="primary"
          disabled={locked}
          onClick={() => setEditor({ type: 'group' })}
        >
          <Plus size={17} />
          유형 만들기
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          {!uncertain && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void onChanged();
                setError('');
              }}
            >
              최신 설정 불러오기
            </button>
          )}
        </div>
      )}
      {uncertain && (
        <div className="alert">
          <span>저장 결과가 확인되지 않았어요. 같은 요청으로 다시 확인해 주세요.</span>
          <button type="button" disabled={busy} onClick={() => void mutate()}>
            {busy ? '확인 중…' : '저장 결과 다시 확인'}
          </button>
        </div>
      )}
      {message && (
        <p className="tag-save-status" role="status">
          <Check size={15} />
          {message}
        </p>
      )}
      <div className="tag-manager-toolbar">
        <span>
          <Layers3 size={16} />
          태그 유형 {data.tagGroups.filter((group) => !group.archived).length}개
        </span>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            disabled={locked}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          보관된 항목 보기
        </label>
      </div>
      <div className="tag-manager-layout">
        <nav className="tag-group-list" aria-label="태그 유형 목록">
          {groups.map((group) => (
            <button
              type="button"
              key={group.id}
              disabled={locked}
              className={`tag-group-item ${active?.id === group.id ? 'selected' : ''}`}
              aria-current={active?.id === group.id ? 'page' : undefined}
              onClick={() => setActiveId(group.id)}
            >
              <span className="tag-group-icon">
                <Tags size={18} />
              </span>
              <span>
                <strong>
                  {group.name}
                  {group.archived && <small>보관됨</small>}
                </strong>
                <small>
                  {group.appliesTo === 'transaction' ? '가계부' : '자산'} ·{' '}
                  {group.selectionMode === 'single' ? '단일 선택' : '복수 선택'} · 옵션{' '}
                  {data.tags.filter((tag) => tag.groupId === group.id && !tag.archived).length}개
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {groups.length === 0 && (
            <p className="tag-manager-empty">첫 태그 유형을 만들어 보세요.</p>
          )}
        </nav>
        <div className="tag-group-detail">
          {active ? (
            <>
              <div className="tag-detail-heading">
                <div>
                  <div className="tag-detail-title">
                    <h3>{active.name}</h3>
                    {active.archived && <span className="badge">보관됨</span>}
                  </div>
                  <p>{scope(active)}</p>
                  <span className="tag-selection-badge">
                    {active.selectionMode === 'single' ? '하나만 선택' : '여러 개 선택'}
                  </span>
                </div>
                <div className="tag-detail-actions">
                  <button
                    type="button"
                    className="secondary tag-type-settings"
                    aria-label={`${active.name} 유형 수정`}
                    disabled={locked}
                    onClick={() => setEditor({ type: 'group', original: active })}
                  >
                    <Pencil size={16} /> 유형 설정
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${active.name} 유형 ${active.archived ? '복원' : '보관'}`}
                    disabled={locked}
                    onClick={() => patch('tag-groups', active, { archived: !active.archived })}
                  >
                    {active.archived ? <RotateCcw size={17} /> : <Archive size={17} />}
                  </button>
                </div>
              </div>
              <div className="tag-option-heading">
                <span>옵션 {options.length}개</span>
                {!active.archived && (
                  <button
                    type="button"
                    className="secondary tag-add-option"
                    disabled={locked}
                    onClick={() => setEditor({ type: 'tag', group: active })}
                  >
                    <Plus size={17} /> 옵션 추가
                  </button>
                )}
              </div>
              <div className="tag-managed-options">
                {options.map((tag, index) => (
                  <div
                    className={`tag-managed-option ${tag.archived ? 'is-archived' : ''}`}
                    key={tag.id}
                  >
                    <div className="tag-managed-label">
                      <TagBadge name={tag.name} color={tag.color} />
                      {tag.parentId && (
                        <small className="tag-parent-label">
                          상위 옵션 ·{' '}
                          {data.tags.find((parent) => parent.id === tag.parentId)?.name ??
                            '보관된 옵션'}
                        </small>
                      )}
                      {tag.archived && <small>보관됨</small>}
                    </div>
                    <div className="tag-option-actions">
                      <Tooltip content="맨 앞으로 이동">
                        <button
                          type="button"
                          className="icon-button"
                          disabled={locked || active.archived || index === 0}
                          aria-label={`${tag.name} 맨 앞으로 이동`}
                          onClick={() =>
                            patch('tags', tag, { sortOrder: options[0].sortOrder - 1 })
                          }
                        >
                          <ChevronsUp size={14} />
                        </button>
                      </Tooltip>
                      <Tooltip content="맨 뒤로 이동">
                        <button
                          type="button"
                          className="icon-button"
                          disabled={locked || active.archived || index === options.length - 1}
                          aria-label={`${tag.name} 맨 뒤로 이동`}
                          onClick={() =>
                            patch('tags', tag, {
                              sortOrder: options[options.length - 1].sortOrder + 1,
                            })
                          }
                        >
                          <ChevronsDown size={14} />
                        </button>
                      </Tooltip>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={locked || active.archived}
                        aria-label={`${tag.name} 옵션 수정`}
                        onClick={() => setEditor({ type: 'tag', group: active, original: tag })}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={locked || active.archived}
                        aria-label={`${tag.name} 옵션 ${tag.archived ? '복원' : '보관'}`}
                        onClick={() => patch('tags', tag, { archived: !tag.archived })}
                      >
                        {tag.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                      </button>
                    </div>
                  </div>
                ))}
                {options.length === 0 && (
                  <p className="tag-manager-empty">
                    아직 옵션이 없어요. 자주 쓰는 분류부터 추가해 보세요.
                  </p>
                )}
              </div>
              <div className="tag-management-note">
                <Archive size={16} />
                <p>
                  보관한 유형과 옵션은 새로 선택할 수 없어요.
                  <br />
                  기존 내역의 태그와 통계는 그대로 유지돼요.
                </p>
              </div>
            </>
          ) : (
            <div className="tag-manager-empty">
              <Tags size={28} />
              <p>
                분류, 내역, 자산 용도 등<br />
                필요한 유형을 직접 만들 수 있어요.
              </p>
            </div>
          )}
        </div>
      </div>
      {editor && (
        <TagEditor
          key={`${editor.type}-${editor.original?.id ?? (editor.type === 'tag' ? editor.group.id : 'new')}`}
          data={data}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={async (result) => {
            setEditor(null);
            if (result.tagGroup) setActiveId(result.tagGroup.id);
            setMessage('태그 설정을 저장했어요.');
            await onChanged();
          }}
        />
      )}
    </section>
  );
}

function TagEditor({
  data,
  editor,
  onClose,
  onSaved,
}: {
  data: Bootstrap;
  editor: Editor;
  onClose(): void;
  onSaved(result: MutationResult): Promise<void>;
}) {
  const [source, setSource] = useState(editor.original);
  const [name, setName] = useState(editor.original?.name ?? '');
  const [selectionMode, setSelectionMode] = useState<TagGroup['selectionMode']>(
    editor.type === 'group' ? (editor.original?.selectionMode ?? 'multiple') : 'multiple',
  );
  const [appliesTo, setAppliesTo] = useState<TagGroup['appliesTo']>(
    editor.type === 'group'
      ? (editor.original?.appliesTo ?? 'transaction')
      : editor.group.appliesTo,
  );
  const [ledgerIds, setLedgerIds] = useState<string[] | null>(
    editor.type === 'group' ? (editor.original?.ledgerIds ?? null) : null,
  );
  const [sortOrder, setSortOrder] = useState(
    editor.original?.sortOrder ??
      (editor.type === 'group'
        ? Math.max(-1, ...data.tagGroups.map((group) => group.sortOrder))
        : Math.max(
            -1,
            ...data.tags
              .filter((tag) => tag.groupId === editor.group.id)
              .map((tag) => tag.sortOrder),
          )) + (editor.original ? 0 : 1),
  );
  const [color, setColor] = useState(
    editor.type === 'tag' ? (editor.original?.color ?? palette[0]) : palette[0],
  );
  const [parentId, setParentId] = useState(
    editor.type === 'tag' ? (editor.original?.parentId ?? '') : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const pending = useRef<Pending | null>(null);
  const initial = useRef(
    JSON.stringify({ name, selectionMode, appliesTo, ledgerIds, sortOrder, color, parentId }),
  );
  useUnsavedGuard(
    busy ||
      uncertain ||
      initial.current !==
        JSON.stringify({ name, selectionMode, appliesTo, ledgerIds, sortOrder, color, parentId }),
  );
  const locked = busy || uncertain;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || conflict) return;
    if (!pending.current) {
      const body =
        editor.type === 'group'
          ? {
              name: name.trim(),
              selectionMode,
              ledgerIds: appliesTo === 'asset' ? null : ledgerIds,
              sortOrder,
              ...(!source ? { appliesTo } : {}),
            }
          : {
              name: name.trim(),
              color,
              sortOrder,
              parentId: parentId || null,
              ...(!source && editor.type === 'tag' ? { groupId: editor.group.id } : {}),
            };
      pending.current = {
        url: `/api/${editor.type === 'group' ? 'tag-groups' : 'tags'}${source ? `/${encodeURIComponent(source.id)}` : ''}`,
        method: source ? 'PATCH' : 'POST',
        body: {
          mutationId: crypto.randomUUID(),
          ...(source ? { expectedVersion: source.version } : {}),
          ...body,
        },
      };
    }
    setBusy(true);
    setError('');
    try {
      const result = await request<MutationResult>(
        pending.current.url,
        pending.current.method,
        pending.current.body,
      );
      pending.current = null;
      setUncertain(false);
      await onSaved(result);
    } catch (error) {
      setError((error as Error).message);
      if (uncertainError(error) && pending.current) setUncertain(true);
      else {
        pending.current = null;
        setUncertain(false);
        if (source && error instanceof RequestError && error.code === 'VERSION_CONFLICT')
          setConflict(true);
      }
    } finally {
      setBusy(false);
    }
  }
  async function loadLatest() {
    setBusy(true);
    try {
      const fresh = await request<Bootstrap>('/api/bootstrap');
      const latest =
        editor.type === 'group'
          ? fresh.tagGroups.find((group) => group.id === source?.id)
          : fresh.tags.find((tag) => tag.id === source?.id);
      if (!latest) {
        setError('최신 설정을 확인할 수 없어요. 창을 닫고 다시 열어 주세요.');
        return;
      }
      setSource(latest);
      setName(latest.name);
      setSortOrder(latest.sortOrder);
      if ('selectionMode' in latest) {
        setSelectionMode(latest.selectionMode);
        setAppliesTo(latest.appliesTo);
        setLedgerIds(latest.ledgerIds);
      } else setColor(latest.color);
      setConflict(false);
      setError('');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        editor.type === 'group'
          ? source
            ? '태그 유형 수정'
            : '태그 유형 만들기'
          : source
            ? '옵션 수정'
            : '옵션 추가'
      }
      subtitle={
        editor.type === 'tag'
          ? `${editor.group.name} 안에서 사용할 옵션이에요.`
          : '분류와 내역을 우리 방식으로 구성해요.'
      }
      onClose={onClose}
      locked={locked}
    >
      <form onSubmit={save}>
        <div className="form-body">
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {conflict && (
            <div className="alert">
              <p>다른 곳에서 먼저 수정했어요. 최신 설정을 불러온 뒤 다시 수정해 주세요.</p>
              <button type="button" disabled={busy} onClick={() => void loadLatest()}>
                최신 내용 불러오기
              </button>
            </div>
          )}
          {uncertain && <div className="alert">같은 요청으로 저장 결과를 다시 확인해 주세요.</div>}
          <fieldset disabled={locked || conflict}>
            <label>
              {editor.type === 'group' ? '유형 이름' : '옵션 이름'}
              <input
                autoFocus
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={
                  editor.type === 'group' ? '예: 분류, 내역, 자산 용도' : '옵션의 이름을 입력하세요'
                }
              />
            </label>
            {editor.type === 'group' ? (
              <>
                <div className="form-grid">
                  <label>
                    선택 방식
                    <SelectField
                      value={selectionMode}
                      onValueChange={(value) =>
                        setSelectionMode(value as TagGroup['selectionMode'])
                      }
                    >
                      <SelectOption value="single">단일 선택</SelectOption>
                      <SelectOption value="multiple">복수 선택</SelectOption>
                    </SelectField>
                  </label>
                  <label>
                    사용 위치
                    <SelectField
                      value={appliesTo}
                      disabled={Boolean(source)}
                      onValueChange={(value) => setAppliesTo(value as TagGroup['appliesTo'])}
                    >
                      <SelectOption value="transaction">가계부 내역</SelectOption>
                      <SelectOption value="asset">자산</SelectOption>
                    </SelectField>
                  </label>
                </div>
                {appliesTo === 'transaction' && (
                  <div className="tag-scope">
                    <span className="field-label">사용할 가계부</span>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={ledgerIds === null}
                        onChange={(event) =>
                          setLedgerIds(
                            event.target.checked
                              ? null
                              : data.ledgers
                                  .filter((ledger) => !ledger.archived)
                                  .map((ledger) => ledger.id),
                          )
                        }
                      />
                      모든 가계부에서 사용
                    </label>
                    {ledgerIds !== null && (
                      <div className="tag-scope-list">
                        {data.ledgers
                          .filter((ledger) => !ledger.archived || ledgerIds.includes(ledger.id))
                          .map((ledger) => (
                            <label className="checkbox" key={ledger.id}>
                              <input
                                type="checkbox"
                                checked={ledgerIds.includes(ledger.id)}
                                onChange={(event) =>
                                  setLedgerIds(
                                    event.target.checked
                                      ? [...ledgerIds, ledger.id]
                                      : ledgerIds.filter((id) => id !== ledger.id),
                                  )
                                }
                              />
                              {ledger.icon} {ledger.name}
                            </label>
                          ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="small muted">
                  복수 선택을 단일 선택으로 바꿀 때 기존 내역에 여러 옵션이 있으면 먼저 정리해
                  주세요.
                </p>
              </>
            ) : (
              <div>
                <label>
                  상위 옵션 (선택)
                  <SelectField value={parentId} onValueChange={(value) => setParentId(value)}>
                    <SelectOption value="">독립 옵션</SelectOption>
                    {data.tags
                      .filter(
                        (t) =>
                          t.id !== source?.id &&
                          t.groupId !== editor.group.id &&
                          !t.archived &&
                          data.tagGroups.some(
                            (g) =>
                              g.id === t.groupId &&
                              g.appliesTo === editor.group.appliesTo &&
                              !g.archived,
                          ),
                      )
                      .map((t) => (
                        <SelectOption key={t.id} value={t.id}>
                          {data.tagGroups.find((g) => g.id === t.groupId)?.name} /{' '}
                          <TagBadge name={t.name} color={t.color} />
                        </SelectOption>
                      ))}
                  </SelectField>
                </label>
                <p className="small muted">
                  상위 옵션을 선택한 기록에서만 이 옵션을 고를 수 있어요. 예: 식비 → 장보기.
                </p>
                <span className="field-label">옵션 색상</span>
                <div className="tag-color-options">
                  {palette.map((item) => (
                    <button
                      type="button"
                      key={item}
                      aria-label={`${item} 색상`}
                      aria-pressed={color === item}
                      style={{ backgroundColor: item }}
                      onClick={() => setColor(item)}
                    >
                      {color === item && <Check size={18} />}
                    </button>
                  ))}
                  <label className="tag-custom-color">
                    <ColorField
                      aria-label="직접 색상 선택"
                      value={color}
                      onValueChange={setColor}
                    />
                    <span>직접 선택</span>
                  </label>
                </div>
                <div className="tag-color-preview">
                  <span className="small muted">미리보기</span>
                  <TagBadge name={name || '새 옵션'} color={color} />
                </div>
              </div>
            )}
            <label>
              표시 순서
              <input
                type="number"
                required
                min="-999999"
                max="999999"
                step="1"
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value))}
              />
            </label>
          </fieldset>
        </div>
        <div className="form-footer">
          <span />
          <div className="footer-actions">
            <button type="button" className="secondary" disabled={locked} onClick={onClose}>
              닫기
            </button>
            <button type="submit" className="primary" disabled={busy || conflict}>
              {busy ? '저장 중…' : uncertain ? '저장 결과 다시 확인' : '저장'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
