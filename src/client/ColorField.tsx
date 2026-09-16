import { useEffect, useState } from 'react';
import './color-field.css';

interface ColorFieldProps {
  value: string;
  onValueChange(value: string): void;
  'aria-label'?: string;
  name?: string;
  disabled?: boolean;
}

export function ColorField({
  value,
  onValueChange,
  'aria-label': ariaLabel = '직접 색상 선택',
  name,
  disabled,
}: ColorFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <span className="color-field">
      <span className="color-field-swatch" style={{ backgroundColor: value }} aria-hidden="true" />
      <input
        type="text"
        name={name}
        aria-label={ariaLabel}
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
}
