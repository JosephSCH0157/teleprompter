// Debug tools module: installs a lightweight HUD logger toggled with `~`
// Safe to call multiple times; installs window.debug and window.debugClear.

export function installDebugHud(){
  try {
    if (window.__tp_debug_installed) return;
    window.__tp_debug_installed = true;
    let on = false, el = null;
    function ensureBox() {
      if (el) return el;
      el = document.createElement('div');
      el.id = 'debugHud';
      el.style.cssText = `
        position:fixed; right:10px; bottom:10px; z-index:99999;
        max-width:42vw; min-width:260px; max-height:40vh; overflow:auto;
        background:#0e141b; border:1px solid var(--edge); border-radius:10px;
        font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        padding:10px; color:#c8d2dc; box-shadow:0 6px 24px rgba(0,0,0,.4)`;
      document.body.appendChild(el);
      return el;
    }
    window.debug = function debug(line) {
      if (!on) return;
      const box = ensureBox();
      const msg = (typeof line === 'string') ? line : JSON.stringify(line);
      const row = document.createElement('div');
      row.textContent = msg;
      box.appendChild(row);
      while (box.childElementCount > 120) box.removeChild(box.firstChild);
      box.scrollTop = box.scrollHeight;
    };
    window.debugClear = () => { if (el) el.innerHTML = ''; };
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~') {
        on = !on;
        if (!on) window.debugClear(); else ensureBox();
      }
    });
  } catch {}
}
