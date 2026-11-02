import { useLayoutEffect, useState } from 'react';
import { Popover } from './Popover';
import './color-field.css';

/** Tag colors that read well as tinted badges and bars. */
const PALETTE = [
  '#D28C70',
  '#F08A5D',
  '#E8AD3F',
  '#B9A27A',
  '#64866F',
  '#38735B',
  '#7CC7F2',
  '#6C89A4',
  '#286588',
  '#9176A6',
  '#AE393B',
  '#4B4B4B',
];

interface ColorFieldProps {
  value: string;
  onValueChange(value: string): void;
  'aria-label'?: string;
  name?: string;
  disabled?: boolean;
  /** Swatch-only button that opens the palette; the hex input moves into the panel. */
  compact?: boolean;
}

export function ColorField({
  value,
  onValueChange,
  'aria-label': ariaLabel = '직접 색상 선택',
  name,
  disabled,
  compact = false,
}: ColorFieldProps) {
  const [draft, setDraft] = useState(value);
  // Synchronize external color changes before the field becomes interactive.
  // A deferred effect can overwrite the first edit after the field mounts.
  useLayoutEffect(() => setDraft(value), [value]);
  const field = (
    <span className="color-field">
      <span className="color-field-swatch" style={{ backgroundColor: value }} aria-hidden="true" />
      <input
        type="text"
        name={name}
        aria-label={compact ? `${ariaLabel} 직접 입력` : ariaLabel}
        disabled={disabled}
        value={draft}
        maxLength={7}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="#64866F"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (/^#[0-9a-f]{6}$/i.test(next)) onValueChange(next);
        }}
        onBlur={() => {
          if (!/^#[0-9a-f]{6}$/i.test(draft)) setDraft(value);
        }}
      />
    </span>
  );
  if (!compact) return field;
  return (
    <Popover
      label={ariaLabel}
      matchTriggerWidth={false}
      preferredWidth={232}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          className="color-field-trigger"
          aria-label={ariaLabel}
          disabled={disabled}
        >
          <span className="color-field-swatch" style={{ backgroundColor: value }} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="color-field-panel">
          <div className="color-field-palette" role="group" aria-label="추천 색상">
            {PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className="color-field-option"
                style={{ backgroundColor: color }}
                aria-label={color}
                aria-pressed={color.toLowerCase() === value.toLowerCase()}
                onClick={() => {
                  onValueChange(color);
                  close();
                }}
              />
            ))}
          </div>
          {field}
        </div>
      )}
    </Popover>
  );
}
