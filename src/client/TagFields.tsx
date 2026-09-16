import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import type { Bootstrap, MutationResult, Tag, TagGroup } from '../shared/types';
import { RequestError, request } from './api';
import { useUnsavedGuard } from './components';
import { Popover } from './Popover';
import { TagBadge } from './TagBadge';
import './tags.css';

export interface TagFieldsProps {
  data: Bootstrap;
  value: string[];
  onChange(ids: string[]): void;
  appliesTo: 'transaction' | 'asset';
  ledgerId?: string;
  disabled?: boolean;
  onChanged(): Promise<void>;
  onPendingChange?(pending: boolean): void;
}

export function TagFields({
  data,
  value,
  onChange,
  appliesTo,
  ledgerId,
  disabled = false,
  onChanged,
  onPendingChange,
}: TagFieldsProps) {
  const [created, setCreated] = useState<Tag[]>([]);
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);
  const pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  useEffect(() => {
    pendingCallback.current?.(pendingGroup !== null);
    return () => pendingCallback.current?.(false);
  }, [pendingGroup]);
  const tags = [...new Map([...created, ...data.tags].map((tag) => [tag.id, tag])).values()];
  const groups = data.tagGroups
    .filter((group) => {
      if (group.appliesTo !== appliesTo) return false;
      const hasSelection = tags.some((tag) => tag.groupId === group.id && value.includes(tag.id));
      const inScope =
        group.ledgerIds === null || (ledgerId !== undefined && group.ledgerIds.includes(ledgerId));
      return hasSelection || group.id === pendingGroup || (!group.archived && inScope);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'));

  return (
    <div className="tag-fields" aria-label={appliesTo === 'asset' ? '자산 태그' : '내역 태그'}>
      {groups.map((group) => (
        <TagField
          key={group.id}
          group={group}
          tags={tags.filter(
            (tag) =>
              tag.groupId === group.id &&
              (!tag.parentId || value.includes(tag.parentId) || value.includes(tag.id)),
          )}
          selected={value}
          disabled={disabled || (pendingGroup !== null && pendingGroup !== group.id)}
          outOfScope={
            group.ledgerIds !== null &&
            (ledgerId === undefined || !group.ledgerIds.includes(ledgerId))
          }
          onChange={(ids) => {
            let next = ids;
            for (let i = 0; i < tags.length; i++) {
              const valid = next.filter((id) => {
                const t = tags.find((t) => t.id === id);
                return !t?.parentId || next.includes(t.parentId);
              });
              if (valid.length === next.length) break;
              next = valid;
            }
            onChange(next);
          }}
          onChanged={onChanged}
          onCreated={(tag) =>
            setCreated((previous) => [...previous.filter((item) => item.id !== tag.id), tag])
          }
          onPendingChange={(pending) => setPendingGroup(pending ? group.id : null)}
        />
      ))}
      {groups.length === 0 && (
        <p className="small muted">
          사용할 태그 유형이 없어요. 태그 설정에서 유형과 옵션을 만들 수 있어요.
        </p>
      )}
    </div>
  );
}

function TagField({
  group,
  tags,
  selected,
  disabled,
  outOfScope,
  onChange,
  onChanged,
  onCreated,
  onPendingChange,
}: {
  group: TagGroup;
  tags: Tag[];
  selected: string[];
  disabled: boolean;
  outOfScope: boolean;
  onChange(ids: string[]): void;
  onChanged(): Promise<void>;
  onCreated(tag: Tag): void;
  onPendingChange(value: boolean): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef<unknown>(null);
  const listId = useId();
  const readonly = group.archived || outOfScope;
  const locked = busy || uncertain;
  const selectedTags = tags.filter((tag) => selected.includes(tag.id));
  const options = tags
    .filter(
      (tag) =>
        !tag.archived && tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'));
  const exactMatch = tags.some(
    (tag) => tag.name.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
  );
  useUnsavedGuard(locked);
  function close() {
    if (!locked) {
      setOpen(false);
      trigger.current?.focus();
    }
  }
  function choose(tag: Tag) {
    if (disabled || readonly || locked || tag.archived) return;
    if (selected.includes(tag.id)) onChange(selected.filter((id) => id !== tag.id));
    else if (group.selectionMode === 'single')
      onChange([...selected.filter((id) => !tags.some((item) => item.id === id)), tag.id]);
    else onChange([...selected, tag.id]);
    if (group.selectionMode === 'single') close();
    else input.current?.focus();
  }
  async function create() {
    if (disabled || busy || (!pending.current && (readonly || !query.trim() || exactMatch))) return;
    pending.current ??= {
      mutationId: crypto.randomUUID(),
      groupId: group.id,
      name: query.trim(),
      color: '#64866f',
      sortOrder: Math.max(-1, ...tags.map((tag) => tag.sortOrder)) + 1,
    };
    setBusy(true);
    setError('');
    onPendingChange(true);
    let unresolved = false;
    try {
      const result = await request<MutationResult>('/api/tags', 'POST', pending.current);
      if (!result.tag)
        throw new Error('생성 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.');
      onCreated(result.tag);
      const previous =
        group.selectionMode === 'single'
          ? selected.filter((id) => !tags.some((tag) => tag.id === id))
          : selected;
      onChange([...previous.filter((id) => id !== result.tag!.id), result.tag.id]);
      pending.current = null;
      setUncertain(false);
      setQuery('');
      if (group.selectionMode === 'single') setOpen(false);
      await onChanged();
    } catch (error) {
      setError((error as Error).message);
      if (error instanceof RequestError && error.status > 0 && error.status < 500) {
        pending.current = null;
        setUncertain(false);
      } else if (pending.current) {
        setUncertain(true);
        unresolved = true;
      }
    } finally {
      setBusy(false);
      onPendingChange(unresolved);
    }
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const buttons = [
        ...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ??
          []),
      ];
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        index < 0
          ? event.key === 'ArrowDown'
            ? 0
            : buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }
  return (
    <div className="tag-field" ref={root} onKeyDown={keyboard} data-control-name="tagIds">
      <div className="tag-field-label">
        <span>{group.name}</span>
        <div className="tag-field-label-actions">
          <small>{group.selectionMode === 'single' ? '하나 선택' : '여러 개 선택'}</small>
          {selectedTags.length > 0 && (
            <button
              type="button"
              className="tag-field-clear"
              disabled={disabled || locked}
              aria-label={`${group.name} 선택 비우기`}
              onClick={() => onChange(selected.filter((id) => !tags.some((tag) => tag.id === id)))}
            >
              비우기
            </button>
          )}
        </div>
      </div>
      <Popover
        label={`${group.name} 옵션 선택`}
        open={open && (!readonly || locked)}
        locked={locked}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setQuery('');
            setError('');
          }
        }}
        className="tag-popover-shell"
        trigger={(props) => (
          <button
            {...props}
            ref={(node) => {
              trigger.current = node;
              props.ref.current = node;
            }}
            type="button"
            className={`ui-control-trigger tag-field-trigger ${open ? 'is-open' : ''}`}
            disabled={disabled || readonly || locked}
            aria-label={`${group.name} 선택`}
          >
            <span className="tag-field-values">
              {selectedTags.length ? (
                selectedTags.map((tag) => (
                  <TagBadge
                    key={tag.id}
                    name={tag.name}
                    color={tag.color}
                    archived={tag.archived}
                  />
                ))
              ) : (
                <span className="tag-placeholder">선택 또는 새 옵션 만들기</span>
              )}
            </span>
            {!readonly && <ChevronDown size={15} />}
          </button>
        )}
      >
        {() => (
          <div className="tag-popover">
            <div className="tag-search">
              <Search size={16} />
              <input
                ref={input}
                data-autofocus="true"
                type="search"
                name="tagIds"
                value={query}
                maxLength={80}
                aria-label={`${group.name} 옵션 검색`}
                placeholder="옵션 검색 또는 만들기"
                disabled={locked}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();
                    const exact = options.find((tag) => tag.name === query.trim());
                    if (exact) choose(exact);
                    else if (query.trim() && !exactMatch) void create();
                  }
                }}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="옵션 선택 닫기"
                onClick={close}
                disabled={locked}
              >
                <X size={16} />
              </button>
            </div>
            {selectedTags.length > 0 && (
              <div className="tag-selected-options" aria-label={`${group.name} 선택한 옵션`}>
                {selectedTags.map((tag) => (
                  <TagBadge
                    key={tag.id}
                    name={tag.name}
                    color={tag.color}
                    archived={tag.archived}
                    disabled={locked || disabled}
                    onRemove={() => onChange(selected.filter((id) => id !== tag.id))}
                  />
                ))}
              </div>
            )}
            <p className="tag-choice-heading">옵션 선택 또는 만들기</p>
            <div
              id={listId}
              role="listbox"
              aria-label={`${group.name} 옵션`}
              aria-multiselectable={group.selectionMode === 'multiple'}
              className="tag-choice-list"
            >
              {options.map((tag) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected.includes(tag.id)}
                  aria-label={tag.name}
                  aria-describedby={tag.parentId ? `${listId}-${tag.id}-parent` : undefined}
                  disabled={locked || disabled}
                  className="tag-choice"
                  key={tag.id}
                  onClick={() => choose(tag)}
                >
                  <span className="tag-choice-content">
                    <TagBadge name={tag.name} color={tag.color} />
                    {tag.parentId && (
                      <small id={`${listId}-${tag.id}-parent`}>
                        상위 ·{' '}
                        {tags.find((parent) => parent.id === tag.parentId)?.name ?? '보관된 옵션'}
                      </small>
                    )}
                  </span>
                  <span className="tag-choice-check" aria-hidden="true">
                    {selected.includes(tag.id) && <Check size={16} />}
                  </span>
                </button>
              ))}
              {options.length === 0 && (
                <p className="tag-no-options">
                  {query ? '일치하는 옵션이 없어요.' : '첫 옵션을 만들어 보세요.'}
                </p>
              )}
            </div>
            {query.trim() && !exactMatch && (
              <button
                type="button"
                className="tag-create-option"
                aria-label={`“${query.trim()}” 만들기`}
                disabled={locked || disabled}
                onClick={() => void create()}
              >
                <Plus size={16} />
                <span>만들기</span>
                <TagBadge name={query.trim()} color="#64866f" />
              </button>
            )}
            {error && (
              <div className="tag-picker-error" role="alert">
                {error}
              </div>
            )}
            {uncertain && (
              <div className="tag-picker-retry">
                <p>생성 결과를 확인할 때까지 입력을 유지해요.</p>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void create()}
                >
                  {busy ? '확인 중…' : '생성 결과 다시 확인'}
                </button>
              </div>
            )}
            {busy && !uncertain && (
              <p className="tag-field-note" role="status">
                옵션을 만드는 중이에요…
              </p>
            )}
          </div>
        )}
      </Popover>
      {readonly && (
        <p className="tag-field-note">
          {group.archived
            ? '보관된 유형의 기존 선택이에요.'
            : '이 가계부에 적용되지 않는 기존 선택이에요.'}
        </p>
      )}
    </div>
  );
}
