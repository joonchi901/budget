import { X } from 'lucide-react';
import { Button } from './Button';

/** An applied filter. The whole chip removes it; the name says what is removed. */
export function FilterChip({
  label,
  onRemove,
  className = '',
}: {
  label: string;
  onRemove(): void;
  className?: string;
}) {
  return (
    <Button
      variant="plain"
      className={`ui-filter-chip ${className}`.trim()}
      aria-label={`${label} 필터 해제`}
      onClick={onRemove}
    >
      <span>{label}</span>
      <X size={16} />
    </Button>
  );
}
