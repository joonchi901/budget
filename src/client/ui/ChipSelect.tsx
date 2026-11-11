import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from './Button';
import { ColorField, pickTagColor } from './ColorField';
import { Input } from './Fields';
import { badgeColors, isHexColor } from './Tag';

export type ChipOption = { id: string; name: string; color: string; archived?: boolean };

export type ChipSelectProps = {
  label: string;
  options: ChipOption[];
  /** Selected option ids; at most one unless `multiple`. */
  value: string[];
  onValueChange(value: string[]): void;
  multiple?: boolean;
  /**
   * Creates an option from typed text and its color, and returns its id. Omit to hide adding.
   * The color starts as the palette color least used by these options and can be changed.
   */
  onCreateOption?(name: string, color: string): string;
  /** false hides the color swatch while adding, for choices whose color means nothing. */
  optionColors?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Notion-style select: every option is a chip, selection toggles in place and a new option
 * can be typed without leaving the form. Archived options stay visible only while selected.
 */
export function ChipSelect({
  label,
  options,
  value,
  onValueChange,
  multiple = false,
  onCreateOption,
  optionColors = true,
  disabled,
  className = '',
}: ChipSelectProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftColor, setDraftColor] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  // Enter/Escape return focus to the add button; focus leaving the name and swatch means the user moved on.
  const refocus = useRef(false);
  // Enter, Escape and the blur that follows unmounting must finish an addition only once.
  const finished = useRef(false);
  useEffect(() => {
    if (adding || !refocus.current) return;
    refocus.current = false;
    addButton.current?.focus();
  }, [adding]);

  const toggle = (id: string) => {
    const selected = value.includes(id);
    if (multiple) onValueChange(selected ? value.filter((item) => item !== id) : [...value, id]);
    else onValueChange(selected ? [] : [id]);
  };
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const name = draft.trim();
    if (save && name && onCreateOption) {
      const existing = options.find(
        (option) => option.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      );
      const id = existing?.id ?? onCreateOption(name, draftColor);
      if (!value.includes(id)) onValueChange(multiple ? [...value, id] : [id]);
    }
    setDraft('');
    setAdding(false);
  };

  return (
    <fieldset className={`ui-chip-select ${className}`.trim()} disabled={disabled}>
      <legend>{label}</legend>
      <div className="ui-chip-select-options">
        {options
          .filter((option) => !option.archived || value.includes(option.id))
          .map((option) => {
            const selected = value.includes(option.id);
            return (
              <Button
                key={option.id}
                variant="plain"
                className="ui-chip"
                aria-pressed={selected}
                style={
                  selected
                    ? badgeColors(option.color)
                    : ({
                        '--ui-chip-color': isHexColor(option.color) ? option.color : undefined,
                      } as CSSProperties)
                }
                onClick={() => toggle(option.id)}
              >
                {selected ? <Check size={14} /> : <span className="ui-chip-dot" />}
                <span>{option.name}</span>
                {option.archived && <small>보관됨</small>}
              </Button>
            );
          })}
        {onCreateOption &&
          (adding ? (
            <span
              className="ui-chip-new"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) finish(true);
              }}
            >
              {optionColors && (
                <ColorField
                  compact
                  aria-label={`${label} 새 옵션 색상`}
                  value={draftColor}
                  onValueChange={setDraftColor}
                />
              )}
              <Input
                aria-label={`${label} 새 옵션 이름`}
                className="ui-chip-input"
                placeholder="새 옵션"
                value={draft}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    refocus.current = true;
                    finish(true);
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    refocus.current = true;
                    finish(false);
                  }
                }}
              />
            </span>
          ) : (
            <Button
              ref={addButton}
              variant="plain"
              className="ui-chip ui-chip-add"
              aria-label={`${label} 옵션 추가`}
              onClick={() => {
                finished.current = false;
                setDraftColor(pickTagColor(options.map((option) => option.color)));
                setAdding(true);
              }}
            >
              <Plus size={14} />
              추가
            </Button>
          ))}
      </div>
    </fieldset>
  );
}
