// Scroll feature stub
export function initScroll() {
  console.log('[src/features/scroll] initScroll');
}

export function createScrollController() {
  let enabled = false;
  let targetY = 0;
  let _mode = 'auto'; // 'adaptive' | 'auto'

  return {
    get mode() {
      return _mode;
    },
    set mode(v) {
      if (v === 'auto' || v === 'adaptive') _mode = v;
    },
    setTarget(y) {
      targetY = Number(y) || 0;
    },
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
    },
    isEnabled() {
      return !!enabled;
    },
    getTarget() {
      return targetY;
    },
  };
}
