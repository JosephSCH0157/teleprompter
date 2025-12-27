export function getScrollContainer(): HTMLElement | null {
  try {
    return document.getElementById('scriptScrollContainer') as HTMLElement | null;
  } catch {
    return null;
  }
}

export function getViewerElement(): HTMLElement | null {
  try {
    return (
      (document.getElementById('viewer') as HTMLElement | null) ||
      (document.querySelector('[data-role="viewer"]') as HTMLElement | null)
    );
  } catch {
    return null;
  }
}

export function getScriptRoot(): HTMLElement | null {
  try {
    return document.getElementById('script') as HTMLElement | null;
  } catch {
    return null;
  }
}

export function getFallbackScroller(): HTMLElement | null {
  try {
    return (
      (document.scrollingElement as HTMLElement | null) ||
      (document.documentElement as HTMLElement | null) ||
      (document.body as HTMLElement | null)
    );
  } catch {
    return null;
  }
}

export function isWindowScroller(sc: HTMLElement | null): boolean {
  return !!sc && (sc === document.scrollingElement || sc === document.documentElement || sc === document.body);
}

export function isScrollable(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.scrollHeight - el.clientHeight > 2) return true;
  try {
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY || '');
  } catch {
    return false;
  }
}

export function resolveActiveScroller(primary: HTMLElement | null, fallback: HTMLElement | null): HTMLElement | null {
  if (isScrollable(primary)) return primary;
  if (isScrollable(fallback)) return fallback;
  return primary || fallback;
}

export function describeElement(el: HTMLElement | null): string {
  if (!el) return 'none';
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}` || el.tagName.toLowerCase();
}

export function getPrimaryScroller(): HTMLElement | null {
  return getScrollContainer() || getViewerElement();
}

