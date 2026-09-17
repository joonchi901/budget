/** Assets from the reviewed Uga board. These images never alter stored ledger values. */
type AssetProps = { size?: number; className?: string; alt?: string };

export type UgaIconName =
  | 'home'
  | 'ledger'
  | 'assets'
  | 'payments'
  | 'analytics'
  | 'planning'
  | 'tags'
  | 'data'
  | 'bone'
  | 'bones'
  | 'heart'
  | 'star'
  | 'sprout'
  | 'meat'
  | 'moneybag';

export type UgaPose =
  | 'representative'
  | 'wave'
  | 'thumbs-up'
  | 'celebrate'
  | 'love'
  | 'thinking'
  | 'search'
  | 'record'
  | 'work'
  | 'rest';

export function UgaIcon({
  name,
  size = 24,
  className = '',
  alt = '',
}: AssetProps & { name: UgaIconName }) {
  return (
    <img
      className={`uga-icon ${className}`.trim()}
      src={`/brand/uga-icon-${name}.svg`}
      width={size}
      height={size}
      alt={alt}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
}

export function UgaMascot({
  pose = 'representative',
  size = 120,
  className = '',
  alt = '',
}: AssetProps & { pose?: UgaPose }) {
  return (
    <img
      className={`uga-mascot ${className}`.trim()}
      src={
        pose === 'representative' ? '/brand/uga-character.svg' : `/brand/uga-sticker-${pose}.svg`
      }
      width={size}
      height={size}
      alt={alt}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
}

export function UgaAvatar({
  mood = 'happy',
  size = 36,
  className = '',
  alt = '',
}: AssetProps & { mood?: 'happy' | 'calm' | 'surprise' | 'sleep' }) {
  return (
    <img
      className={`uga-avatar ${className}`.trim()}
      src={`/brand/uga-avatar-${mood}.svg`}
      width={size}
      height={size}
      alt={alt}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
}

export function UgaLogo({
  variant = 'horizontal',
  size = 170,
  className = '',
  alt = '',
}: AssetProps & { variant?: 'primary' | 'horizontal' }) {
  return (
    <img
      className={`uga-logo uga-logo-${variant} ${className}`.trim()}
      src={`/brand/uga-logo-${variant}.svg`}
      width={size}
      height={Math.round(size * (variant === 'primary' ? 667 / 480 : 240 / 520))}
      alt={alt}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
}

export function UgaIllustration({
  name,
  size = 120,
  className = '',
  alt = '',
}: AssetProps & { name: 'empty-state' | 'card-header' | 'badge-pick' }) {
  const ratio = { 'empty-state': 264 / 400, 'card-header': 180 / 360, 'badge-pick': 168 / 200 }[
    name
  ];
  return (
    <img
      className={`uga-illustration ${className}`.trim()}
      src={`/brand/uga-${name}.svg`}
      width={size}
      height={Math.round(size * ratio)}
      alt={alt}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
}

// Keep the original values for existing records, imports and API compatibility.
export const UGA_LEDGER_ICONS = [
  { value: '✈️', label: '여행 · 새싹', icon: 'sprout' },
  { value: '🍊', label: '일상 · 하트', icon: 'heart' },
  { value: '🏠', label: '우리 집', icon: 'home' },
  { value: '🎉', label: '기념일 · 별', icon: 'star' },
  { value: '📒', label: '기록 · 가계부', icon: 'ledger' },
] as const;

export function UgaLedgerIcon({ value, ...props }: AssetProps & { value?: string }) {
  const icon =
    value === '🏡'
      ? 'home'
      : (UGA_LEDGER_ICONS.find((choice) => choice.value === value)?.icon ?? 'ledger');
  return <UgaIcon name={icon} {...props} />;
}

export const UGA_CHART_COLORS = [
  'var(--brand-coral)',
  'var(--brand-mint)',
  'var(--brand-sky)',
  'var(--brand-character-tunic)',
  'var(--brand-brown)',
  'var(--brand-accent)',
] as const;
