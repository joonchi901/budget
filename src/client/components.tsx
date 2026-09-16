import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export const won = (value: number) => new Intl.NumberFormat('ko-KR').format(value);
export const labels = { expense: '지출', income: '수입' };
export const fieldName = (field: string | null) =>
  ({
    amount: '금액',
    description: '내용',
    date: '날짜',
    tagIds: '태그',
    ownerId: '귀속',
    paymentMethodId: '결제수단',
    allocationAsset: '배분 자산',
    allocationAmount: '배분 금액',
    assetId: '출금 자산',
    toAssetId: '입금 자산',
  })[field ?? ''] ?? '내역';
export const ownerName = (id: string) => (id === 'shared' ? '공동' : id === 'u1' ? '나' : '와이프');
export function useUnsavedGuard(hasUnsavedChanges: boolean) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);
}
export function Dialog({
  title,
  subtitle,
  onClose,
  locked = false,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose(): void;
  locked?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.showModal();
    // Close before React removes the node so the browser restores the opener's focus.
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="닫기"
          disabled={locked}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <span>✦</span>
      <p>{children}</p>
    </div>
  );
}
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
