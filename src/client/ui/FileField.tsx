import { useState, type InputHTMLAttributes } from 'react';
import { Upload } from 'lucide-react';
import { useControlLabel } from './Popover';

export function FileField({
  onChange,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [fileName, setFileName] = useState('');
  const { ref, label } = useControlLabel(props['aria-label']);
  return (
    <span className={`file-field ${className}`} ref={ref}>
      <span className="file-field-button" aria-hidden="true">
        <Upload size={17} />
        파일 선택
      </span>
      <span className="file-field-name" aria-hidden="true">
        {fileName || '선택한 파일이 없어요'}
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
