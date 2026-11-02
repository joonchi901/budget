import { useRef, type ComponentPropsWithoutRef } from 'react';
import { Search, X } from 'lucide-react';
import { IconButton } from './Button';
import { Input } from './Fields';

export type SearchFieldProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange'
> & {
  value: string;
  onValueChange(value: string): void;
  'aria-label': string;
};

/** Search input with a clear button; Escape also clears. */
export function SearchField({
  value,
  onValueChange,
  onKeyDown,
  className = '',
  ...props
}: SearchFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className={`ui-search-field ${className}`.trim()}>
      <Search size={18} aria-hidden="true" />
      <Input
        {...props}
        ref={input}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onValueChange('');
          }
          onKeyDown?.(event);
        }}
      />
      {value && (
        <IconButton
          aria-label="검색어 지우기"
          onClick={() => {
            onValueChange('');
            input.current?.focus();
          }}
        >
          <X size={18} />
        </IconButton>
      )}
    </span>
  );
}
