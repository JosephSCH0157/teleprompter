/* Teleprompter Pro — JS CLEAN (v1.5.4b)
   - Display handshake + retry pump
   - SmartTag supports: Name:, Name —, Name >, and block headers >> NAME:
   - DOCX import via Mammoth (auto‑loads on demand)
   - dB meter + mic selector
   - Camera overlay (mirror/size/opacity/PiP)
   - Auto‑scroll + timer
   - NEW: Speakers section hide/show with persistence
*/

(() => {
  'use strict';
  // cSpell:ignore playsinline webkit-playsinline recog chrono preroll topbar labelledby uppercased Tunables tunables Menlo Consolas docx openxmlformats officedocument wordprocessingml arrayBuffer FileReader unpkg mammoth

  /* ──────────────────────────────────────────────────────────────
   * Boot diagnostics
   * ────────────────────────────────────────────────────────────── */
  const log = (...a) => console.log('[TP‑Pro]', ...a);
  const warn = (...a) => console.warn('[TP‑Pro]', ...a);
  const err  = (...a) => console.error('[TP‑Pro]', ...a);

  window.addEventListener('error', e => setStatus('Boot error: ' + (e?.message || e)));
  window.addEventListener('unhandledrejection', e => setStatus('Promise rejection: ' + (e?.reason?.message || e?.reason || e)));

  // CSS rule '.hidden { display: none !important; }' removed. Add this to your CSS file instead.



function setStatus(msg){
  try {
    const s = document.getElementById('status') || (() => {
      const p = document.createElement('p');
      p.id = 'status';
      (document.body || document.documentElement).appendChild(p);
      return p;
    })();
    s.textContent = String(msg);
  } catch (e) {
    // ignore
  }
}

// ⬇️ this line was missing; without it, nothing gets wired
document.addEventListener('DOMContentLoaded', init);

  // Shared, safe fallback normalizer used when normalizeToStandard() is not provided
  function fallbackNormalize(){
    try {
      const ta = document.getElementById('editor');
      if (!ta) return;
      let txt = String(ta.value || '');
      // Normalize newlines & spaces; convert smart quotes; trim trailing spaces per-line
      txt = txt.replace(/\r\n?/g, '\n')
               .replace(/ +\n/g, '\n')
               .replace(/[’]/g, "'");
      // Ensure closing tags aren't accidentally uppercased/spaced
      txt = txt.replace(/\[\/\s*s1\s*\]/gi, '[/s1]')
               .replace(/\[\/\s*s2\s*\]/gi, '[/s2]')
               .replace(/\[\/\s*note\s*\]/gi, '[/note]');
      ta.value = txt;
      // Re-render via input event to keep everything in sync
      const ev = new Event('input'); ta.dispatchEvent(ev);
      alert('Basic normalization applied.');
    } catch (e) {
      alert('Normalize fallback failed: ' + e.message);
    }
  }

  // Strict normalizer (single source of truth)
  window.normalizeToStandard = function normalizeToStandard() {
    const ta = document.getElementById('editor');
    if (!ta) return;
    let txt = String(ta.value || '');

    // Canonicalize whitespace/quotes/case
    txt = txt.replace(/\r\n?/g, '\n')
             .replace(/[ \t]+\n/g, '\n')
             .replace(/[’]/g, "'")
             .replace(/\[\s*(s1|s2|note)\s*\]/gi, (_,x)=>`[${x.toLowerCase()}]`)
             .replace(/\[\s*\/\s*(s1|s2|note)\s*\]/gi, (_,x)=>`[/${x.toLowerCase()}]`);

    // Move inline notes out of speaker paragraphs
    txt = txt.replace(
      /\[(s1|s2)\]([\s\S]*?)\[note\]([\s\S]*?)\[\/note\]([\s\S]*?)\[\/\1\]/gi,
      (_,r,pre,note,post)=>`[note]${note.trim()}[/note]\n[${r}]${(pre+' '+post).trim()}[/${r}]`
    );

    // Ensure speaker/close tags are on their own lines
    txt = txt.replace(/\[(s1|s2)\]\s*(?=\S)/gi, (_,r)=>`[${r}]\n`)
             .replace(/([^\n])\s*\[\/s(1|2)\](?=\s*$)/gmi, (_,ch,sp)=>`${ch}\n[/s${sp}]`);

    // Notes must be standalone blocks
    txt = txt.replace(/\n?(\[note\][\s\S]*?\[\/note\])\n?/gi, '\n$1\n');

    // Collapse excess blank lines
    txt = txt.replace(/\n{3,}/g, '\n\n').trim() + '\n';

    // Wrap untagged blocks with current (default s1); ensure missing closers
    const blocks = txt.split(/\n{2,}/);
    let current = 's1';
    const out = [];
    for (let b of blocks) {
      const first = b.match(/^\s*\[(s1|s2|note)\]/i)?.[1]?.toLowerCase();
      if (first === 'note') { out.push(b); continue; }
      if (first === 's1' || first === 's2') {
        current = first;
        if (!/\[\/s[12]\]/i.test(b)) b = b + `\n[/${current}]`;
        out.push(b);
      } else {
        // untagged → wrap under current speaker
        out.push(`[${current}]\n${b}\n[/${current}]`);
      }
    }
    ta.value = out.join('\n\n') + '\n';
    ta.dispatchEvent(new Event('input', { bubbles:true }));
    if (typeof saveDraft === 'function') saveDraft();
    if (typeof setStatus === 'function') setStatus('Normalized to standard.');
  };

  // Validator (quick “am I standard?” check)
  window.validateStandardTags = function validateStandardTags() {
    const ta = document.getElementById('editor');
    const t = String(ta?.value || '');
    const problems = [];

    // only allowed tags
    const badTag = t.match(/\[(?!\/?(?:s1|s2|note)\b)[^]]+\]/i);
    if (badTag) problems.push('Unknown tag: ' + badTag[0]);

    // speaker tags must be on their own lines
    if (/\[(?:s1|s2)\]\s*\S/.test(t)) problems.push('Opening [s1]/[s2] must be on its own line.');
    if (/\S\s*\[\/s[12]\]\s*$/im.test(t)) problems.push('Closing [/s1]/[/s2] must be on its own line.');

    // notes must not be inside speakers
    if (/\[(s1|s2)\][\s\S]*?\[note\][\s\S]*?\[\/note\][\s\S]*?\[\/\1\]/i.test(t))
      problems.push('[note] blocks must be outside speaker sections.');

    // balance using a simple stack (no nesting across different speakers)
    const re = /\[(\/?)(s1|s2|note)\]/ig; const stack = [];
    let m;
    while ((m = re.exec(t))) {
      const [, close, tag] = m;
      if (!close) stack.push(tag);
      else {
        const top = stack.pop();
        if (top !== tag) problems.push(`Mismatched closing [/${tag}] near index ${m.index}`);
      }
    }
    if (stack.length) problems.push('Unclosed tag(s): ' + stack.join(', '));

    alert(problems.length ? ('Markup issues:\n- ' + problems.join('\n- ')) : 'Markup conforms to the standard.');
  };

  /* ──────────────────────────────────────────────────────────────
   * Globals and state
   * ────────────────────────────────────────────────────────────── */
  let displayWin = null;
  let displayReady = false;
  let dbAnim = null, analyser = null, audioStream = null;
  let recActive = false;          // you already have this
  let recog = null;               // SpeechRecognition instance
  const MATCH_WINDOW = 6;         // how far ahead we’ll look for the next word
  let autoTimer = null, chrono = null, chronoStart = 0;
  let scriptWords = [], paraIndex = [], currentIndex = 0;
  let shortcutsBtn, shortcutsOverlay, shortcutsClose;


  const ROLE_KEYS = ['s1','s2','g1','g2'];
  const ROLES_KEY = 'tp_roles_v2';
  const ROLE_DEFAULTS = {
    s1: { name: 'Speaker 1', color: '#60a5fa' },
    s2: { name: 'Speaker 2', color: '#facc15' },
    g1: { name: 'Guest 1',   color: '#34d399' },
    g2: { name: 'Guest 2',   color: '#f472b6' }
  };
  let ROLES = loadRoles();

  // DOM (late‑bound during init)
  let editor, scriptEl, viewer, legendEl,
      permChip, displayChip, recChip,
      openDisplayBtn, closeDisplayBtn, presentBtn,
      micBtn, recBtn, micDeviceSel, refreshDevicesBtn,
      fontSizeInput, lineHeightInput,
      autoToggle, autoSpeed,
      timerEl, resetBtn, loadSample, clearText,
      saveLocalBtn, loadLocalBtn, downloadFileBtn, uploadFileBtn, uploadFileInput,
      wrapBold, wrapItalic, wrapUnderline, wrapNote, wrapColor, wrapBg, autoTagBtn,
      nameS1, colorS1, wrapS1, nameS2, colorS2, wrapS2, nameG1, colorG1, wrapG1, nameG2, colorG2, wrapG2,
      camWrap, camVideo, startCamBtn, stopCamBtn, camDeviceSel, camSize, camOpacity, camMirror, camPiP,
      prerollInput, countOverlay, countNum,
      dbMeter,
      toggleSpeakersBtn, speakersBody;

  /* ────────────────────────────────────────────────────────────── */
  // Speakers section show/hide with persistence (robust)
  (function setupSpeakersToggle(){
    const KEY = 'tp_speakers_hidden';
    const btn  = document.getElementById('toggleSpeakers');
    let body   = document.getElementById('speakersBody');

    // Fallback: if no wrapper, find the key rows and hide those
    const rows = body ? [] : [
      '#wrap-s1', '#wrap-s2', '#wrap-g1', '#wrap-g2', '#wrap-bold'
    ].map(sel => document.querySelector(sel)?.closest('.row')).filter(Boolean);

    const isHidden = () => body
      ? body.classList.contains('hidden')
      : (rows[0] ? rows[0].classList.contains('hidden') : false);

    const apply = (hidden) => {
      if (body) body.classList.toggle('hidden', !!hidden);
      else rows.forEach(r => r.classList.toggle('hidden', !!hidden));
      if (btn) {
        btn.textContent = hidden ? 'Show Speakers' : 'Hide';
        btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      }
    };

    const saved = localStorage.getItem(KEY) === '1';
    apply(saved);

    btn?.addEventListener('click', () => {
      const next = !isHidden();
      localStorage.setItem(KEY, next ? '1' : '0');
      apply(next);
    });
  })();

  // ---- Help / Tag Guide injection ----
function ensureHelpUI(){
  // --- minimal CSS (only if missing) ---
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
    st.id = 'helpStyles'; st.textContent = css; document.head.appendChild(st);
  }

  // --- ensure Help button exists in the top bar ---
  const topBarEl = document.querySelector('.topbar');
  let helpBtn = document.getElementById('shortcutsBtn');
  if (!helpBtn) {
    helpBtn = Object.assign(document.createElement('button'), {
      id: 'shortcutsBtn', className: 'chip', textContent: 'Help',
      ariaHasPopup: 'dialog', ariaExpanded: 'false'
    });
  topBarEl && topBarEl.appendChild(helpBtn);
  } else {
    helpBtn.textContent = 'Help';
  }

  // --- ensure overlay exists ---
  let overlay = document.getElementById('shortcutsOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'shortcutsOverlay';
    overlay.className = 'overlay hidden';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','shortcutsTitle');
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
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // --- wire open/close ---
  const closeBtn = overlay.querySelector('#shortcutsClose');
  function openHelp(){ overlay.classList.remove('hidden'); helpBtn.setAttribute('aria-expanded','true'); }
  function closeHelp(){ overlay.classList.add('hidden'); helpBtn.setAttribute('aria-expanded','false'); }
  if (helpBtn) helpBtn.onclick = openHelp;
  if (closeBtn) closeBtn.onclick = closeHelp;
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) closeHelp(); });
  document.addEventListener('keydown', (e)=>{ if(e.key === '?' && (e.shiftKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); openHelp(); } });

  // --- Normalize (uses your function if present; else safe fallback) ---
  const normalizeBtn = overlay.querySelector('#normalizeBtn');
  if (normalizeBtn) {
    normalizeBtn.onclick = () => {
      if (typeof window.normalizeToStandard === 'function') {
        try { window.normalizeToStandard(); } catch (e) { alert('Normalize error: ' + e.message); }
        return;
      }
      // Shared fallback
      fallbackNormalize();
    };
  }

  // --- Validate tags quickly ---
  const validateBtn = overlay.querySelector('#validateBtn');
  if (validateBtn) {
    validateBtn.onclick = () => {
      if (typeof window.validateStandardTags === 'function') {
        try { window.validateStandardTags(); return; } catch (e) { /* fall through */ }
      }
      // fallback: simple counts
      const ta = document.getElementById('editor');
      if (!ta) return;
      const t = String(ta.value || '');
      const count = (re) => (t.match(re) || []).length;
      const s1 = count(/\[s1\]/gi), e1 = count(/\[\/s1\]/gi);
      const s2 = count(/\[s2\]/gi), e2 = count(/\[\/s2\]/gi);
      const sn = count(/\[note\]/gi), en = count(/\[\/note\]/gi);
      const problems = [];
      if (s1 !== e1) problems.push(`[s1] open ${s1} ≠ close ${e1}`);
      if (s2 !== e2) problems.push(`[s2] open ${s2} ≠ close ${e2}`);
      if (sn !== en) problems.push(`[note] open ${sn} ≠ close ${en}`);
      alert(problems.length ? ('Markup issues:\n- ' + problems.join('\n- ')) : 'Markup looks consistent.');
    };
  }
}

function injectHelpPanel(){
  try{
    const btn   = document.getElementById('shortcutsBtn');
    const modal = document.getElementById('shortcutsOverlay');
    const title = document.getElementById('shortcutsTitle');
    const close = document.getElementById('shortcutsClose');
    if (!modal) return;

    // Rename button + title
    if (btn)   { btn.textContent = 'Help'; btn.setAttribute('aria-label','Help and shortcuts'); }
    if (title) { title.textContent = 'Help'; }

    // Find the sheet body
    const sheet = modal.querySelector('.sheet');
    if (!sheet) return;

    // Prevent duplicate insertion
    if (sheet.querySelector('#tagGuide')) return;

    const guide = document.createElement('div');
    guide.id = 'tagGuide';
    guide.innerHTML = `
      <hr class="hr" />
      <details open>
        <summary><strong>Script Tag Guide</strong></summary>
        <div class="tag-guide">
          <p class="dim">Official tags for podcast scripts — consistent and scroll‑ready.</p>
          <h4>Speaker Tags</h4>
          <ul>
            <li><code>[s1] ... [/s1]</code> → Joe</li>
            <li><code>[s2] ... [/s2]</code> → Brad</li>
          </ul>
          <p><em>Always close the tag. Never add <code>: Name</code> after the tag.</em></p>

          <h4>Notes / Cues</h4>
          <ul>
            <li><code>[note] ... [/note]</code> — stage direction, tone, pacing, delivery, music cues, etc.</li>
            <li><strong>Notes must be on their own line</strong> (not inside speaker tags).</li>
          </ul>

          <h4>Inline Styles</h4>
          <ul>
            <li>No inline color, italics, or extra formatting.</li>
            <li>If emphasis is needed, describe it in a <code>[note]</code> block instead.</li>
          </ul>

          <h4>Rules</h4>
          <ul>
            <li>Every spoken paragraph starts with <code>[s1]</code> or <code>[s2]</code>.</li>
            <li>Every note uses <code>[note]...[/note]</code> on its own paragraph.</li>
            <li>No duplicate or stray tags.</li>
            <li>Keep scripts human‑readable and teleprompter‑friendly.</li>
          </ul>

          <div class="row" style="margin-top:.6rem">
            <button id="guideNormalize" class="btn-chip">Normalize current script</button>
            <button id="guideValidate" class="btn-chip">Validate</button>
          </div>
        </div>
      </details>
    `;

    // Insert guide after the shortcuts grid
    const grid = sheet.querySelector('.shortcuts-grid');
    if (grid && grid.parentElement) {
      grid.parentElement.appendChild(guide);
    } else {
      sheet.appendChild(guide);
    }

    // Wire quick actions (reuse existing functions if present)
    document.getElementById('guideNormalize')?.addEventListener('click', ()=>{
      try{
        const src = (typeof editor !== 'undefined' && editor) ? editor.value : '';
        if (typeof normalizeScriptStrict === 'function'){
          const out = normalizeScriptStrict(src);
          if (editor) editor.value = out;
          if (typeof renderScript === 'function') renderScript(out);
          setStatus && setStatus('Normalized to standard tags.');
        } else if (typeof normalizeScript === 'function'){
          const out = normalizeScript(src).text || normalizeScript(src); // backward compat
          if (editor) editor.value = out;
          if (typeof renderScript === 'function') renderScript(out);
          setStatus && setStatus('Normalized.');
        }
      }catch(err){ console.error(err); }
    });

    document.getElementById('guideValidate')?.addEventListener('click', ()=>{
      try{
        const src = (typeof editor !== 'undefined' && editor) ? editor.value : '';
        if (typeof validateScriptStrict === 'function'){
          const issues = validateScriptStrict(src);
          if (!issues.length) alert('✅ Script passes the standard.');
          else alert('⚠️ Issues:\\n- ' + issues.join('\\n- '));
        } else {
          alert('Validation is not available in this build.');
        }
      }catch(err){ console.error(err); }
    });

  }catch(err){ console.error('Help injection failed', err); }
}

function init() {
  // ⬇️ grab these *first*
  shortcutsBtn     = document.getElementById('shortcutsBtn');
  shortcutsOverlay = document.getElementById('shortcutsOverlay');
  shortcutsClose   = document.getElementById('shortcutsClose');

  // Shortcuts overlay open/close logic (now safe)
  function openShortcuts(){
    if (!shortcutsOverlay) return;
    shortcutsOverlay.classList.remove('hidden');
    shortcutsBtn?.setAttribute('aria-expanded','true');
    setTimeout(()=>shortcutsClose?.focus(), 0);
  }
  function closeShortcuts(){
    if (!shortcutsOverlay) return;
    shortcutsOverlay.classList.add('hidden');
    shortcutsBtn?.setAttribute('aria-expanded','false');
    shortcutsBtn?.focus();
  }

  // Now bind listeners
  shortcutsBtn?.addEventListener('click', openShortcuts);
  shortcutsClose?.addEventListener('click', closeShortcuts);
  shortcutsOverlay?.addEventListener('click', (e)=>{
    if (e.target === shortcutsOverlay) closeShortcuts();
  });
  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (typing) return; // don't steal keys when user is typing

    switch (e.key) {
      case ' ': // Space
        e.preventDefault();
        if (autoTimer) stopAutoScroll(); else startAutoScroll();
        break;
      case 'ArrowUp':
        e.preventDefault();
        tweakSpeed(+5); // +5 px/s
        break;
      case 'ArrowDown':
        e.preventDefault();
        tweakSpeed(-5); // -5 px/s
        break;
      case '1':
        wrapSelection('[s1]', '[/s1]');
        break;
      case '2':
        wrapSelection('[s2]', '[/s2]');
        break;
      case '3':
        wrapSelection('[g1]', '[/g1]');
        break;
      case '4':
        wrapSelection('[g2]', '[/g2]');
        break;
      case '?':
      case '/':
        if (e.shiftKey) { e.preventDefault(); openShortcuts(); }
        break;
    }
  });

  // Stall-recovery watchdog: if matching goes quiet, nudge forward gently
  setInterval(() => {
    if (!recActive || !viewer) return; // only when speech sync is active
    if (typeof autoTimer !== 'undefined' && autoTimer) return; // don't fight auto-scroll
    const now = performance.now();
  const MISS_FALLBACK_MS = 1800;   // no matches for ~1.8s
  const FALLBACK_STEP_PX = 18;     // calmer nudge (50% of previous)
    if (now - _lastAdvanceAt > MISS_FALLBACK_MS) {
      viewer.scrollTop = Math.min(viewer.scrollTop + FALLBACK_STEP_PX, viewer.scrollHeight);
      sendToDisplay({ type:'scroll', top: viewer.scrollTop });
      // also advance logical index to the paragraph under the marker
      try{
        if (Array.isArray(paraIndex) && paraIndex.length){
          const markerY = viewer.scrollTop + (viewer.clientHeight * (MARKER_PCT || 0.33));
          let target = paraIndex[0];
          for (const p of paraIndex){ if (p.el.offsetTop <= markerY) target = p; else break; }
          if (target){ currentIndex = Math.min(Math.max(target.start, currentIndex + 3), target.end); }
        }
      }catch{}
      _lastAdvanceAt = now;
      if (typeof debug === 'function') debug({ tag:'fallback-nudge', top: viewer.scrollTop, idx: currentIndex });
    }
  }, 250);

  // After wiring open/close for the overlay:
  ensureHelpUI();  // <- renames “Shortcuts” to “Help” and injects the Normalize + Validate buttons

  // Query all elements once
  shortcutsBtn     = document.getElementById('shortcutsBtn');
shortcutsOverlay = document.getElementById('shortcutsOverlay');
shortcutsClose   = document.getElementById('shortcutsClose');


  editor   = document.getElementById('editor');
  scriptEl = document.getElementById('script');
  viewer   = document.getElementById('viewer');
  legendEl = document.getElementById('legend');

  permChip    = document.getElementById('permChip');
  displayChip = document.getElementById('displayChip');
  recChip     = document.getElementById('recChip');

  openDisplayBtn  = document.getElementById('openDisplayBtn');
  closeDisplayBtn = document.getElementById('closeDisplayBtn');
  presentBtn      = document.getElementById('presentBtn');

  micBtn          = document.getElementById('micBtn');
  recBtn          = document.getElementById('recBtn');
  micDeviceSel    = document.getElementById('micDeviceSel');
  refreshDevicesBtn = document.getElementById('refreshDevicesBtn');

  fontSizeInput   = document.getElementById('fontSize');
  lineHeightInput = document.getElementById('lineHeight');
  autoToggle      = document.getElementById('autoToggle');
  autoSpeed       = document.getElementById('autoSpeed');
  const matchAggroSel = document.getElementById('matchAggro');
  const motionSmoothSel = document.getElementById('motionSmooth');

  timerEl     = document.getElementById('timer');
  resetBtn    = document.getElementById('resetBtn');
  loadSample  = document.getElementById('loadSample');
  clearText   = document.getElementById('clearText');

  saveLocalBtn     = document.getElementById('saveLocal');
  loadLocalBtn     = document.getElementById('loadLocal');
  downloadFileBtn  = document.getElementById('downloadFile');
  uploadFileBtn    = document.getElementById('uploadFileBtn');
  uploadFileInput  = document.getElementById('uploadFile');

  wrapBold      = document.getElementById('wrap-bold');
  wrapItalic    = document.getElementById('wrap-italic');
  wrapUnderline = document.getElementById('wrap-underline');
  wrapNote      = document.getElementById('wrap-note');
  wrapColor     = document.getElementById('wrap-color');
  wrapBg        = document.getElementById('wrap-bg');
  autoTagBtn    = document.getElementById('autoTagBtn');

  nameS1 = document.getElementById('name-s1');
  colorS1= document.getElementById('color-s1');
  wrapS1 = document.getElementById('wrap-s1');

  nameS2 = document.getElementById('name-s2');
  colorS2= document.getElementById('color-s2');
  wrapS2 = document.getElementById('wrap-s2');

  nameG1 = document.getElementById('name-g1');
  colorG1= document.getElementById('color-g1');
  wrapG1 = document.getElementById('wrap-g1');

  nameG2 = document.getElementById('name-g2');
  colorG2= document.getElementById('color-g2');
  wrapG2 = document.getElementById('wrap-g2');

  camWrap    = document.getElementById('camWrap');
  camVideo   = document.getElementById('camVideo');
  // Ensure inline playback on mobile Safari without using unsupported HTML attribute in some browsers
  if (camVideo) {
    try {
      // Set properties first (best practice for autoplay/inline)
      camVideo.muted = true;            // required for mobile autoplay
      camVideo.autoplay = true;
      camVideo.playsInline = true;
      // Hide native controls
      camVideo.controls = false;
      camVideo.removeAttribute('controls');
      camVideo.removeAttribute('controlsList');
      camVideo.disablePictureInPicture = true;
      camVideo.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
      // Then mirror as attributes for broader compatibility
      camVideo.setAttribute('playsinline', '');
      camVideo.setAttribute('webkit-playsinline', '');
    } catch {}
  }
  startCamBtn= document.getElementById('startCam');
  stopCamBtn = document.getElementById('stopCam');
  camDeviceSel = document.getElementById('camDevice');
  camSize    = document.getElementById('camSize');
  camOpacity = document.getElementById('camOpacity');
  camMirror  = document.getElementById('camMirror');
  camPiP     = document.getElementById('camPiP');

  prerollInput = document.getElementById('preroll');
  countOverlay = document.getElementById('countOverlay');
  countNum     = document.getElementById('countNum');

  dbMeter = document.getElementById('dbMeter'); // ← required by startDbMeter()

  // Speakers toggle bits
  toggleSpeakersBtn = document.getElementById('toggleSpeakers');
  speakersBody      = document.getElementById('speakersBody');

  if (!openDisplayBtn) { setStatus('Boot: DOM not ready / IDs missing'); return; }
  // …keep the rest of your init() as-is…

    // Wire UI
    openDisplayBtn.addEventListener('click', openDisplay);
    closeDisplayBtn.addEventListener('click', closeDisplay);
    presentBtn.addEventListener('click', openDisplay);

    fontSizeInput.addEventListener('input', applyTypography);
    lineHeightInput.addEventListener('input', applyTypography);

    autoToggle.addEventListener('click', () => {
      if (autoTimer) stopAutoScroll(); else startAutoScroll();
    });

    resetBtn.addEventListener('click', resetTimer);

    loadSample.addEventListener('click', () => {
      editor.value = 'Welcome to [b]Teleprompter Pro[/b].\n\nUse [s1]roles[/s1], [note]notes[/note], and colors like [color=#ff0]this[/color].';
      renderScript(editor.value);
    });
    clearText.addEventListener('click', () => { editor.value=''; renderScript(''); });

    // Top-bar Normalize button (near Load sample)
    const normalizeTopBtn = document.getElementById('normalizeTopBtn');
    normalizeTopBtn?.addEventListener('click', () => {
      if (typeof window.normalizeToStandard === 'function') {
        try { window.normalizeToStandard(); } catch (e) { alert('Normalize error: ' + e.message); }
        return;
      }
      // Shared fallback
      fallbackNormalize();
    });

    saveLocalBtn?.addEventListener('click', saveToLocal);
    loadLocalBtn?.addEventListener('click', loadFromLocal);
    downloadFileBtn?.addEventListener('click', () => downloadAsFile('script.txt', editor.value));

    uploadFileBtn?.addEventListener('click', () => uploadFileInput?.click());
    uploadFileInput?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      await uploadFromFile(f);
      uploadFileInput.value = '';
    });

    editor.addEventListener('input', () => renderScript(editor.value));
    editor.addEventListener('paste', (ev) => {
      const dt = ev.clipboardData;
      if (!dt) return; const text = dt.getData('text/plain');
      if (!text) return;
      ev.preventDefault();
      const alreadyTagged = /\[(s1|s2|g1|g2)\]/i.test(text);
      const normalized = normalizeSimpleTagTypos(text);
      const converted = alreadyTagged ? normalized : smartTag(normalized);
      const start = editor.selectionStart, end = editor.selectionEnd;
      const v = editor.value; editor.value = v.slice(0,start) + converted + v.slice(end);
      editor.selectionStart = editor.selectionEnd = start + converted.length;
      renderScript(editor.value);
    });

    // Role inputs -> live update
    syncRoleInputs();
    [nameS1,colorS1, nameS2,colorS2, nameG1,colorG1, nameG2,colorG2].forEach(el => el?.addEventListener('input', onRoleChange));
    updateLegend();

    wrapS1?.addEventListener('click', () => wrapSelection('[s1]','[/s1]'));
    wrapS2?.addEventListener('click', () => wrapSelection('[s2]','[/s2]'));
    wrapG1?.addEventListener('click', () => wrapSelection('[g1]','[/g1]'));
    wrapG2?.addEventListener('click', () => wrapSelection('[g2]','[/g2]'));

    wrapBold?.addEventListener('click', () => wrapSelection('[b]','[/b]'));
    wrapItalic?.addEventListener('click', () => wrapSelection('[i]','[/i]'));
    wrapUnderline?.addEventListener('click', () => wrapSelection('[u]','[/u]'));
    wrapNote?.addEventListener('click', () => wrapSelection('[note]','[/note]'));
    wrapColor?.addEventListener('click', () => {
      const c = prompt('Color (name or #hex):', '#ff0'); if (!c) return; wrapSelection(`[color=${c}]`, '[/color]');
    });
    wrapBg?.addEventListener('click', () => {
      const c = prompt('Background (name or #hex):', '#112233'); if (!c) return; wrapSelection(`[bg=${c}]`, '[/bg]');
    });

    autoTagBtn?.addEventListener('click', () => {
      editor.value = smartTag(editor.value);
      renderScript(editor.value);
    });


    // Mic and devices
    micBtn?.addEventListener('click', requestMic);
    refreshDevicesBtn?.addEventListener('click', populateDevices);

    // Recognition on/off (placeholder toggle)
    recBtn?.addEventListener('click', toggleRec);

    // Camera
    startCamBtn?.addEventListener('click', startCamera);
    stopCamBtn?.addEventListener('click', stopCamera);
    camDeviceSel?.addEventListener('change', () => { if (camVideo?.srcObject) startCamera(); });
    camSize?.addEventListener('input', applyCamSizing);
    camOpacity?.addEventListener('input', applyCamOpacity);
    camMirror?.addEventListener('change', applyCamMirror);
    camPiP?.addEventListener('click', togglePiP);

    // Display handshake: accept either a string ping or a typed object
    window.addEventListener('message', (e) => {
      if (!displayWin || e.source !== displayWin) return;
      if (e.data === 'DISPLAY_READY' || e.data?.type === 'display-ready') {
        displayReady = true;
        displayChip.textContent = 'Display: ready';
        // push initial state
        sendToDisplay({ type:'render', html: scriptEl.innerHTML, fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });
        sendToDisplay({ type:'scroll', top: viewer.scrollTop });
        closeDisplayBtn.disabled = false;
      }
    });

    // Build dB meter bars
    buildDbBars();

    // Restore UI prefs from localStorage (if any)
    const AGGRO_KEY = 'tp_match_aggro_v1';
    try {
      const savedAggro = localStorage.getItem(AGGRO_KEY);
      if (savedAggro && matchAggroSel) matchAggroSel.value = savedAggro;
    } catch {}
    const SMOOTH_KEY = 'tp_motion_smooth_v1';
    try {
      const savedSmooth = localStorage.getItem(SMOOTH_KEY);
      if (savedSmooth && motionSmoothSel) motionSmoothSel.value = savedSmooth;
    } catch {}

    // Initial render
    renderScript(editor.value || '');
    // Apply aggressiveness mapping now and on change
    function applyAggro(){
      const v = (matchAggroSel?.value || '2');
      if (v === '1'){ SIM_THRESHOLD = 0.60; MATCH_WINDOW_AHEAD = 140; }
      else if (v === '3'){ SIM_THRESHOLD = 0.42; MATCH_WINDOW_AHEAD = 260; }
      else { SIM_THRESHOLD = 0.50; MATCH_WINDOW_AHEAD = 200; }
    }
    applyAggro();
    matchAggroSel?.addEventListener('change', (e)=>{
      applyAggro();
      try { localStorage.setItem(AGGRO_KEY, matchAggroSel.value || '2'); } catch {}
    });

    // Apply motion smoothness mapping now and on change
    function applySmooth(){
      const v = (motionSmoothSel?.value || 'balanced');
      // adjust soft scroll tunables used in advanceByTranscript and scrollToCurrentIndex
      if (v === 'stable'){
        window.__TP_SCROLL = { DEAD: 22, THROTTLE: 280, FWD: 80, BACK: 30, EASE_STEP: 60, EASE_MIN: 12 };
      } else if (v === 'responsive'){
        window.__TP_SCROLL = { DEAD: 12, THROTTLE: 160, FWD: 120, BACK: 170, EASE_STEP: 96, EASE_MIN: 6 };
      } else {
        window.__TP_SCROLL = { DEAD: 18, THROTTLE: 240, FWD: 96, BACK: 140, EASE_STEP: 80, EASE_MIN: 10 };
      }
    }
    applySmooth();
    motionSmoothSel?.addEventListener('change', ()=>{
      applySmooth();
      try { localStorage.setItem(SMOOTH_KEY, motionSmoothSel.value || 'balanced'); } catch {}
    });

    // Try to list devices
    populateDevices();

  setStatus('Ready.');
  }

  /* ──────────────────────────────────────────────────────────────
   * Roles + Legend
   * ────────────────────────────────────────────────────────────── */
  function loadRoles(){
    try { return Object.assign({}, ROLE_DEFAULTS, JSON.parse(localStorage.getItem(ROLES_KEY)||'{}')); }
    catch { return {...ROLE_DEFAULTS}; }
  }
  function saveRoles(map){ localStorage.setItem(ROLES_KEY, JSON.stringify(map)); }

  function syncRoleInputs(){
    if (nameS1) nameS1.value = ROLES.s1.name; if (colorS1) colorS1.value = ROLES.s1.color;
    if (nameS2) nameS2.value = ROLES.s2.name; if (colorS2) colorS2.value = ROLES.s2.color;
    if (nameG1) nameG1.value = ROLES.g1.name; if (colorG1) colorG1.value = ROLES.g1.color;
    if (nameG2) nameG2.value = ROLES.g2.name; if (colorG2) colorG2.value = ROLES.g2.color;
  }
  function onRoleChange(){
    ROLES.s1.name = nameS1?.value || ROLES.s1.name; ROLES.s1.color = colorS1?.value || ROLES.s1.color;
    ROLES.s2.name = nameS2?.value || ROLES.s2.name; ROLES.s2.color = colorS2?.value || ROLES.s2.color;
    ROLES.g1.name = nameG1?.value || ROLES.g1.name; ROLES.g1.color = colorG1?.value || ROLES.g1.color;
    ROLES.g2.name = nameG2?.value || ROLES.g2.name; ROLES.g2.color = colorG2?.value || ROLES.g2.color;
    saveRoles(ROLES);
    updateLegend();
    renderScript(editor.value);
  }
  function updateLegend(){
    if (!legendEl) return; legendEl.innerHTML = '';
    for (const key of ROLE_KEYS){
      const item = ROLES[key];
      const tag = document.createElement('span');
      tag.className = 'tag';
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = item.color;
      const name = document.createElement('span'); name.textContent = item.name;
      tag.appendChild(dot); tag.appendChild(name);
      legendEl.appendChild(tag);
    }
  }
  function safeColor(c){
    c = String(c||'').trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
    if (/^rgba?\(/i.test(c)) return c;
    if (/^[a-z]{3,20}$/i.test(c)) return c; // simple keyword
    return '';
  }
  function roleStyle(key){
    const item = ROLES[key] || ROLES.s1;
    return `color:${item.color}; font-size:inherit; line-height:inherit;`;
  }

  /* ──────────────────────────────────────────────────────────────
   * Markup + Render
   * ────────────────────────────────────────────────────────────── */
 function normWord(w){ return String(w).toLowerCase().replace(/[^a-z0-9']/g,''); }
function splitWords(t){ return String(t).toLowerCase().split(/\s+/).map(normWord).filter(Boolean); }

function scrollToCurrentIndex(){
  if (!paraIndex.length) return;
  const p = paraIndex.find(p => currentIndex >= p.start && currentIndex <= p.end) || paraIndex[paraIndex.length-1];
  // Highlight active paragraph (optional)
  paraIndex.forEach(pi => pi.el.classList.toggle('active', pi === p));
  // Center-ish scroll
  const target = Math.max(0, p.el.offsetTop - (viewer.clientHeight * 0.40));
  // gentle ease towards target (use smoothness prefs if present)
  const S = (window.__TP_SCROLL || { EASE_STEP: 80, EASE_MIN: 10 });
  const dy = target - viewer.scrollTop;
  if (Math.abs(dy) > S.EASE_MIN) {
    viewer.scrollTop += Math.sign(dy) * Math.min(Math.abs(dy), S.EASE_STEP);
  } else {
    viewer.scrollTop = target;
  }
  if (typeof markAdvance === 'function') markAdvance(); else _lastAdvanceAt = performance.now();
  if (typeof debug === 'function') debug({ tag:'scroll', top: viewer.scrollTop });
  sendToDisplay({ type: 'scroll', top: viewer.scrollTop });
}


// Matcher constants and helpers (single source of truth)
let _lastMatchAt = 0;
let _lastCorrectionAt = 0;
let _lastAdvanceAt = performance.now(); // stall-recovery timestamp
// Throttle interim matches; how many recent spoken tokens to consider
const MATCH_INTERVAL_MS = 120;
const SPOKEN_N = 8;
// Window relative to currentIndex to search
  const MATCH_WINDOW_BACK = 30;
  // Tunables (let so we can adjust via the “Match aggressiveness” select)
  let MATCH_WINDOW_AHEAD = 200;
  let SIM_THRESHOLD      = 0.50;
// Similarity thresholds and motion clamps
const STRICT_FORWARD_SIM = 0.72;
const MAX_JUMP_AHEAD_WORDS = 12;
// Scroll correction tuning
const MARKER_PCT = 0.33;
// Gentler motion to avoid jumpiness
let DEAD_BAND_PX = 18;          // ignore small errors
let CORRECTION_MIN_MS = 240;    // throttle corrections
let MAX_FWD_STEP_PX = 96;       // clamp forward step size
let MAX_BACK_STEP_PX = 140;     // clamp backward step size

// Fast overlap score: count of shared tokens (case-normalized by normTokens already)
function _overlap(a, b){
  if (!a?.length || !b?.length) return 0;
  const set = new Set(b);
  let n = 0; for (const w of a) if (set.has(w)) n++;
  return n;
}

// Token similarity in 0..1 using Dice coefficient (robust and cheap)
function _sim(a, b){
  if (!a?.length || !b?.length) return 0;
  const overlap = _overlap(a, b);
  return (2 * overlap) / (a.length + b.length);
}

// Advance currentIndex by trying to align recognized words to the upcoming script words
function advanceByTranscript(transcript, isFinal){
  // Adopt current smoothness settings if provided
  const SC = (window.__TP_SCROLL || { DEAD: DEAD_BAND_PX, THROTTLE: CORRECTION_MIN_MS, FWD: MAX_FWD_STEP_PX, BACK: MAX_BACK_STEP_PX });
  DEAD_BAND_PX = SC.DEAD; CORRECTION_MIN_MS = SC.THROTTLE; MAX_FWD_STEP_PX = SC.FWD; MAX_BACK_STEP_PX = SC.BACK;
  if (!scriptWords.length) return;
  const now = performance.now();
  if (now - _lastMatchAt < MATCH_INTERVAL_MS && !isFinal) return;
  _lastMatchAt = now;

  const spokenAll = normTokens(transcript);
  const spoken    = spokenAll.slice(-SPOKEN_N);
  if (!spoken.length) return;

  // Search a band around currentIndex
  const start = Math.max(0, currentIndex - MATCH_WINDOW_BACK);
  const end   = Math.min(scriptWords.length, currentIndex + MATCH_WINDOW_AHEAD);

  // Build candidates with a fast overlap filter first
  const candidates = [];
  for (let i = start; i <= end - spoken.length; i++){
    const win = normTokens(scriptWords.slice(i, i + spoken.length).join(' '));
    const fast = _overlap(spoken, win);
    if (fast > 0) candidates.push({ i, win, fast });
  }
  if (!candidates.length) return;

  candidates.sort((a,b)=>b.fast - a.fast);
  const top = candidates.slice(0, 8);

  // Refine with Levenshtein similarity
  let bestIdx = currentIndex, bestScore = -Infinity;
  for (const c of top){
    const score = _sim(spoken, c.win);
    if (score > bestScore){ bestScore = score; bestIdx = c.i; }
  }
  if (bestScore < SIM_THRESHOLD) return;

  // Soften big forward jumps unless similarity is very strong
  const delta = bestIdx - currentIndex;
  debug({
    tag: 'match',
    spokenTail: spoken.join(' '),
    bestIdx,
    bestScore: Number(bestScore.toFixed(3)),
    delta
  });
  if (delta > MAX_JUMP_AHEAD_WORDS && bestScore < STRICT_FORWARD_SIM){
    currentIndex += MAX_JUMP_AHEAD_WORDS;
  } else {
    currentIndex = Math.max(0, Math.min(bestIdx, scriptWords.length - 1));
  }

  // Scroll toward the paragraph that contains currentIndex, gently clamped
  if (!paraIndex.length) return;
  const targetPara = paraIndex.find(p => currentIndex >= p.start && currentIndex <= p.end) || paraIndex[paraIndex.length-1];
  const maxTop     = Math.max(0, scriptEl.scrollHeight - viewer.clientHeight);
  const markerTop  = viewer.clientHeight * MARKER_PCT;
  const desiredTop = Math.max(0, Math.min(maxTop, (targetPara.el.offsetTop - markerTop)));

  const err = desiredTop - viewer.scrollTop;
  const tNow = performance.now();
  if (Math.abs(err) < DEAD_BAND_PX || (tNow - _lastCorrectionAt) < CORRECTION_MIN_MS) return;

  // Scale steps based on whether this came from a final (more confident) match
  const fwdStep = isFinal ? MAX_FWD_STEP_PX : Math.round(MAX_FWD_STEP_PX * 0.6);
  const backStep = isFinal ? MAX_BACK_STEP_PX : Math.round(MAX_BACK_STEP_PX * 0.6);
  let next;
  if (err > 0) next = Math.min(viewer.scrollTop + fwdStep, desiredTop);
  else         next = Math.max(viewer.scrollTop - backStep, desiredTop);

  viewer.scrollTop = next;
  if (typeof debug === 'function') debug({ tag:'scroll', top: viewer.scrollTop });
  sendToDisplay({ type:'scroll', top: next });
  // mark progress for stall-recovery
  if (typeof markAdvance === 'function') markAdvance(); else _lastAdvanceAt = performance.now();
  _lastCorrectionAt = tNow;
}

  function escapeHtml(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  function formatInlineMarkup(text){
    let s = escapeHtml(text);
    // basic
    s = s
      .replace(/\[b\]([\s\S]+?)\[\/b\]/gi, '<strong>$1<\/strong>')
      .replace(/\[i\]([\s\S]+?)\[\/i\]/gi, '<em>$1<\/em>')
      .replace(/\[u\]([\s\S]+?)\[\/u\]/gi, '<span class="u">$1<\/span>')
      // Notes render as block-level for clarity
      .replace(/\[note\]([\s\S]+?)\[\/note\]/gi, '<div class="note">$1<\/div>');
    // color/bg
    s = s.replace(/\[color=([^\]]+)\]([\s\S]+?)\[\/color\]/gi, (_, col, inner) => {
      const c = safeColor(col); return c ? `<span style="color:${c}">${inner}</span>` : inner;
    });
    s = s.replace(/\[bg=([^\]]+)\]([\s\S]+?)\[\/bg\]/gi, (_, col, inner) => {
      const c = safeColor(col); return c ? `<span style="background:${c};padding:0 .15em;border-radius:.2em">${inner}</span>` : inner;
    });
  // roles (standardized: only s1/s2 are colorized; g1/g2 and guest wrappers are stripped)
    // Colorize s1 and s2
    s = s.replace(/\[s1\]([\s\S]+?)\[\/s1\]/gi, (_, inner) => `<span style="${roleStyle('s1')}">${inner}<\/span>`);
    s = s.replace(/\[s2\]([\s\S]+?)\[\/s2\]/gi, (_, inner) => `<span style="${roleStyle('s2')}">${inner}<\/span>`);
    // Strip g1/g2 wrappers, keep content
    s = s.replace(/\[(g1|g2)\]([\s\S]+?)\[\/\1\]/gi, '$2');
    // Map [speaker=1|2] to s1/s2 styling; strip [guest=*]
    s = s.replace(/\[speaker\s*=\s*(1|2)\]([\s\S]+?)\[\/speaker\]/gi, (_, idx, inner) => `<span style="${roleStyle('s'+idx)}">${inner}<\/span>`);
    s = s.replace(/\[guest\s*=\s*(1|2)\]([\s\S]+?)\[\/guest\]/gi, '$2');
    // final scrub: remove any stray speaker tags that slipped into inline text (notes are handled as blocks)
    s = s.replace(/\[\/?(?:s1|s2|g1|g2)\]/gi, '');
    return s;
  }

  function stripTagsForTokens(text){
    let s = String(text||'');
    // Notes are not spoken → drop entirely
    s = s.replace(/\[note\][\s\S]*?\[\/note\]/gi, '');
    // Keep spoken content; drop wrappers
    s = s.replace(/\[(?:s1|s2)\]([\s\S]+?)\[\/(?:s1|s2)\]/gi, '$1');
    // Drop g1/g2 and guest wrappers entirely (content kept by previous rules if needed)
    s = s.replace(/\[(?:g1|g2)\][\s\S]*?\[\/(?:g1|g2)\]/gi, '');
    s = s.replace(/\[(?:guest|speaker)\s*=\s*(?:1|2)\]([\s\S]+?)\[\/(?:guest|speaker)\]/gi, '$1');
    s = s.replace(/\[color=[^\]]+\]([\s\S]+?)\[\/color\]/gi, '$1');
    s = s.replace(/\[bg=[^\]]+\]([\s\S]+?)\[\/bg\]/gi, '$1');
    s = s.replace(/\[(?:b|i|u)\]([\s\S]+?)\[\/(?:b|i|u)\]/gi, '$1');
    return s;
  }

  function applyTypography(){
    scriptEl.querySelectorAll('p, .note').forEach(el => {
      el.style.fontSize  = String(fontSizeInput.value) + 'px';
      el.style.lineHeight= String(lineHeightInput.value);
    });
    sendToDisplay({ type: 'typography', fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });
  }

  function renderScript(text){
    const t = String(text || '');

  // Tokenize for speech sync (strip tags so only spoken words are matched)
  scriptWords = normTokens(stripTagsForTokens(text));

    // Build paragraphs; preserve single \n as <br>
    // First, split on double newlines into blocks, then further split any block
    // that contains note divs so note blocks always stand alone.
    const blocks = t.split(/\n{2,}/);
    const outParts = [];
    for (const b of blocks){
      // Convert inline markup first so notes become <div class="note"> blocks
      const html = formatInlineMarkup(b).replace(/\n/g,'<br>');
      // If there are one or more note divs inside, split them out to standalone entries
      if (/<div class=\"note\"[\s\S]*?<\/div>/i.test(html)){
        const pieces = html.split(/(?=<div class=\"note\")|(?<=<\/div>)/i).filter(Boolean);
        for (const piece of pieces){
          if (/^\s*<div class=\"note\"/i.test(piece)) outParts.push(piece);
          else if (piece.trim()) outParts.push(`<p>${piece}</p>`);
        }
      } else {
        outParts.push(html.trim() ? `<p>${html}</p>` : '');
      }
    }
    const paragraphs = outParts.filter(Boolean).join('');

    scriptEl.innerHTML = paragraphs || '<p><em>Paste text in the editor to begin…</em></p>';
    applyTypography();
  // currentIndex = 0; // Do not reset index when rendering script for speech sync

    // Mirror to display
    sendToDisplay({ type:'render', html: scriptEl.innerHTML, fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });

    // Build paragraph index
    const paras = Array.from(scriptEl.querySelectorAll('p'));
    paraIndex = []; let acc = 0;
    for (const el of paras){
      const wc = normTokens(el.textContent || '').length || 1;
      paraIndex.push({ el, start: acc, end: acc + wc - 1 });
      acc += wc;
    }
  }

  // call this whenever you actually advance or scroll due to a match
  function markAdvance(){ _lastAdvanceAt = performance.now(); }
  window.renderScript = renderScript; // for any external callers

  // --- Token normalization (used by DOCX import, renderScript, and matcher) ---
function normTokens(text){
  let t = String(text).toLowerCase()
    .replace(/’/g,"'")
    // expand common contractions
    .replace(/\b(won't)\b/g, 'will not')
    .replace(/\b(can't)\b/g, 'cannot')
    .replace(/\b(\w+)'re\b/g, '$1 are')
    .replace(/\b(\w+)'ll\b/g, '$1 will')
    .replace(/\b(\w+)'ve\b/g, '$1 have')
    .replace(/\b(\w+)'d\b/g, '$1 would')
    .replace(/\b(\w+)'m\b/g, '$1 am')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\bthat's\b/g, 'that is');

  // split number ranges: 76–86, 8-7 → "76 86", "8 7"
  t = t.replace(/(\d+)\s*[\u2010-\u2015-]\s*(\d+)/g, '$1 $2');

  // turn percent into a word so "86 %" ≈ "eighty six percent"
  t = t.replace(/%/g, ' percent');

  // split hyphenated words into what you actually say: matter-of-fact → matter of fact
  t = t.replace(/([a-z])[\u2010-\u2015-]([a-z])/gi, '$1 $2');

  // strip general punctuation (also eat long dashes)
  t = t.replace(/[.,!?;:()"\[\]`]/g, ' ')
       .replace(/[\u2010-\u2015]/g, ' ');

  const raw = t.split(/\s+/).filter(Boolean);

  // numerals 0..99 → words (helps overlap)
  const ones = ['zero','one','two','three','four','five','six','seven','eight','nine'];
  const teens= ['ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const numToWords = (n) => {
    n = Number(n);
    if (Number.isNaN(n) || n < 0 || n > 99) return null;
    if (n < 10) return ones[n];
    if (n < 20) return teens[n-10];
    const t = Math.floor(n/10), o = n%10;
    return o ? `${tens[t]} ${ones[o]}` : tens[t];
  };

  const out = [];
  for (const w of raw){
    if (/^\d{1,2}$/.test(w)){
      const words = numToWords(w);
      if (words){ out.push(...words.split(' ')); continue; }
    }
    out.push(w);
  }
  return out;
}

  /* ──────────────────────────────────────────────────────────────
   * Smart Tagging (names → roles)
   * ────────────────────────────────────────────────────────────── */
  function normalizeSimpleTagTypos(text){
    // Fix common bracket typos like [ s1 ]
    return String(text||'').replace(/\[\s*(s1|s2|g1|g2)\s*\]/ig, '[$1]')
                           .replace(/\[\s*\/(s1|s2|g1|g2)\s*\]/ig, '[/$1]');
  }

  function smartTag(input, opts = {}) {
    // if already tagged, do nothing (prevents double-wrapping on re-run)
    if (/\[(s1|s2|g1|g2)\]/i.test(input)) return input;

    const keepNames = opts.keepNames !== false; // default: true
    const lines = String(input || '').split(/\r?\n/);

    const ROLE_KEYS = ['s1','s2','g1','g2'];
    const nameToRole = new Map();
    for (const key of ROLE_KEYS) {
      const nm = (ROLES[key].name || '').trim();
      if (nm) nameToRole.set(nm.toLowerCase(), key);
    }
    const aliasToRole = new Map([
      ['s1','s1'], ['speaker 1','s1'], ['host 1','s1'],
      ['s2','s2'], ['speaker 2','s2'], ['host 2','s2'],
      ['g1','g1'], ['guest 1','g1'],
      ['g2','g2'], ['guest 2','g2'],
    ]);

    const resolveRole = (name) => {
      const who = String(name||'').trim().toLowerCase().replace(/\s+/g,' ');
      return nameToRole.get(who) || aliasToRole.get(who) || null;
    };
    const displayNameFor = (role, fallback) => (ROLES[role]?.name || fallback || '').trim();

    let currentRole = null;       // active role after a block header
    let pendingLabel = null;      // add label on next paragraph flush
    let paraBuf = [];
    const out = [];

    const flush = () => {
      if (!paraBuf.length) return;
      const text = paraBuf.join(' ').trim();
      if (text) {
        if (currentRole) {
          const label = keepNames && pendingLabel ? `[b]${pendingLabel}:[/b] ` : '';
          out.push(`[${currentRole}]${label}${text}[/${currentRole}]`);
        } else {
          out.push(text);
        }
      }
      paraBuf = [];
      pendingLabel = null; // only show the label on the first paragraph after header
    };

    for (const raw of lines) {
      const s = raw.trim();

      // Block header: ">> NAME:" (also accepts single '>' and :, —, > as enders)
      const block = s.match(/^>{1,2}\s*([^:>\-—()]+?)\s*[:>\-—]\s*$/i);
      if (block) {
        flush();
        const name = block[1];
        const role = resolveRole(name);
        currentRole = role;
        pendingLabel = role && keepNames ? displayNameFor(role, name) : null;
        continue;
      }

      // Inline: "Name: text" / "Name — text" / "Name > text"
      const inline = raw.match(/^\s*([^:>\-—()]+?)(?:\s*\((off[-\s]?script)\))?\s*[:>\-—]\s*(.+)$/i);
      if (inline) {
        flush();
        const who   = inline[1];
        const body  = inline[3].trim();
        const role  = resolveRole(who);
        if (role) {
          const show = keepNames ? `[b]${displayNameFor(role, who)}:[/b] ` : '';
          out.push(`[${role}]${show}${body}[/${role}]`);
          currentRole = role;     // keep role active until another header/inline
          pendingLabel = null;    // inline already included label
          continue;
        }
        // if no role match, fall through and treat as plain text
      }

      // Paragraph break
      if (!s) { flush(); out.push(''); continue; }

      // Accumulate content under current role (if any)
      paraBuf.push(s);
    }

    flush();
    return out.join('\n');
  }

function openDisplay(){
  try {
    displayWin = window.open('display.html', 'TeleprompterDisplay', 'width=1000,height=700');
    if (!displayWin) {
      setStatus('Pop-up blocked. Allow pop-ups and try again.');
      displayChip.textContent = 'Display: blocked';
      return;
    }
    displayChip.textContent = 'Display: open';
    closeDisplayBtn.disabled = true;  // enable once it’s ready

    // Handshake: wait until the display window signals it’s ready
    const readyListener = (ev) => {
      if (!displayWin || displayWin.closed) return;
      if (ev.source !== displayWin || ev.data !== 'DISPLAY_READY') return;
      window.removeEventListener('message', readyListener);

      // Send initial state
      sendToDisplay({ type:'render', html: scriptEl.innerHTML, fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });
      sendToDisplay({ type:'scroll', top: viewer.scrollTop });
      closeDisplayBtn.disabled = false;
    };
    window.addEventListener('message', readyListener);
  } catch (e) {
    setStatus('Unable to open display window: ' + e.message);
  }
}
  function closeDisplay(){ if(displayWin && !displayWin.closed) displayWin.close(); displayWin=null; closeDisplayBtn.disabled=true; displayChip.textContent='Display: closed'; }
  function sendToDisplay(payload){ if(displayWin && !displayWin.closed) displayWin.postMessage(payload, '*'); }
  window.sendToDisplay = sendToDisplay;

  /* ──────────────────────────────────────────────────────────────
   * Typography + Auto‑scroll + Timer
   * ────────────────────────────────────────────────────────────── */
function startAutoScroll(){
  if (autoTimer) return;
  const step = () => {
    const pxPerSec = Math.max(0, Number(autoSpeed.value) || 0);
    viewer.scrollTop += (pxPerSec / 60);
    sendToDisplay({ type: 'scroll', top: viewer.scrollTop });
    // keep label updated with live speed
    autoToggle.textContent = `Auto-scroll: On (${pxPerSec}px/s)`;
  };
  autoTimer = setInterval(step, 1000 / 60);
  step(); // immediate tick so it feels responsive
}

function stopAutoScroll(){
  clearInterval(autoTimer);
  autoTimer = null;
  autoToggle.textContent = 'Auto-scroll: Off';
}

// ⬇️ keep this OUTSIDE stopAutoScroll
function tweakSpeed(delta){
  let v = Number(autoSpeed.value) || 0;
  v = Math.max(0, Math.min(300, v + delta));
  autoSpeed.value = String(v);
  if (autoTimer) autoToggle.textContent = `Auto-scroll: On (${v}px/s)`;
}


  function startTimer(){ if (chrono) return; chronoStart = performance.now(); chrono = requestAnimationFrame(tickTimer); }
  function tickTimer(now){ const t = (now - chronoStart) / 1000; const m = Math.floor(t/60); const s = Math.floor(t%60); const d = Math.floor((t%1)*10); timerEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`; chrono = requestAnimationFrame(tickTimer); }
  function resetTimer(){ if (chrono){ cancelAnimationFrame(chrono); chrono=null; } timerEl.textContent = '00:00.0'; }

  function beginCountdownThen(sec, fn){
    sec = Math.max(0, Number(sec)||0);
    if (!sec){ fn(); return; }
    let n = sec;
    const show = (v) => { countNum.textContent = String(v); countOverlay.style.display='flex'; sendToDisplay({type:'preroll', show:true, n:v}); };
    show(n);
    const id = setInterval(() => { n -= 1; if (n<=0){ clearInterval(id); countOverlay.style.display='none'; sendToDisplay({type:'preroll', show:false}); fn(); } else show(n); }, 1000);
  }


function toggleRec(){
  if (recActive){
    recActive = false;
    document.body.classList.remove('listening'); // when stopping
    stopSpeechSync();
    recChip.textContent = 'Speech: idle';
    recBtn.textContent = 'Start speech sync';
    return;
  }

  const sec = Number(prerollInput?.value) || 0;
  beginCountdownThen(sec, () => {
    recActive = true;
    document.body.classList.add('listening'); // when starting
    recChip.textContent = 'Speech: listening…';
    recBtn.textContent = 'Stop speech sync';
    startTimer();
    startSpeechSync();
  });
}


  /* ──────────────────────────────────────────────────────────────
   * Devices + Mic + dB meter
   * ────────────────────────────────────────────────────────────── */
  function buildDbBars(){ if (!dbMeter) return; dbMeter.innerHTML=''; for (let i=0;i<20;i++){ const b=document.createElement('div'); b.className='bar'+(i>12? ' yellow': (i>16? ' red':'')); dbMeter.appendChild(b); } }
  function clearBars(){ if (!dbMeter) return; dbMeter.querySelectorAll('.bar').forEach(b=>b.classList.remove('on')); }
  function stopDbMeter(){ if (dbAnim) cancelAnimationFrame(dbAnim); dbAnim=null; try{ if (audioStream) audioStream.getTracks().forEach(t=>t.stop()); }catch{} audioStream=null; analyser=null; }

  async function startDbMeter(stream){
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { warn('AudioContext unavailable'); return; }
    const ctx = new AC(); const src = ctx.createMediaStreamSource(stream); analyser = ctx.createAnalyser(); analyser.fftSize=2048; src.connect(analyser);
    const bars = Array.from(dbMeter.querySelectorAll('.bar'));
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a,b)=>a+b,0)/data.length; // 0..255
      const level = Math.floor((avg/255)*bars.length);
      bars.forEach((b,i)=> b.classList.toggle('on', i<level));
      dbAnim = requestAnimationFrame(draw);
    };
    draw();
  }

  async function populateDevices(){
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      updateMicDevices(devices); updateCamDevices(devices);
    } catch(e){ warn('enumerateDevices failed', e); }
  }

  function updateMicDevices(devices){ if (!micDeviceSel) return; const opts = devices.filter(d=>d.kind==='audioinput'); micDeviceSel.innerHTML=''; for (const d of opts){ const o=document.createElement('option'); o.value=d.deviceId||''; o.textContent=d.label||('Mic '+(micDeviceSel.length+1)); micDeviceSel.appendChild(o);} }
  function updateCamDevices(devices){ if (!camDeviceSel) return; const opts = devices.filter(d=>d.kind==='videoinput'); camDeviceSel.innerHTML=''; for (const d of opts){ const o=document.createElement('option'); o.value=d.deviceId||''; o.textContent=d.label||('Camera '+(camDeviceSel.length+1)); camDeviceSel.appendChild(o);} }

  async function requestMic(){
    try {
      const id = micDeviceSel?.value || undefined;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: id? {deviceId: {exact:id}} : true, video: false });
      audioStream = stream; permChip.textContent = 'Mic: granted'; recBtn.disabled = false; startDbMeter(stream); populateDevices();
    } catch(e){ permChip.textContent = 'Mic: denied'; warn('getUserMedia failed', e); }
  }

  /* ──────────────────────────────────────────────────────────────
   * Camera overlay
   * ────────────────────────────────────────────────────────────── */
  async function startCamera(){
    try{
      const id = camDeviceSel?.value || undefined;
      const stream = await navigator.mediaDevices.getUserMedia({ video: id? {deviceId:{exact:id}} : true, audio:false });
      // Order matters: set properties/attributes first, then assign stream, then play()
      camVideo.muted = true;            // required for mobile autoplay
      camVideo.autoplay = true;
      camVideo.playsInline = true;
  camVideo.controls = false; camVideo.removeAttribute('controls'); camVideo.removeAttribute('controlsList');
  camVideo.disablePictureInPicture = true;
  camVideo.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
      camVideo.setAttribute('playsinline','');
      camVideo.setAttribute('webkit-playsinline','');
      camVideo.srcObject = stream;
      try {
        await camVideo.play();
      } catch (err) {
        // Autoplay might be blocked (iOS). Provide a simple tap-to-start fallback.
        warn('Camera autoplay blocked, waiting for user gesture', err);
        setStatus('Tap the video to start the camera');
        const onTap = async () => {
          try { await camVideo.play(); setStatus(''); camVideo.removeEventListener('click', onTap); } catch {}
        };
        camVideo.addEventListener('click', onTap, { once: true });
      }
      camWrap.style.display = 'block'; startCamBtn.disabled=true; stopCamBtn.disabled=false; applyCamSizing(); applyCamOpacity(); applyCamMirror();
      populateDevices();
    } catch(e){ warn('startCamera failed', e); }
  }
  function stopCamera(){ try{ const s = camVideo?.srcObject; if (s) s.getTracks().forEach(t=>t.stop()); }catch{} camVideo.srcObject=null; camWrap.style.display='none'; startCamBtn.disabled=false; stopCamBtn.disabled=true; }
  function applyCamSizing(){ const pct = Math.max(15, Math.min(60, Number(camSize.value)||28)); camWrap.style.width = pct+'%'; }
  function applyCamOpacity(){ const op = Math.max(0.2, Math.min(1, (Number(camOpacity.value)||100)/100)); camWrap.style.opacity = String(op); }
  function applyCamMirror(){ camWrap.classList.toggle('mirrored', !!camMirror.checked); }
  async function togglePiP(){ try{ if (document.pictureInPictureElement){ await document.exitPictureInPicture(); } else { await camVideo.requestPictureInPicture(); } } catch(e){ warn('PiP failed', e); } }

  /* ──────────────────────────────────────────────────────────────
   * Local storage + File I/O (DOCX supported)
   * ────────────────────────────────────────────────────────────── */
  const LS_KEY = 'tp_script_v1';
  function saveToLocal(){ try{ localStorage.setItem(LS_KEY, editor.value||''); setStatus('Saved to browser.'); }catch(e){ setStatus('Save failed.'); } }
  function loadFromLocal(){ try{ const v = localStorage.getItem(LS_KEY)||''; editor.value=v; renderScript(v); setStatus('Loaded from browser.'); }catch(e){ setStatus('Load failed.'); } }
  function scheduleAutosave(){ /* optional: attach a debounce here */ }

  function downloadAsFile(name, text){
    const a = document.createElement('a'); a.download=name; a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));
    document.body.appendChild(a); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 500); a.remove();
  }

  /* ──────────────────────────────────────────────────────────────
   * Speech recognition start/stop logic
   * ────────────────────────────────────────────────────────────── */
  function startSpeechSync(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR){
      setStatus('Speech recognition not supported in this browser.');
      return;
    }
    // Don’t fight with auto-scroll
    if (autoTimer) stopAutoScroll();

    recog = new SR();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';

    let _lastInterimAt = 0;
    recog.onresult = (e) => {
      let interim = '';
      let finals  = '';
      for (let i = e.resultIndex; i < e.results.length; i++){
        const r = e.results[i];
        if (r.isFinal) finals  += (r[0]?.transcript || '') + ' ';
        else           interim += (r[0]?.transcript || '') + ' ';
      }
      // Finals = strong jumps
      if (finals) advanceByTranscript(finals, /*isFinal*/true);

      // Interims = gentle tracking (every ~150ms)
      const now = performance.now();
      if (interim && (now - _lastInterimAt) > 150) {
        _lastInterimAt = now;
        advanceByTranscript(interim, /*isFinal*/false);
      }
    };

    recog.onerror = (e) => { console.warn('speech error', e.error); };
    recog.onend = () => {
      // Auto-restart while active (Chrome tends to end sessions periodically)
      if (recActive) { try { recog.start(); } catch(_){} }
    };

    try { recog.start(); } catch(e){ console.warn('speech start failed', e); }
  }

  function stopSpeechSync(){
    try { recog && recog.stop(); } catch(_) {}
    recog = null;
  }

  async function ensureMammoth(){
    if (window.mammoth) return window.mammoth;
    await new Promise((res,rej)=>{
      const s=document.createElement('script'); s.src='https://unpkg.com/mammoth/mammoth.browser.min.js'; s.onload=res; s.onerror=()=>rej(new Error('Mammoth failed to load')); document.head.appendChild(s);
    });
    return window.mammoth;
  }

  async function uploadFromFile(file){
    const lower = (file.name||'').toLowerCase();
    const isDocx = lower.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (isDocx){
      try{
        const mammoth = await ensureMammoth();
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        const text = String(value||'').replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
        editor.value = text; renderScript(text); setStatus(`Loaded “${file.name}” (.docx).`);
      } catch(e){ err(e); setStatus('Failed to read .docx: ' + (e?.message||e)); }
      return;
    }

    // Plain text / md / rtf / .text → read as text (RTF will include markup)
    const reader = new FileReader();
    reader.onload = () => { editor.value = reader.result || ''; renderScript(editor.value); setStatus(`Loaded “${file.name}”.`); };
    reader.onerror = () => setStatus('Failed to read file.');
    reader.readAsText(file, 'utf-8');
  }

// --- Debug HUD (toggle with `~`) ---
(() => {
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
      if (!on) debugClear(); else ensureBox();
    }
  });
})();

})();
