const POS_KEY = 'tp_hud_pos_v1';

interface HudPos {
  left: number;
  top: number;
}

function loadSavedPos(): HudPos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HudPos>;
    if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
      return { left: parsed.left, top: parsed.top };
    }
  } catch {
    // ignore
  }
  return null;
}

function savePos(pos: HudPos): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

export function attachHudDrag(root: HTMLElement): void {
  if ((root as any).__hudDragBound) return;
  (root as any).__hudDragBound = true;

  try {
    const saved = loadSavedPos();
    if (saved) {
      root.style.left = `${saved.left}px`;
      root.style.top = `${saved.top}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    }
  } catch {
    // ignore
  }

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onMove = (e: MouseEvent) => {
    if (!dragging) return;
    try { e.preventDefault(); } catch {}

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let nextLeft = startLeft + dx;
    let nextTop = startTop + dy;

    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const rect = root.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, vw - rect.width - margin);
    const maxTop = Math.max(margin, vh - rect.height - margin);

    if (nextLeft < margin) nextLeft = margin;
    if (nextLeft > maxLeft) nextLeft = maxLeft;
    if (nextTop < margin) nextTop = margin;
    if (nextTop > maxTop) nextTop = maxTop;

    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  };

  const onUp = (e: MouseEvent) => {
    if (!dragging) return;
    dragging = false;
    try { e.preventDefault(); } catch {}
    try {
      root.classList.remove('is-dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    } catch {}
    try {
      const rect = root.getBoundingClientRect();
      savePos({ left: rect.left, top: rect.top });
    } catch {
      // ignore
    }
  };

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
    try { e.preventDefault(); } catch {}

    const rect = root.getBoundingClientRect();
    if (!root.style.left && !root.style.right) {
      root.style.left = `${rect.left}px`;
      root.style.top = `${rect.top}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    }

    startX = e.clientX;
    startY = e.clientY;
    const currentRect = root.getBoundingClientRect();
    startLeft = currentRect.left;
    startTop = currentRect.top;

    dragging = true;
    root.classList.add('is-dragging');

    try {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    } catch {
      // ignore
    }
  };

  root.addEventListener('mousedown', onDown);
}
