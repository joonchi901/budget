import type { HTMLAttributes } from 'react';

export const won = (value: number) => new Intl.NumberFormat('ko-KR').format(value);

export type AmountProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** Amounts are positive; only signed results such as a remaining balance are negative. */
  value: number;
  tone?: 'income' | 'expense' | 'neutral';
  /** Prefix + for income and − for expense so meaning never relies on color alone; 0 has no sign. */
  signed?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

/** Korean won amount with fixed-width digits and a smaller unit. */
export function Amount({
  value,
  tone = 'neutral',
  signed = false,
  size = 'md',
  className = '',
  ...props
}: AmountProps) {
  const sign =
    value < 0
      ? '−'
      : !signed || value === 0
        ? ''
        : tone === 'income'
          ? '+'
          : tone === 'expense'
            ? '−'
            : '';
  return (
    <span {...props} className={`ui-amount ${className}`.trim()} data-tone={tone} data-size={size}>
      {sign}
      {won(Math.abs(value))}
      <span className="ui-amount-unit">원</span>
    </span>
  );
}
