// Small module to make #camWrap draggable and persist its viewport position in localStorage
const KEY = 'tp_cam_pos_v1';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function loadPos() {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const o = JSON.parse(s);
    if (typeof o.x === 'number' && typeof o.y === 'number') return o;
  } catch {}
  return null;
}

function savePos(x, y) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
  } catch {}
}

export function initCamDraggable() {
  const el = document.getElementById('camWrap');
  if (!el) return;
  el.style.touchAction = 'none'; // allow pointer drag
  el.style.cursor = 'grab';

  // restore saved pos if present
  const saved = loadPos();
  if (saved) {
    el.style.right = 'auto';
    el.style.left = saved.x + 'px';
    el.style.bottom = 'auto';
    el.style.top = saved.y + 'px';
  }

  let dragging = false;
  let startX = 0,
    startY = 0,
    origLeft = 0,
    origTop = 0;

  function toPos(pageX, pageY) {
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const rect = el.getBoundingClientRect();
    const maxLeft = vw - rect.width - 8; // 8px margin
    const maxTop = vh - rect.height - 8;
    const x = clamp(pageX - startX + origLeft, 8, maxLeft);
    const y = clamp(pageY - startY + origTop, 8, maxTop);
    return { x, y };
  }

  function onPointerDown(ev) {
    ev.preventDefault();
    el.setPointerCapture(ev.pointerId);
    dragging = true;
    el.style.cursor = 'grabbing';
    const rect = el.getBoundingClientRect();
    startX = ev.pageX;
    startY = ev.pageY;
    origLeft = rect.left;
    origTop = rect.top;
  }

  function onPointerMove(ev) {
    if (!dragging) return;
    const p = toPos(ev.pageX, ev.pageY);
    // position via left/top for persistent absolute placement
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  function onPointerUp(ev) {
    if (!dragging) return;
    dragging = false;
    try {
      el.releasePointerCapture(ev.pointerId);
    } catch {}
    el.style.cursor = 'grab';
    const rect = el.getBoundingClientRect();
    savePos(rect.left, rect.top);
  }

  function onDblClick() {
    // reset to default corner (right-bottom)
    el.style.left = 'auto';
    el.style.top = 'auto';
    el.style.right = '16px';
    el.style.bottom = '16px';
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }

  el.addEventListener('pointerdown', onPointerDown, { capture: true });
  // With pointer capture, move/up events are delivered to the element
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('dblclick', onDblClick);
}

// auto-init when module is loaded (safe no-op if element not present yet)
document.addEventListener('DOMContentLoaded', function () {
  try {
    initCamDraggable();
  } catch {}
});

export default { initCamDraggable };
