// src/ui/camera-drag.ts
//
// Make #camWrap draggable and persist its viewport position in localStorage.
// Mirrors the behavior of root/ui/cam-draggable.js, but typed and bundled.

const STORAGE_KEY = 'tp_cam_pos_v1';

interface CamPos {
  x: number;
  y: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function loadPos(): CamPos | null {
  try {
    const s = window.localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const o = JSON.parse(s) as Partial<CamPos>;
    if (typeof o.x === 'number' && typeof o.y === 'number') {
      return { x: o.x, y: o.y };
    }
  } catch {
    // ignore
  }
  return null;
}

function savePos(x: number, y: number): void {
  try {
    const payload: CamPos = {
      x: Math.round(x),
      y: Math.round(y),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function initCamDraggable(): void {
  const el = document.getElementById('camWrap') as HTMLElement | null;
  if (!el) return;

  el.style.touchAction = 'none'; // allow pointer drag
  el.style.cursor = 'grab';

  // Restore saved position if present
  const saved = loadPos();
  if (saved) {
    el.style.right = 'auto';
    el.style.left = `${saved.x}px`;
    el.style.bottom = 'auto';
    el.style.top = `${saved.y}px`;
  }

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  function toPos(pageX: number, pageY: number): CamPos {
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const rect = el.getBoundingClientRect();
    const maxLeft = vw - rect.width - 8; // 8px margin
    const maxTop = vh - rect.height - 8;

    const x = clamp(pageX - startX + origLeft, 8, maxLeft);
    const y = clamp(pageY - startY + origTop, 8, maxTop);
    return { x, y };
  }

  function onPointerDown(ev: PointerEvent): void {
    try {
      ev.preventDefault();
    } catch {
      // ignore
    }

    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }

    dragging = true;
    el.style.cursor = 'grabbing';
    const rect = el.getBoundingClientRect();
    startX = ev.pageX;
    startY = ev.pageY;
    origLeft = rect.left;
    origTop = rect.top;
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!dragging) return;
    const { x, y } = toPos(ev.pageX, ev.pageY);
    el.style.right = 'auto';
    el.style.left = `${x}px`;
    el.style.bottom = 'auto';
    el.style.top = `${y}px`;
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = 'grab';

    try {
      el.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }

    const rect = el.getBoundingClientRect();
    savePos(rect.left, rect.top);
  }

  function onDblClick(): void {
    // Reset to default corner (right-bottom)
    el.style.left = 'auto';
    el.style.top = 'auto';
    el.style.right = '16px';
    el.style.bottom = '16px';
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  el.addEventListener('pointerdown', onPointerDown, { capture: true });
  // With pointer capture, move/up events are delivered to the element
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('dblclick', onDblClick);
}

// Auto-init when this module is loaded — same behavior as the JS version
function autoInit(): void {
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        try {
          initCamDraggable();
        } catch {
          // ignore
        }
      });
    } else {
      initCamDraggable();
    }
  } catch {
    // ignore
  }
}

autoInit();

// Optional global for any legacy/debug callers
declare global {
  interface Window {
    initCamDraggable?: () => void;
  }
}

if (typeof window !== 'undefined' && !window.initCamDraggable) {
  window.initCamDraggable = initCamDraggable;
}
