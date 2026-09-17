import type { ComponentPropsWithRef } from 'react';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  /** Use plain for a domain pattern that owns its visual treatment, such as room tabs. */
  variant?: 'primary' | 'secondary' | 'text' | 'plain';
  /** Keep the label stable while preventing repeat submission. */
  busy?: boolean;
};

const variantClass = { primary: 'primary', secondary: 'secondary', text: 'text-button', plain: '' };

/** Native button semantics with explicit action styling and a safe non-submit default. */
export function Button({
  variant = 'secondary',
  busy = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`ui-button ${variantClass[variant]} ${className}`.trim()}
      disabled={disabled || busy}
      aria-busy={busy || props['aria-busy'] || undefined}
    >
      {children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, 'variant' | 'aria-label'> & {
  /** Icon-only actions must have an accessible name. Use Tooltip separately when needed. */
  'aria-label': string;
};

export function IconButton({ className = '', ...props }: IconButtonProps) {
  return (
    <Button {...props} variant="plain" className={`icon-button ui-icon-button ${className}`} />
  );
}
