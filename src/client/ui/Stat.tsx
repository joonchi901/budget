import { won } from './Amount';

export function Stat({
  label,
  amount,
  hint,
  accent = false,
}: {
  label: string;
  amount: number;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className={`stat ${accent ? 'accent' : ''}`}>
      <span>{label}</span>
      <strong>
        {won(amount)}
        <small>원</small>
      </strong>
      <p>{hint}</p>
    </div>
  );
}
