type GuardState = {
  scroller: HTMLElement;
  protoScrollTo?: (this: Element, ...args: any[]) => any;
  originalScrollTo?: (...args: any[]) => any;
  originalScrollTopGet?: () => number;
  originalScrollTopSet?: (v: number) => void;
};

function isDevMode(): boolean {
  try {
    const qs = new URLSearchParams(String(location.search || ''));
    if (qs.has('dev') || qs.get('dev') === '1') return true;
    if (qs.has('dev1') || qs.get('dev1') === '1') return true;
    if (qs.has('ci') || qs.get('ci') === '1') return true;
    if ((window as any).__TP_DEV || (window as any).__TP_DEV1) return true;
    if (localStorage.getItem('tp_dev_mode') === '1') return true;
  } catch {}
  return false;
}

function getScrollContext() {
  try {
    const store = (window as any).__tpStore;
    const mode = store?.get?.('scrollMode') || '';
    const phase = store?.get?.('session.phase') || '';
    return { mode, phase };
  } catch {
    return { mode: '', phase: '' };
  }
}

function describeEl(el: Element | null | undefined): string {
  if (!el) return 'unknown';
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
  const clsRaw = (el as HTMLElement).className;
  const cls = typeof clsRaw === 'string' && clsRaw.trim()
    ? `.${clsRaw.trim().split(/\s+/).slice(0, 3).join('.')}`
    : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

function shouldAllow(): boolean {
  try {
    if ((window as any).__tpScrollGuardDevOverride) return true;
    if ((window as any).__tpScrollWriteActive) return true;
    if ((window as any).__tpScrollGuardDisabled) return true;
  } catch {}
  return false;
}

function shouldLog(): boolean {
  try {
    if ((window as any).__tpScrollGuardDevOverride) return true;
  } catch {}
  return !shouldAllow();
}

function shouldLogForTarget(target: Element, scroller: HTMLElement): boolean {
  try {
    if (target === scroller) return true;
    if ((window as any).__tpScrollGuardAll === true) return true;
  } catch {}
  return false;
}

function logWrite(action: string, target: Element, value?: unknown) {
  if (!shouldLog()) return;
  const ctx = getScrollContext();
  const payload = {
    action,
    value,
    target: describeEl(target),
    mode: ctx.mode || 'unknown',
    phase: ctx.phase || 'unknown',
  };
  try { console.warn('[scroll-guard] direct scroll write', payload); } catch {}
  try { console.trace('[scroll-guard] stack'); } catch {}
}

function findScrollTopDescriptor(el: HTMLElement): PropertyDescriptor | undefined {
  let proto: any = el;
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, 'scrollTop');
    if (desc && (desc.get || desc.set)) return desc;
    proto = Object.getPrototypeOf(proto);
  }
  return undefined;
}

export function installScrollWriteGuard(scroller: HTMLElement | null | undefined): void {
  if (!scroller) return;
  if (!isDevMode()) return;
  try {
    (window as any).__tpScrollGuardDevOverride = true;
    (window as any).__tpScrollWriteActive = true;
  } catch {}
  const el = scroller as HTMLElement & { __tpScrollGuardInstalled?: boolean; __tpScrollGuardState?: GuardState };
  if (el.__tpScrollGuardInstalled) return;
  el.__tpScrollGuardInstalled = true;

  const state: GuardState = { scroller: el };
  el.__tpScrollGuardState = state;

  const desc = findScrollTopDescriptor(el);
  if (desc?.get) state.originalScrollTopGet = desc.get.bind(el);
  if (desc?.set) state.originalScrollTopSet = desc.set.bind(el);

  try {
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      enumerable: desc?.enumerable ?? true,
      get() {
        if (state.originalScrollTopGet) return state.originalScrollTopGet();
        return 0;
      },
      set(value: number) {
        if (!shouldAllow()) logWrite('scrollTop=', el, value);
        if (state.originalScrollTopSet) {
          state.originalScrollTopSet(Number(value) || 0);
        }
      },
    });
  } catch {}

  try {
    if (typeof el.scrollTo === 'function') {
      state.originalScrollTo = el.scrollTo.bind(el);
      el.scrollTo = function (...args: any[]) {
        if (!shouldAllow()) logWrite('scrollTo()', el, args?.[0]);
        return state.originalScrollTo?.(...args);
      };
    }
  } catch {}

  try {
    const proto = (Element.prototype as any);
    if (proto && typeof proto.scrollTo === 'function' && !(proto.scrollTo as any).__tpGuarded) {
      const original = proto.scrollTo;
      const wrapped = function (this: Element, ...args: any[]) {
        if (shouldLogForTarget(this, el)) {
          if (!shouldAllow()) logWrite('Element.scrollTo()', this, args?.[0]);
        }
        return original.apply(this, args);
      };
      (wrapped as any).__tpGuarded = true;
      proto.scrollTo = wrapped;
    }
  } catch {}

  try {
    const qs = new URLSearchParams(String(location.search || ''));
    if (qs.get('tp_scroll_guard_all') === '1') {
      (window as any).__tpScrollGuardAll = true;
    }
  } catch {}
}
