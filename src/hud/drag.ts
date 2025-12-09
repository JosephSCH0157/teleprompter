// src/hud/drag.ts
// Draggable HUD with click-suppression so dragging doesn't trigger collapse/toggle handlers.

interface HudPos {
  left: number;
  top: number;
}

const STORAGE_KEY = 'tp_hud_pos_v1';

function loadPos(): HudPos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

function savePos(root: HTMLElement): void {
  try {
    const rect = root.getBoundingClientRect();
    const pos: HudPos = { left: rect.left, top: rect.top };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

function clampPos(root: HTMLElement, left: number, top: number): HudPos {
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const rect = root.getBoundingClientRect();
  const w = rect.width || 320;
  const h = rect.height || 180;
  const margin = 8;

  const minLeft = margin;
  const maxLeft = Math.max(minLeft, vw - w - margin);
  const minTop = margin;
  const maxTop = Math.max(minTop, vh - h - margin);

  return {
    left: Math.min(maxLeft, Math.max(minLeft, left)),
    top: Math.min(maxTop, Math.max(minTop, top)),
  };
}

/**
 * Attach drag behavior to the HUD root.
 * - Uses [data-hud-drag-handle] as the handle if present, otherwise the root.
 * - Persists position in localStorage.
 * - Suppresses click events that immediately follow a drag so we don't
 *   fire HUD "collapse/toggle" click handlers after a move.
 */
export function attachHudDrag(root: HTMLElement): void {
  if (!root) return;

  const handle =
    root.querySelector<HTMLElement>('[data-hud-drag-handle]') || root;

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let lastDragTs = 0;

  // Apply any saved position on first attach
  try {
    const saved = loadPos();
    if (saved) {
      const clamped = clampPos(root, saved.left, saved.top);
      root.style.position = 'fixed';
      root.style.left = `${clamped.left}px`;
      root.style.top = `${clamped.top}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    }
  } catch {
    // ignore
  }

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // left button only
    try { e.preventDefault(); } catch {}
    dragging = true;
    moved = false;

    const rect = root.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;

    root.classList.add('tp-hud-dragging');

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      moved = true;
    }

    const { left, top } = clampPos(root, startLeft + dx, startTop + dy);
    root.style.position = 'fixed';
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  };

  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('tp-hud-dragging');

    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);

    if (moved) {
      lastDragTs = Date.now();
      savePos(root);
    }
  };

  // Capture-phase click handler that eats clicks that come right after a drag.
  const onClickCapture = (e: MouseEvent) => {
    if (!lastDragTs) return;
    const dt = Date.now() - lastDragTs;
    if (dt >= 0 && dt < 250) {
      // This click is just the tail of a drag: swallow it so the HUD
      // doesn't interpret it as "collapse" or "toggle".
      try {
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        e.preventDefault();
      } catch {
        // ignore
      } finally {
        lastDragTs = 0;
      }
    }
  };

  handle.addEventListener('mousedown', onMouseDown);
  // Capture so we beat any internal HUD click handlers
  root.addEventListener('click', onClickCapture, true);
}
