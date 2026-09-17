import { Tooltip } from './Tooltip';
import {
  Children,
  Fragment,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactNode,
  type FocusEventHandler,
} from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Popover, useControlLabel } from './Popover';

interface OptionProps {
  value: string | number;
  children: ReactNode;
  disabled?: boolean;
}
interface GroupProps {
  label: string;
  children: ReactNode;
  disabled?: boolean;
}
export function SelectOption(_props: OptionProps) {
  return null;
}
export function SelectGroup(_props: GroupProps) {
  return null;
}
type Option = {
  value: string;
  content: ReactNode;
  text: string;
  disabled?: boolean;
  group?: string;
};
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (isValidElement<{ children?: ReactNode; name?: string }>(node))
    return node.props.name ?? textOf(node.props.children);
  return Children.toArray(node)
    .map((child) => textOf(child))
    .join('');
}
function optionsOf(children: ReactNode, group?: string, disabled = false): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionProps & GroupProps>(child)) return [];
    if (child.type === Fragment) return optionsOf(child.props.children, group, disabled);
    if (child.type === SelectGroup)
      return optionsOf(child.props.children, child.props.label, disabled || child.props.disabled);
    return [
      {
        value: String(child.props.value),
        content: child.props.children,
        text: textOf(child.props.children),
        disabled: disabled || child.props.disabled,
        group,
      },
    ];
  });
}

export function SelectField({
  value,
  onValueChange,
  children,
  className = '',
  disabled,
  required,
  id: suppliedId,
  name,
  onFocus,
  onBlur,
  'aria-label': explicitLabel,
  'aria-describedby': describedBy,
  title,
  searchable,
}: {
  value: string | number;
  onValueChange(value: string): void;
  children: ReactNode;
  id?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  title?: string;
  onFocus?: FocusEventHandler<HTMLElement>;
  onBlur?: FocusEventHandler<HTMLElement>;
  searchable?: boolean;
}) {
  const generated = useId();
  const id = suppliedId ?? generated;
  const { ref, label } = useControlLabel(explicitLabel);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [invalid, setInvalid] = useState(false);
  const options = optionsOf(children);
  const selected = options.find((option) => option.value === String(value));
  const showSearch = searchable ?? options.length > 7;
  const visible = options.filter((option) =>
    option.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const list = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: '', time: 0 });
  function move(event: React.KeyboardEvent) {
    const buttons = [
      ...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ??
        []),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    if (event.key === 'ArrowUp')
      next = index < 0 ? buttons.length - 1 : (index - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home' && event.target instanceof HTMLButtonElement) next = 0;
    if (event.key === 'End' && event.target instanceof HTMLButtonElement) next = buttons.length - 1;
    if (!showSearch && event.key.length === 1 && event.key !== ' ') {
      const now = Date.now();
      typeahead.current.text =
        (now - typeahead.current.time > 600 ? '' : typeahead.current.text) + event.key;
      typeahead.current.time = now;
      next = buttons.findIndex((button) =>
        button.textContent
          ?.trim()
          .toLocaleLowerCase()
          .startsWith(typeahead.current.text.toLocaleLowerCase()),
      );
    }
    if (next !== undefined && buttons.length) {
      event.preventDefault();
      buttons[next]?.focus();
    }
  }
  return (
    <span
      className={`ui-field select-field ${className}`}
      data-control-name={name}
      ref={ref}
      onFocus={(event) => {
        if (!ref.current?.contains(event.relatedTarget as Node)) onFocus?.(event);
      }}
      onBlur={(event) => {
        if (!ref.current?.contains(event.relatedTarget as Node)) onBlur?.(event);
      }}
    >
      <Popover
        label={`${label || '항목'} 선택`}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setQuery('');
        }}
        trigger={(props) => (
          <Tooltip content={title}>
            <button
              {...props}
              type="button"
              id={id}
              name={name}
              disabled={disabled}
              role="combobox"
              aria-label={label || undefined}
              aria-haspopup="listbox"
              aria-controls={`${id}-options`}
              aria-required={required}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              data-value={value}
              className="ui-control-trigger select-trigger"
              onKeyDown={(event) => {
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  setOpen(true);
                }
              }}
            >
              <span className="select-value">
                {selected?.content ?? <span className="control-placeholder">선택해 주세요</span>}
              </span>
              <ChevronDown size={17} />
            </button>
          </Tooltip>
        )}
      >
        {({ close }) => (
          <div className="select-menu" onKeyDown={move}>
            {showSearch && (
              <div className="control-search">
                <Search size={17} />
                <input
                  type="search"
                  value={query}
                  aria-label={`${label || '항목'} 검색`}
                  placeholder="옵션 검색"
                  data-autofocus="true"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const option = visible.find((item) => !item.disabled);
                      if (option) {
                        onValueChange(option.value);
                        setInvalid(false);
                        close();
                      }
                    }
                  }}
                />
              </div>
            )}
            <div
              ref={list}
              id={`${id}-options`}
              role={visible.length ? 'listbox' : undefined}
              aria-label={visible.length ? label || '항목' : undefined}
              className="select-options"
            >
              {visible.map((option, index) => (
                <Fragment key={option.value}>
                  {option.group && option.group !== visible[index - 1]?.group && (
                    <div className="select-group-label">{option.group}</div>
                  )}
                  <button
                    type="button"
                    role="option"
                    data-value={option.value}
                    aria-selected={option.value === String(value)}
                    disabled={option.disabled}
                    data-autofocus={
                      !showSearch && (option.value === String(value) || (!selected && index === 0))
                        ? 'true'
                        : undefined
                    }
                    className="select-option"
                    onClick={() => {
                      onValueChange(option.value);
                      setInvalid(false);
                      close();
                    }}
                  >
                    <span>{option.content}</span>
                    <Check
                      size={17}
                      className={option.value === String(value) ? '' : 'select-check-hidden'}
                    />
                  </button>
                </Fragment>
              ))}
              {!visible.length && (
                <p className="control-empty" role="status">
                  일치하는 항목이 없어요.
                </p>
              )}
            </div>
          </div>
        )}
      </Popover>
      <input
        className="control-validation"
        type="text"
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onInvalid={(event) => {
          event.preventDefault();
          setInvalid(true);
          setOpen(true);
        }}
      />
      {invalid && (
        <span className="control-error" role="alert">
          항목을 선택해 주세요.
        </span>
      )}
    </span>
  );
}
