import { kick } from './kick/kick';

let initialized = false;

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return true;
  return !!el.isContentEditable;
}

function isKickHotkey(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.code === 'KeyK') return true;
  return String(event.key || '').toLowerCase() === 'k';
}

function onKeydown(event: KeyboardEvent): void {
  if (!isKickHotkey(event)) return;
  if (isTypingTarget(event.target)) return;
  event.preventDefault();
  kick({ reason: 'hotkey:k' });
}

export function initHotkeys(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', onKeydown, { capture: true });
  initialized = true;
  try { console.log('[src/features/hotkeys] initHotkeys'); } catch {}
}

export const initHotkeysFeature = initHotkeys;
