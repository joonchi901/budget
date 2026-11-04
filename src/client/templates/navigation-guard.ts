/** Sent when the phone's back should close the topmost sheet instead of leaving the screen. */
export const SHEET_BACK = 'uga:sheet-back';

const guards = new Set<symbol>();
const listeners = new Set<() => void>();
let warning = '';
let pending: (() => void) | undefined;

function publish(next: string) {
  if (warning === next) return;
  warning = next;
  listeners.forEach((listener) => listener());
}

export function registerNavigationGuard(): () => void {
  const id = Symbol('unsaved form');
  guards.add(id);
  return () => {
    guards.delete(id);
    if (!guards.size) publish('');
  };
}

export function allowAppNavigation(): boolean {
  if (!guards.size) return true;
  publish(
    '입력 내용 보호를 위해 이동하지 않았어요. 저장을 마치거나 입력 창을 닫은 뒤 다시 이동해 주세요.',
  );
  return false;
}

export function subscribeNavigationWarning(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function navigationWarning(): string {
  return warning;
}

/** Runs `leave` now, or once the person agrees to drop the unsaved changes on screen. */
export function guardLeave(leave: () => void) {
  if (!guards.size) return leave();
  pending = leave;
  listeners.forEach((listener) => listener());
}

/** Whether a leave waits for an answer; Screen asks it. */
export function leavePending(): boolean {
  return pending !== undefined;
}

export function answerLeave(discard: boolean) {
  const leave = pending;
  pending = undefined;
  if (discard) guards.clear();
  listeners.forEach((listener) => listener());
  if (discard) leave?.();
}
