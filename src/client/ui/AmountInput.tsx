import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { won } from './Amount';

// shortcut: 12 digits (under 1조 원) keeps values exact as JS numbers; raise only with a decimal type.
const MAX_DIGITS = 12;

export type AmountInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'inputMode'
> & {
  value: number | null;
  onValueChange(value: number | null): void;
};

/** Large won input for record entry: digits only, grouped while typing, caret kept in place. */
export function AmountInput({ value, onValueChange, className = '', ...props }: AmountInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);
  useLayoutEffect(() => {
    const element = input.current;
    const digits = caretDigits.current;
    if (!element || digits === null) return;
    caretDigits.current = null;
    let position = 0;
    for (let seen = 0; position < element.value.length && seen < digits; position++)
      if (/\d/.test(element.value[position])) seen++;
    element.setSelectionRange(position, position);
  });
  return (
    <span className={`ui-amount-input ${className}`.trim()}>
      <input
        {...props}
        ref={input}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value === null ? '' : won(value)}
        onChange={(event) => {
          const { value: text, selectionStart } = event.target;
          caretDigits.current = text
            .slice(0, selectionStart ?? text.length)
            .replace(/\D/g, '').length;
          const digits = text
            .replace(/\D/g, '')
            .replace(/^0+(?=\d)/, '')
            .slice(0, MAX_DIGITS);
          onValueChange(digits ? Number(digits) : null);
        }}
      />
      <span className="ui-amount-input-unit" aria-hidden="true">
        원
      </span>
    </span>
  );
}
