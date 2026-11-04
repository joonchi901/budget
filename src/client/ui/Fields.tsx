import {
  useId,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode,
} from 'react';

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
/** On/off setting that applies at once. Use Checkbox for choices submitted with a form. */
export function Switch({ className = '', ...props }: Omit<InputProps, 'type' | 'role'>) {
  return (
    <input {...props} type="checkbox" role="switch" className={`ui-switch ${className}`.trim()} />
  );
}
/** Native range input redrawn with tokens; the filled part follows the value. */
export function Slider({
  min = 0,
  max = 100,
  value,
  defaultValue,
  onChange,
  className = '',
  style,
  ...props
}: Omit<InputProps, 'type'>) {
  // Without a defaultValue, browsers start a range input at its midpoint.
  const [uncontrolled, setUncontrolled] = useState(
    Number(defaultValue ?? (Number(min) + Number(max)) / 2),
  );
  const current = value === undefined ? uncontrolled : Number(value);
  const span = Number(max) - Number(min);
  const ratio = span > 0 ? (current - Number(min)) / span : 0;
  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      onChange={(event) => {
        if (value === undefined) setUncontrolled(Number(event.target.value));
        onChange?.(event);
      }}
      className={`ui-slider ${className}`.trim()}
      style={{ '--ui-slider-ratio': ratio, ...style } as CSSProperties}
    />
  );
}
export function Textarea({ className = '', ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea {...props} className={`ui-textarea ${className}`.trim()} />;
}
/** Composes labels without inserting extra elements between controls and their labels. */
export function Field({ className = '', ...props }: ComponentPropsWithRef<'label'>) {
  // The id lets controls that are buttons (date, month) name themselves with it and their value.
  return (
    <label
      id={props.htmlFor ? `${props.htmlFor}-label` : undefined}
      {...props}
      className={`ui-field-label ${className}`.trim()}
    />
  );
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
