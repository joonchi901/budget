import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import './tooltip.css';

interface TooltipProps {
  content?: string;
  children: ReactElement;
}

export function Tooltip({ content, children }: TooltipProps) {
  return content ? <TooltipContent content={content}>{children}</TooltipContent> : children;
}

function TooltipContent({ content, children }: TooltipProps & { content: string }) {
  const id = useId();
  const anchor = useRef<HTMLElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const opening = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interaction = useRef({
    anchorHover: false,
    panelHover: false,
    focus: false,
    blocked: false,
  });
  const [open, setOpen] = useState(false);
  const child = children as ReactElement<HTMLAttributes<HTMLElement>>;

  function cancelTimers() {
    if (opening.current) clearTimeout(opening.current);
    if (closing.current) clearTimeout(closing.current);
    opening.current = closing.current = null;
  }
  function dismiss(block = false) {
    cancelTimers();
    if (block) interaction.current.blocked = true;
    interaction.current.panelHover = false;
    setOpen(false);
  }
  function resetWhenIdle() {
    const state = interaction.current;
    if (!state.anchorHover && !state.panelHover && !state.focus) state.blocked = false;
  }
  function leave() {
    cancelTimers();
    resetWhenIdle();
    if (!interaction.current.focus)
      closing.current = setTimeout(() => {
        const state = interaction.current;
        if (!state.anchorHover && !state.panelHover && !state.focus) dismiss();
      }, 120);
  }
  useEffect(() => () => cancelTimers(), []);
  useLayoutEffect(() => {
    const node = panel.current;
    const target = anchor.current;
    if (!open || !node || !target) return;
    node.showPopover();
    function position() {
      if (!node || !target) return;
      const bounds = target.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = viewport?.width ?? innerWidth;
      const height = viewport?.height ?? innerHeight;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      node.style.maxWidth = `${Math.min(320, width - 24)}px`;
      node.style.maxHeight = `${height - 24}px`;
      const tooltip = node.getBoundingClientRect();
      const above = bounds.top - tooltip.height - 8;
      const desiredTop = above >= top + 12 ? above : bounds.bottom + 8;
      node.style.left = `${Math.max(left + 12, Math.min(bounds.left + (bounds.width - tooltip.width) / 2, left + width - tooltip.width - 12))}px`;
      node.style.top = `${Math.max(top + 12, Math.min(desiredTop, top + height - tooltip.height - 12))}px`;
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(node);
    observer.observe(target);
    function keyboard(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
    }
    function pointer() {
      dismiss(true);
    }
    function focus(event: FocusEvent) {
      if (!target?.contains(event.target as Node)) {
        interaction.current.focus = false;
        dismiss();
        resetWhenIdle();
      }
    }
    window.addEventListener('keydown', keyboard, true);
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('focusin', focus);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', keyboard, true);
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('focusin', focus);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      if (node.isConnected && node.matches(':popover-open')) node.hidePopover();
    };
  }, [open, content]);

  const trigger = cloneElement(child, {
    title: undefined,
    'aria-describedby':
      [child.props['aria-describedby'], open ? id : undefined].filter(Boolean).join(' ') ||
      undefined,
    onPointerEnter(event) {
      child.props.onPointerEnter?.(event);
      if (event.pointerType === 'touch' || panel.current?.contains(event.target as Node)) return;
      anchor.current = event.currentTarget;
      resetWhenIdle();
      interaction.current.anchorHover = true;
      cancelTimers();
      if (!interaction.current.blocked)
        opening.current = setTimeout(() => {
          if (interaction.current.anchorHover && !interaction.current.blocked) setOpen(true);
        }, 300);
    },
    onPointerLeave(event) {
      child.props.onPointerLeave?.(event);
      interaction.current.anchorHover = false;
      leave();
    },
    onFocus(event) {
      child.props.onFocus?.(event);
      if (event.target !== event.currentTarget || !event.currentTarget.matches(':focus-visible'))
        return;
      anchor.current = event.currentTarget;
      interaction.current.focus = true;
      cancelTimers();
      if (!interaction.current.blocked) setOpen(true);
    },
    onBlur(event) {
      child.props.onBlur?.(event);
      interaction.current.focus = false;
      dismiss();
      resetWhenIdle();
    },
    onPointerDown(event) {
      child.props.onPointerDown?.(event);
      dismiss(true);
    },
    onClick(event) {
      child.props.onClick?.(event);
      dismiss(true);
    },
  });
  return (
    <>
      {trigger}
      {open &&
        anchor.current &&
        createPortal(
          <span
            ref={panel}
            id={id}
            className="ui-tooltip"
            role="tooltip"
            popover="manual"
            onPointerEnter={(event) => {
              if (event.pointerType === 'touch') return;
              interaction.current.panelHover = true;
              cancelTimers();
            }}
            onPointerLeave={() => {
              interaction.current.panelHover = false;
              leave();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {content}
          </span>,
          anchor.current.closest('dialog') ?? document.body,
        )}
    </>
  );
}
