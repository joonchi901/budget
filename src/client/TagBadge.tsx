import { Tooltip } from './Tooltip';
import type { CSSProperties } from 'react';
import { X } from 'lucide-react';
import './tag-badge.css';

interface TagBadgeProps {
  name: string;
  color: string;
  archived?: boolean;
  title?: string;
  onRemove?(): void;
  removeLabel?: string;
  disabled?: boolean;
}

function badgeColors(color: string): CSSProperties {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : '707c83';
  const rgb = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const background = rgb.map((channel) => Math.round(channel * 0.18 + 255 * 0.82));
  const luminance = (channels: number[]) =>
    channels
      .map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  let foreground = rgb;
  while ((luminance(background) + 0.05) / (luminance(foreground) + 0.05) < 4.5)
    foreground = foreground.map((channel) => Math.floor(channel * 0.9));
  return {
    backgroundColor: `rgb(${background.join(', ')})`,
    color: `rgb(${foreground.join(', ')})`,
  };
}

/** The same saved tag color is used for record cells, pickers and management previews. */
export function TagBadge({
  name,
  color,
  archived,
  title,
  onRemove,
  removeLabel,
  disabled,
}: TagBadgeProps) {
  return (
    <Tooltip content={title}>
      <span
        className={`tag-badge custom-tag${onRemove ? ' tag-badge-removable' : ''}`}
        style={badgeColors(color)}
      >
        <span className="tag-badge-name">{name}</span>
        {archived && <small>보관됨</small>}
        {onRemove && (
          <button
            type="button"
            className="tag-badge-remove"
            aria-label={removeLabel ?? `${name} 선택 해제`}
            disabled={disabled}
            onClick={onRemove}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </span>
    </Tooltip>
  );
}
