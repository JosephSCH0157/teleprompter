// Help & Validation utilities extracted from main bundle
// Exports:
//  - ensureHelpUI()
//  - showValidation(text)
//  - validateStandardTags(silent=false)
//  - showCopyDialog(text, title)

export function showCopyDialog(text, title = 'Validation Results') {
  let ov = document.getElementById('msgOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'msgOverlay';
    ov.className = 'overlay hidden';
    ov.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="msgTitle">
        <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <h3 id="msgTitle" style="margin:0"></h3>
          <button id="msgClose" class="btn-chip">Close</button>
        </header>
        <div style="display:flex; gap:8px; align-items:center; margin:0 0 8px">
          <button id="msgCopy" class="btn-chip">Copy</button>
          <span class="dim" style="font-size:12px">Tip: text is pre-selected — press Ctrl+C to copy</span>
        </div>
        <textarea id="msgText" readonly style="width:100%;min-height:220px;background:#0e141b;color:var(--fg);border:1px solid var(--edge);border-radius:12px;padding:12px"></textarea>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => {
      if (e.target === ov) ov.classList.add('hidden');
    });
    ov.querySelector('#msgClose').onclick = () => ov.classList.add('hidden');
    window.addEventListener('keydown', (e) => {
      if (!ov.classList.contains('hidden') && e.key === 'Escape') ov.classList.add('hidden');
    });
    const copyBtn = ov.querySelector('#msgCopy');
    copyBtn.onclick = async () => {
      const ta = ov.querySelector('#msgText');
      ta.focus();
      ta.select();
      try {
        await navigator.clipboard.writeText(ta.value);
      } catch {
        try {
          document.execCommand('copy');
        } catch {}
      }
    };
  }
  ov.querySelector('#msgTitle').textContent = title;
  const ta = ov.querySelector('#msgText');
  ta.value = String(text || '');
  ov.classList.remove('hidden');
  setTimeout(() => {
    ta.focus();
    ta.select();
  }, 0);
}

export function showValidation(text) {
  try {
    ensureHelpUI();
  } catch {}
  const overlay = document.getElementById('shortcutsOverlay');
  const sheet = overlay?.querySelector('.sheet') || overlay || document.body;
  let panel = sheet.querySelector('#validatePanel');
  if (!panel) {
    const frag = document.createElement('div');
    frag.innerHTML = `
<div id="validatePanel" class="sheet-section hidden">
  <header style="display:flex;justify-content:space-between;align-items:center;gap:8px">
    <h4 style="margin:0">Validation results</h4>
    <button id="copyValidateBtn" class="btn-chip">Copy</button>
  </header>
  <pre id="validateOut" tabindex="0" style="white-space:pre-wrap; user-select:text; margin-top:8px"></pre>
</div>`;
    panel = frag.firstElementChild;
    sheet.appendChild(panel);
    const copyBtn = panel.querySelector('#copyValidateBtn');
    if (copyBtn && !copyBtn.dataset.wired) {
      copyBtn.dataset.wired = '1';
      copyBtn.addEventListener('click', async () => {
        const pre = panel.querySelector('#validateOut');
        const txt = pre?.textContent || '';
        try {
          await navigator.clipboard.writeText(txt);
          try {
            (window.setStatus || (() => {}))('Validation copied ✓');
          } catch {}
        } catch {
          try {
            const sel = window.getSelection();
            const r = document.createRange();
            r.selectNodeContents(pre);
            sel.removeAllRanges();
            sel.addRange(r);
            document.execCommand('copy');
            try {
              (window.setStatus || (() => {}))('Validation copied ✓');
            } catch {}
          } catch {
            try {
              (window.setStatus || (() => {}))('Copy failed: ' + (e?.message || e));
            } catch {}
          }
        }
      });
    }
  }
  const pre = panel.querySelector('#validateOut');
  pre.textContent = String(text || '').trim() || 'No issues found.';
  panel.classList.remove('hidden');
  try {
    pre.focus();
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(pre);
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {}
}

export function validateStandardTags(silent = false) {
  const ta = document.getElementById('editor');
  const t = String(ta?.value || '');
  const problems = [];

  // only allowed tags
  const badTag = t.match(/\[(?!\/?(?:s1|s2|note)\b)[^]]+\]/i);
  if (badTag) problems.push('Unknown tag: ' + badTag[0]);

  // speaker tags must be on their own lines
  if (/\[(?:s1|s2)\]\s*\S/.test(t)) problems.push('Opening [s1]/[s2] must be on its own line.');
  if (/\S\s*\[\/s[12]\]\s*$/im.test(t))
    problems.push('Closing [/s1]/[/s2] must be on its own line.');

  // notes must not be inside speakers
  if (/\[(s1|s2)\][\s\S]*?\[note\][\s\S]*?\[\/note\][\s\S]*?\[\/\1\]/i.test(t))
    problems.push('[note] blocks must be outside speaker sections.');

  // balance using a simple stack (no nesting across different speakers)
  const re = /\[(\/?)(s1|s2|note)\]/gi;
  const stack = [];
  let m;
  while ((m = re.exec(t))) {
    const [, close, tag] = m;
    if (!close) stack.push(tag);
    else {
      const top = stack.pop();
      if (top !== tag) problems.push(`Mismatched closing [\/${tag}] near index ${m.index}`);
    }
  }
  if (stack.length) problems.push('Unclosed tag(s): ' + stack.join(', '));

  const msg = problems.length
    ? 'Markup issues:\n- ' + problems.join('\n- ')
    : 'Markup conforms to the standard.';
  if (!silent) {
    try {
      showValidation(msg);
    } catch {
      showCopyDialog(msg, 'Validator');
    }
  }
  return msg;
}

export function ensureHelpUI() {
  // minimal CSS (only if missing)
  if (!document.getElementById('helpStyles')) {
    const css = `
      .hidden{display:none!important}
      .overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);
        backdrop-filter:saturate(1.2) blur(2px);z-index:9999;
        display:flex;align-items:center;justify-content:center}
      .sheet{width:min(820px,92vw);max-height:85vh;overflow:auto;
        background:#0e141b;border:1px solid var(--edge);border-radius:16px;padding:20px}
      .sheet header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
      .hr{border:0;border-top:1px solid var(--edge);margin:12px 0}
      .shortcuts-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .btn-chip{background:#0e141b;border:1px solid var(--edge);padding:8px 10px;border-radius:10px;cursor:pointer}
    `;
    const st = document.createElement('style');
    st.id = 'helpStyles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ensure Help button exists in the top bar
  const topBarEl = document.querySelector('.topbar');
  let helpBtn = document.getElementById('shortcutsBtn');
  if (!helpBtn) {
    helpBtn = Object.assign(document.createElement('button'), {
      id: 'shortcutsBtn',
      className: 'chip',
      textContent: 'Help',
      ariaHasPopup: 'dialog',
      ariaExpanded: 'false',
    });
    topBarEl && topBarEl.appendChild(helpBtn);
  } else {
    helpBtn.textContent = 'Help';
  }

  // ensure overlay exists
  let overlay = document.getElementById('shortcutsOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'shortcutsOverlay';
    overlay.className = 'overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'shortcutsTitle');
    overlay.innerHTML = `
      <div class="sheet">
        <header>
          <h3 id="shortcutsTitle">Help</h3>
          <button id="shortcutsClose" class="btn-chip">Close</button>
        </header>

        <div class="shortcuts-grid" style="margin-bottom:8px">
          <div><strong>Space</strong></div><div>Toggle Auto-scroll</div>
          <div><strong>↑ / ↓</strong></div><div>Adjust Auto-scroll speed</div>
          <div><strong>Shift + ?</strong></div><div>Open Help</div>
          <div><strong>Ctrl/Cmd + S</strong></div><div>Save to browser</div>
          <div><strong>Ctrl/Cmd + O</strong></div><div>Load selected script</div>
        </div>

        <hr class="hr" />
        <div>
          <h4 style="margin:8px 0 6px">Official Teleprompter Tags</h4>
          <p style="margin:0 0 8px; color:#96a0aa">
            Speakers: <code>[s1] ... [/s1]</code>, <code>[s2] ... [/s2]</code>. Notes: <code>[note] ... [/note]</code>.
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
            <button id="normalizeBtn" class="btn-chip">Normalize current script</button>
            <button id="validateBtn" class="btn-chip">Validate markup</button>
          </div>
        </div>

        <div id="helpAdvanced" class="hidden" style="margin-top:12px">
          <h4 style="margin:0 0 6px">Advanced</h4>
          <div class="shortcuts-grid">
            <div><strong>Alt-click title</strong></div><div>Toggle this section</div>
            <div><strong>~</strong></div><div>Debug HUD</div>
            <div><strong>?v=clear</strong></div><div>Force refresh</div>
            <div><strong>Auto-restart speech</strong></div>
            <div><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="optRecAuto" /> Enable (default)</label></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // If we reused an existing overlay (from HTML), ensure the Tag Guide with Normalize/Validate exists
  if (
    overlay &&
    !overlay.querySelector('#normalizeBtn') &&
    !overlay.querySelector('#guideNormalize')
  ) {
    const sheet = overlay.querySelector('.sheet') || overlay;
    const container = document.createElement('div');
    container.innerHTML = `
      <hr class="hr" />
      <div>
        <h4 style="margin:8px 0 6px">Official Teleprompter Tags</h4>
        <p style="margin:0 0 8px; color:#96a0aa">
          Speakers: <code>[s1] ... [/s1]</code>, <code>[s2] ... [/s2]</code>. Notes: <code>[note] ... [/note]</code>.
        </p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
          <button id="normalizeBtn" class="btn-chip">Normalize current script</button>
          <button id="validateBtn" class="btn-chip">Validate markup</button>
        </div>
      </div>`;
    sheet.appendChild(container);
  }

  // If missing, append the optional Advanced section (hidden by default)
  if (overlay && !overlay.querySelector('#helpAdvanced')) {
    const sheet = overlay.querySelector('.sheet') || overlay;
    const adv = document.createElement('div');
    adv.innerHTML = `
<div id="helpAdvanced" class="hidden" style="margin-top:12px">
  <h4 style="margin:0 0 6px">Advanced</h4>
  <div class="shortcuts-grid">
    <div><strong>Alt-click title</strong></div><div>Toggle this section</div>
    <div><strong>~</strong></div><div>Debug HUD</div>
    <div><strong>?v=clear</strong></div><div>Force refresh</div>
    <div><strong>Auto-restart speech</strong></div>
    <div><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="optRecAuto" /> Enable (default)</label></div>
  </div>
</div>`;
    sheet.appendChild(adv.firstElementChild);
  }

  // --- wire open/close ---
  helpBtn = document.getElementById('shortcutsBtn');
  const closeBtn = overlay.querySelector('#shortcutsClose');
  function openHelp() {
    overlay.classList.remove('hidden');
    helpBtn?.setAttribute('aria-expanded', 'true');
  }
  function closeHelp() {
    overlay.classList.add('hidden');
    helpBtn?.setAttribute('aria-expanded', 'false');
  }
  if (helpBtn) helpBtn.onclick = openHelp;
  if (closeBtn) closeBtn.onclick = closeHelp;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeHelp();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '?' && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      openHelp();
    }
  });

  // --- Advanced: auto-restart speech toggle ---
  try {
    const chk = overlay.querySelector('#optRecAuto');
    if (chk) {
      // reflect current state
      chk.checked = !!(window.recAutoRestart ?? true);
      chk.addEventListener('change', () => {
        try {
          window.recAutoRestart = !!chk.checked;
        } catch {}
      });
    }
  } catch {}

  // --- Normalize (uses app function if provided; else safe fallback) ---
  const normalizeBtn = overlay.querySelector('#normalizeBtn');
  if (normalizeBtn) {
    normalizeBtn.onclick = () => {
      if (typeof window.normalizeToStandard === 'function') {
        try {
          window.normalizeToStandard();
        } catch {
          alert('Normalize error: ' + e.message);
        }
        return;
      }
      // Shared fallback
      if (typeof window.fallbackNormalize === 'function') window.fallbackNormalize();
    };
  }

  // --- Validate tags quickly ---
  const validateBtn = overlay.querySelector('#validateBtn');
  if (validateBtn) {
    validateBtn.onclick = () => {
      let msg = '';
      if (typeof window.validateStandardTags === 'function') {
        try {
          msg = window.validateStandardTags(true);
        } catch {
          msg = 'Validation failed to run.';
        }
      } else {
        // fallback: simple counts
        const ta = document.getElementById('editor');
        const t = String(ta?.value || '');
        const count = (re) => (t.match(re) || []).length;
        const s1 = count(/\[s1\]/gi),
          e1 = count(/\[\/s1\]/gi);
        const s2 = count(/\[s2\]/gi),
          e2 = count(/\[\/s2\]/gi);
        const sn = count(/\[note\]/gi),
          en = count(/\[\/note\]/gi);
        const problems = [];
        if (s1 !== e1) problems.push(`[s1] open ${s1} ≠ close ${e1}`);
        if (s2 !== e2) problems.push(`[s2] open ${s2} ≠ close ${e2}`);
        if (sn !== en) problems.push(`[note] open ${sn} ≠ close ${en}`);
        msg = problems.length
          ? 'Markup issues:\n- ' + problems.join('\n- ')
          : 'Markup looks consistent.';
      }
      try {
        showValidation(msg);
      } catch {
        showCopyDialog(msg, 'Validator');
      }
    };
  }
}

