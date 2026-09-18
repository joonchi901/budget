import { useId, useRef, type ReactNode, type KeyboardEvent, type HTMLAttributes } from 'react';
import { Button } from './Button';
export interface ChoiceOption<Value extends string> {
  value: Value;
  label: ReactNode;
  disabled?: boolean;
  id?: string;
  panelId?: string;
}
export interface ChoiceGroupProps<Value extends string> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> {
  value: Value;
  onValueChange(value: Value): void;
  options: readonly ChoiceOption<Value>[];
  disabled?: boolean;
  appearance?: 'segmented' | 'plain';
  'aria-label': string;
}
function ChoiceGroup<Value extends string>({
  value,
  onValueChange,
  options,
  disabled = false,
  className = '',
  tabs = false,
  appearance = 'segmented',
  ...props
}: ChoiceGroupProps<Value> & { tabs?: boolean }) {
  const id = useId();
  const refs = useRef(new Map<Value, HTMLButtonElement>());
  const active =
    options.find((option) => option.value === value && !option.disabled) ??
    options.find((option) => !option.disabled);
  function move(event: KeyboardEvent<HTMLButtonElement>, current: Value) {
    if (disabled) return;
    const enabled = options.filter((option) => !option.disabled);
    const index = enabled.findIndex((option) => option.value === current);
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next =
      event.key === 'Home'
        ? enabled[0]
        : event.key === 'End'
          ? enabled.at(-1)
          : offset
            ? enabled[(index + offset + enabled.length) % enabled.length]
            : undefined;
    if (!next) return;
    event.preventDefault();
    onValueChange(next.value);
    refs.current.get(next.value)?.focus();
  }
  return (
    <div
      {...props}
      className={`${tabs ? 'ui-tabs' : appearance === 'plain' ? 'ui-choice-group' : 'segmented ui-segmented'} ${className}`.trim()}
      role={tabs ? 'tablist' : 'group'}
    >
      {options.map((option) => (
        <Button
          key={option.value}
          variant="plain"
          type="button"
          ref={(element) => {
            if (element) refs.current.set(option.value, element);
            else refs.current.delete(option.value);
          }}
          id={option.id ?? (tabs ? `${id}-${option.value}` : undefined)}
          role={tabs ? 'tab' : undefined}
          aria-selected={tabs ? value === option.value : undefined}
          aria-pressed={tabs ? undefined : value === option.value}
          aria-controls={tabs ? option.panelId : undefined}
          tabIndex={active?.value === option.value ? 0 : -1}
          className={value === option.value ? 'selected' : ''}
          disabled={disabled || option.disabled}
          onKeyDown={(event) => move(event, option.value)}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
export function SegmentedControl<Value extends string>(props: ChoiceGroupProps<Value>) {
  return <ChoiceGroup {...props} />;
}
/** Associate each option with a panelId and keep inactive panels mounted with hidden. */
export function Tabs<Value extends string>(props: ChoiceGroupProps<Value>) {
  return <ChoiceGroup {...props} tabs />;
}
