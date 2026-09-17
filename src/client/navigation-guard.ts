const guards = new Set<symbol>();
const listeners = new Set<() => void>();
let warning = '';

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
