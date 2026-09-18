import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';

type InputProps = ComponentPropsWithRef<'input'>;
/** Preserve the native input contract, including refs, validation and form submission. */
export function Input({ className = '', ...props }: InputProps) {
  return <input {...props} className={`ui-input ${className}`.trim()} />;
}
export function Checkbox({ className = '', ...props }: Omit<InputProps, 'type'>) {
  return <input {...props} type="checkbox" className={`ui-checkbox ${className}`.trim()} />;
}
export function Radio({ className = '', ...props }: Omit<InputProps, 'type'>) {
  return <input {...props} type="radio" className={`ui-radio ${className}`.trim()} />;
}
export function Textarea({ className = '', ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea {...props} className={`ui-textarea ${className}`.trim()} />;
}
/** Composes labels without inserting extra elements between controls and their labels. */
export function Field({ className = '', ...props }: ComponentPropsWithRef<'label'>) {
  return <label {...props} className={`ui-field-label ${className}`.trim()} />;
}
/** A field with an explicit description/error association for new form composition. */
export function TextField({
  label,
  hint,
  error,
  id: providedId,
  ...props
}: InputProps & { label: ReactNode; hint?: string; error?: string }) {
  const generatedId = useId();
  const id = providedId ?? `field-${generatedId}`;
  const describedBy =
    [props['aria-describedby'], hint && `${id}-hint`, error && `${id}-error`]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="ui-text-field">
      <Field htmlFor={id}>{label}</Field>
      <Input
        {...props}
        id={id}
        aria-invalid={Boolean(error) || props['aria-invalid']}
        aria-describedby={describedBy}
      />
      {hint && (
        <p id={`${id}-hint`} className="small muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="control-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
