import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

export function useControlLabel(explicit?: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const [derived, setDerived] = useState('');
  useLayoutEffect(() => {
    if (explicit) return;
    const root = ref.current;
    const label = root?.closest('label');
    if (!root || !label) return;
    const text = [...label.childNodes]
      .filter((node) => !node.contains(root))
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    setDerived(text);
  });
  return { ref, label: explicit ?? derived };
}

interface TriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  onClick(): void;
  'aria-expanded': boolean;
  'aria-haspopup': 'dialog';
  'aria-controls': string;
}

export function Popover({
  trigger,
  children,
  label,
  open: controlled,
  onOpenChange,
  locked = false,
  className = '',
  matchTriggerWidth = true,
  preferredWidth = 292,
}: {
  trigger(props: TriggerProps): ReactNode;
  children(context: { close(): void }): ReactNode;
  label: string;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  locked?: boolean;
  className?: string;
  matchTriggerWidth?: boolean;
  preferredWidth?: number;
}) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlled ?? localOpen;
  const latest = useRef({ open, locked, onOpenChange });
  latest.current = { open, locked, onOpenChange };
  function setOpen(next: boolean, restore = false) {
    if (!next && latest.current.locked) return;
    if (next && anchor.current?.matches(':disabled')) return;
    setLocalOpen(next);
    latest.current.onOpenChange?.(next);
    if (!next && restore) anchor.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    const node = panel.current;
    const button = anchor.current;
    if (!open || !node || !button) return;
    document.dispatchEvent(new CustomEvent('budget:popover-open', { detail: id }));
    node.showPopover();
    function position() {
      if (!node || !button) return;
      const bounds = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = viewport?.width ?? innerWidth;
      const height = viewport?.height ?? innerHeight;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      const panelWidth = Math.min(
        width - 16,
        Math.max(matchTriggerWidth ? bounds.width : 0, preferredWidth),
      );
      node.style.width = `${panelWidth}px`;
      node.style.maxHeight = `${Math.min(440, height - 32)}px`;
      const panelHeight = node.getBoundingClientRect().height;
      const below = offsetTop + height - bounds.bottom - 12;
      const above = bounds.top - offsetTop - 12;
      const top =
        panelHeight <= below || below >= above
          ? Math.min(bounds.bottom + 8, offsetTop + height - panelHeight - 12)
          : Math.max(offsetTop + 12, bounds.top - panelHeight - 8);
      node.style.left = `${Math.max(offsetLeft + 8, Math.min(bounds.left, offsetLeft + width - panelWidth - 8))}px`;
      node.style.top = `${Math.max(offsetTop + 12, top)}px`;
    }
    position();
    const focus =
      node.querySelector<HTMLElement>('[data-autofocus="true"]:not(:disabled)') ??
      node.querySelector<HTMLElement>('input:not(:disabled),button:not(:disabled),[tabindex="0"]');
    focus?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(node);
    observer.observe(button);
    function pointer(event: PointerEvent) {
      if (!node?.contains(event.target as Node) && !button?.contains(event.target as Node))
        setOpen(false);
    }
    function keyboard(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false, true);
    }
    function focusOut(event: FocusEvent) {
      if (!node?.contains(event.target as Node) && !button?.contains(event.target as Node))
        setOpen(false);
    }
    function another(event: Event) {
      if ((event as CustomEvent).detail !== id) setOpen(false);
    }
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', keyboard, true);
    document.addEventListener('focusin', focusOut);
    document.addEventListener('budget:popover-open', another);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', keyboard, true);
      document.removeEventListener('focusin', focusOut);
      document.removeEventListener('budget:popover-open', another);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      if (node.matches(':popover-open')) node.hidePopover();
    };
  }, [open, id, matchTriggerWidth, preferredWidth]);

  return (
    <>
      {trigger({
        ref: anchor,
        onClick: () => setOpen(!open),
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        'aria-controls': id,
      })}
      {open && (
        <div
          id={id}
          ref={panel}
          popover="manual"
          role="dialog"
          aria-label={label}
          className={`ui-popover ${className}`}
        >
          {children({ close: () => setOpen(false, true) })}
        </div>
      )}
    </>
  );
}
