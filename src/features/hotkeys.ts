import { kick } from './kick/kick';

let initialized = false;

function isDevMode(): boolean {
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    const qs = new URLSearchParams(String(location.search || ''));
    return qs.has('dev') || qs.get('dev') === '1';
  } catch {
    return false;
  }
}

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
  if (isDevMode()) {
    const key = String(event.key || '').toLowerCase();
    if (event.code === 'KeyK' || key === 'k') {
      const target = event.target as HTMLElement | null;
      const targetTag = String(target?.tagName || '').toLowerCase() || '(none)';
      const targetId = target?.id || '';
      try {
        console.debug('[kick-hotkey] keydown', {
          key: event.key,
          code: event.code,
          targetTag,
          targetId,
          kickHandlerReached: true,
        });
      } catch {}
    }
  }
  if (!isKickHotkey(event)) return;
  if (isTypingTarget(event.target)) {
    if (isDevMode()) {
      try {
        console.debug('[kick-hotkey] blocked', {
          reason: 'typing-target',
          key: event.key,
          code: event.code,
          kickHandlerReached: true,
        });
      } catch {}
    }
    return;
  }
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
