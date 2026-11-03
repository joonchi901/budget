import { useState, type InputHTMLAttributes } from 'react';
import { Upload } from 'lucide-react';
import { useControlLabel } from './Popover';

export function FileField({
  onChange,
  className = '',
  buttonText = '파일 선택',
  emptyText = '선택한 파일이 없어요',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  buttonText?: string;
  /** Shown until a file is chosen, such as what may be chosen. */
  emptyText?: string;
}) {
  const [fileName, setFileName] = useState('');
  const { ref, label } = useControlLabel(props['aria-label']);
  return (
    <span className={`file-field ${className}`} ref={ref}>
      <span className="file-field-button" aria-hidden="true">
        <Upload size={17} />
        {buttonText}
      </span>
      <span className="file-field-name" aria-hidden="true">
        {fileName || emptyText}
      </span>
      <input
        {...props}
        type="file"
        aria-label={label || undefined}
        onChange={(event) => {
          setFileName([...(event.target.files ?? [])].map((file) => file.name).join(', '));
          onChange?.(event);
        }}
      />
    </span>
  );
}
