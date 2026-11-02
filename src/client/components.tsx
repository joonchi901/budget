import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { UgaIllustration, UgaMascot } from './brand/Uga';
import { Button, CloseButton, DialogCloseContext, FormBody, FormFooter, IconButton } from './ui';
import {
  navigationWarning,
  registerNavigationGuard,
  subscribeNavigationWarning,
} from './navigation-guard';

export const won = (value: number) => new Intl.NumberFormat('ko-KR').format(value);
export function useUnsavedGuard(hasUnsavedChanges: boolean) {
  useLayoutEffect(() => {
    if (!hasUnsavedChanges) return;
    const unregister = registerNavigationGuard();
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', warn);
    };
  }, [hasUnsavedChanges]);
}
export function Dialog({
  title,
  subtitle,
  onClose,
  locked = false,
  dirty = false,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose(): void;
  locked?: boolean;
  /** User closes must confirm discarding unsaved data; successful saves call onClose directly. */
  dirty?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [validationMessage, setValidationMessage] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestClose = () => {
    if (locked) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };
  const blockedNavigation = useSyncExternalStore(subscribeNavigationWarning, navigationWarning);
  const invalidFocus = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => {
      el.close();
      // Nested dialogs can close in either cleanup order. Restore only after both
      // have unmounted, and never focus an opener inside a removed parent dialog.
      queueMicrotask(() => {
        const target = opener.current;
        if (!el.isConnected && target?.isConnected && !target.closest('dialog:not([open])'))
          target.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <DialogCloseContext.Provider value={requestClose}>
      <dialog
        ref={ref}
        className="dialog"
        aria-label={title}
        onInputCapture={() => setValidationMessage('')}
        onInvalidCapture={(event) => {
          event.preventDefault();
          const field = event.target;
          if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
          if (field.classList.contains('control-validation')) return;
          if (invalidFocus.current) return;
          invalidFocus.current = true;
          setValidationMessage(field.validationMessage || '입력한 내용을 확인해 주세요.');
          queueMicrotask(() => {
            field.focus();
            invalidFocus.current = false;
          });
        }}
        onCancel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          requestClose();
        }}
      >
        <div className="dialog-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton type="button" aria-label="닫기" disabled={locked} onClick={requestClose}>
            <X size={20} />
          </IconButton>
        </div>
        {validationMessage && (
          <div className="dialog-validation-message" role="alert">
            {validationMessage}
          </div>
        )}
        {blockedNavigation && (
          <div className="dialog-validation-message" role="alert">
            {blockedNavigation}
          </div>
        )}
        {children}
        {confirmDiscard && (
          <Dialog
            title="입력 내용을 버릴까요?"
            onClose={() => setConfirmDiscard(false)}
            locked={locked}
          >
            <FormBody>
              <p>저장하지 않은 변경 내용이 사라져요.</p>
            </FormBody>
            <FormFooter>
              <CloseButton variant="secondary" autoFocus>
                계속 작성
              </CloseButton>
              <Button variant="primary" disabled={locked} onClick={onClose}>
                변경 내용 버리기
              </Button>
            </FormFooter>
          </Dialog>
        )}
      </dialog>
    </DialogCloseContext.Provider>
  );
}
export function Empty({
  children,
  illustration = 'empty',
}: {
  children: ReactNode;
  illustration?: 'empty' | 'search';
}) {
  return (
    <div className="empty uga-empty">
      {illustration === 'search' ? (
        <UgaMascot pose="search" size={92} />
      ) : (
        <UgaIllustration name="empty-state" size={120} />
      )}
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
