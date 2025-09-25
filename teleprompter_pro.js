/* Teleprompter Pro — JS CLEAN (v1.5.6)
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

  // TP: zoom-guard (main)
  // Prevent browser-level zoom (Ctrl/Meta + wheel or +/-/0) so each window keeps its own in-app typography zoom.
  try {
    window.addEventListener('wheel', (e)=>{
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); }
    }, { passive: false });
    window.addEventListener('keydown', (e)=>{
      if (e.ctrlKey || e.metaKey) {
        const k = (e.key||'');
        if (k === '+' || k === '=' || k === '-' || k === '_' || k === '0') e.preventDefault();
      }
    }, { capture: true });
  } catch {}



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

// Shared Normalize wiring helper
function wireNormalizeButton(btn){
  try {
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      try {
        if (typeof window.normalizeToStandard === 'function') window.normalizeToStandard();
        else if (typeof window.fallbackNormalize === 'function') window.fallbackNormalize();
      } catch(e){ try { alert('Normalize error: '+(e?.message||e)); } catch {} }
    });
  } catch {}
}

// Tiny toast utility (optional) for subtle pings
    // Incremental build only once; subsequent opens just sync values
    let _settingsBuilt = false;
    function buildSettingsContent(){
      const body = document.getElementById('settingsBody');
      if (!body) return;
      if (_settingsBuilt){
        if (!body.querySelector('.settings-card')) { _settingsBuilt = false; }
        else { syncSettingsValues(); return; }
      }
      const getVal = (id, fallback='') => {
        try { const el = document.getElementById(id); return (el && 'value' in el && el.value !== undefined) ? el.value : fallback; } catch { return fallback; }
      };
      const isChecked = (id) => { try { const el = document.getElementById(id); return !!el?.checked; } catch { return false; } };
      const speakersHidden = !!document.getElementById('speakersBody')?.classList.contains('hidden');

      const frag = document.createDocumentFragment();
      const card = (id, title, tab, innerHtml) => {
        const d = document.createElement('div');
        d.className = 'settings-card';
        d.dataset.tab = tab;
        d.id = id;
        d.innerHTML = `<h4>${title}</h4><div class="settings-card-body">${innerHtml}</div>`;
        return d;
      };
      frag.appendChild(card('cardMic','Microphone','media',`
        <div class="settings-inline-row">
          <button id="settingsReqMic" class="btn-chip">Request mic</button>
          <select id="settingsMicSel" class="select-md"></select>
        </div>
        <div class="settings-small">Select input and grant permission for speech sync & dB meter.</div>`));
      frag.appendChild(card('cardCam','Camera','media',`
        <div class="settings-inline-row">
          <button id="settingsStartCam" class="btn-chip">Start</button>
          <button id="settingsStopCam" class="btn-chip">Stop</button>
          <select id="settingsCamSel" class="select-md"></select>
        </div>
        <div class="settings-inline-row">
          <label>Size <input id="settingsCamSize" type="number" min="15" max="60" value="${getVal('camSize',28)}" style="width:70px"></label>
          <label>Opacity <input id="settingsCamOpacity" type="number" min="20" max="100" value="${getVal('camOpacity',100)}" style="width:80px"></label>
          <label><input id="settingsCamMirror" type="checkbox" ${isChecked('camMirror')? 'checked':''}/> Mirror</label>
        </div>
        <div class="settings-small">Camera overlay floats over the script.</div>`));
      frag.appendChild(card('cardSpeakers','Speakers','general',`
        <div class="settings-inline-row">
          <button id="settingsShowSpeakers" class="btn-chip">${speakersHidden?'Show':'Hide'} List</button>
          <button id="settingsNormalize" class="btn-chip">Normalize Script</button>
        </div>
        <div class="settings-small">Manage speaker tags & quick normalization.</div>`));
      frag.appendChild(card('cardRecording','Recording','recording',`
        <div class="settings-inline-row">
          <label><input type="checkbox" id="settingsEnableObs" ${isChecked('enableObs')?'checked':''}/> Enable OBS</label>
          <input id="settingsObsUrl" class="obs-url" type="text" value="${getVal('obsUrl','ws://127.0.0.1:4455')}" placeholder="ws://host:port" />
          <input id="settingsObsPass" class="obs-pass" type="password" value="${getVal('obsPassword','')}" placeholder="password" />
          <button id="settingsObsTest" class="btn-chip">Test</button>
        </div>
        <div class="settings-small">Controls global recorder settings (mirrors panel options).</div>`));
      try {
        body.appendChild(frag);
        wireSettingsDynamic();
        syncSettingsValues();
        setupSettingsTabs();
        if (body.querySelector('.settings-card')) _settingsBuilt = true;
      } catch (e) {
        console.warn('Settings build failed, will retry', e);
        _settingsBuilt = false;
      }
    }

    function syncSettingsValues(){
      // Mic devices now source-of-truth is settingsMicSel itself; nothing to sync.
      const micSel = document.getElementById('settingsMicSel');
      if (micSel && !micSel.options.length) {
        // If not yet populated, attempt populateDevices (async, fire and forget)
        try { populateDevices(); } catch {}
      }
      const camSelS = document.getElementById('settingsCamSel');
      if (camSelS && camDeviceSel){
        if (camSelS.innerHTML !== camDeviceSel.innerHTML) camSelS.innerHTML = camDeviceSel.innerHTML;
        camSelS.value = camDeviceSel.value;
      }
      const showSpk = document.getElementById('settingsShowSpeakers');
      if (showSpk) showSpk.textContent = speakersBody?.classList.contains('hidden') ? 'Show List' : 'Hide List';
      const obsEnable = document.getElementById('settingsEnableObs');
      if (obsEnable && enableObsChk) obsEnable.checked = enableObsChk.checked;
      const obsUrlS = document.getElementById('settingsObsUrl');
      if (obsUrlS && obsUrlInput) obsUrlS.value = obsUrlInput.value;
      const obsPassS = document.getElementById('settingsObsPass');
      if (obsPassS && obsPassInput) obsPassS.value = obsPassInput.value;
    }

    function setupSettingsTabs(){
      const tabs = Array.from(document.querySelectorAll('#settingsTabs .settings-tab'));
      const cards = Array.from(settingsBody.querySelectorAll('.settings-card'));
      // Hide tabs with no cards lazily
      tabs.forEach(tab => {
        const tabName = tab.dataset.tab;
        const hasCard = cards.some(c => c.dataset.tab === tabName);
        if (!hasCard) tab.style.display = 'none';
      });

      // Animation helpers
      const ANIM_IN = 'anim-in';
      const ANIM_OUT = 'anim-out';
      function showCard(c){
        if (c._visible) return; // already visible
        c._visible = true;
        c.style.display = 'flex';
        c.classList.remove(ANIM_OUT);
        // force reflow for animation restart
        void c.offsetWidth;
        c.classList.add(ANIM_IN);
        c.addEventListener('animationend', (e)=>{ if(e.animationName==='cardFadeIn') c.classList.remove(ANIM_IN); }, { once:true });
      }
      function hideCard(c){
        if (!c._visible) return; // already hidden
        c._visible = false;
        c.classList.remove(ANIM_IN);
        c.classList.add(ANIM_OUT);
        c.addEventListener('animationend', (e)=>{
          if (e.animationName==='cardFadeOut') { c.classList.remove(ANIM_OUT); c.style.display='none'; }
        }, { once:true });
      }

      const apply = (name) => {
        const sel = name || 'general';
        try { localStorage.setItem('tp_settings_tab', sel); } catch {}
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === sel));
        cards.forEach(c => {
          const show = c.dataset.tab === sel;
            if (show) showCard(c); else hideCard(c);
        });
      };
      tabs.forEach(t => t.addEventListener('click', ()=> apply(t.dataset.tab)));
      let last = 'general';
      try { last = localStorage.getItem('tp_settings_tab') || 'general'; } catch {}
      // Initialize visibility (no animation on first render)
      cards.forEach(c => { c._visible = false; c.style.display='none'; });
      apply(last);
    }
    // (Removed stray recorder settings snippet accidentally injected here)
    // Kick self-checks if available (guard so we only run once)
    try { if (typeof runSelfChecks === 'function' && !window.__selfChecksRan) { window.__selfChecksRan = true; setTimeout(()=>{ try{ runSelfChecks(); }catch{} }, 120); } } catch {}

  // TP: normalize-fallback
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

  // TP: normalize-strict
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
  function showCopyDialog(text, title='Validation Results'){
    if (window.__help?.showCopyDialog) return window.__help.showCopyDialog(text, title);
    // fallback: simple alert
    alert(String(title)+"\n\n"+String(text||''));
  }

  // Global helper: show validation output in the Help overlay's panel with copy support
  window.showValidation = function showValidation(text){
    if (window.__help?.showValidation) return window.__help.showValidation(text);
    return showCopyDialog(text, 'Validation');
  };

  window.validateStandardTags = function validateStandardTags(silent=false) {
    if (window.__help?.validateStandardTags) return window.__help.validateStandardTags(silent);
    const ta = document.getElementById('editor');
    const src = String(ta?.value || '');
    const lines = src.split(/\r?\n/);
    // Configurable tag set
    if (!window.validatorConfig) window.validatorConfig = { allowedTags: new Set(['s1','s2','note']) };
    const allowed = window.validatorConfig.allowedTags;
    const speakerTags = new Set(['s1','s2']);
    const stack = []; // {tag,line}
    let s1Blocks=0, s2Blocks=0, noteBlocks=0; let unknownCount=0;
    const issues=[]; const issueObjs=[];
    function addIssue(line,msg,type='issue',detail){ issues.push(`line ${line}: ${msg}`); issueObjs.push({ line, message: msg, type, detail }); }
    const tagRe = /\[(\/)?([a-z0-9]+)(?:=[^\]]+)?\]/gi;
    for (let i=0;i<lines.length;i++){
      const rawLine=lines[i]; const lineNum=i+1; let m; tagRe.lastIndex=0;
      while((m=tagRe.exec(rawLine))){
        const closing=!!m[1]; const nameRaw=m[2]; const name=nameRaw.toLowerCase();
        if(!allowed.has(name)){ unknownCount++; addIssue(lineNum,`unsupported tag [${closing?'\/':''}${nameRaw}]`,'unsupported',{tag:name}); continue; }
        if(!closing){
          if(name==='note'){
            if(stack.length){ addIssue(lineNum,`[note] must not appear inside [${stack[stack.length-1].tag}] (opened line ${stack[stack.length-1].line})`,'nested-note',{parent:stack[stack.length-1].tag}); }
            stack.push({tag:name,line:lineNum});
          } else if(speakerTags.has(name)) {
            if(stack.length && speakerTags.has(stack[stack.length-1].tag)) addIssue(lineNum,`[${name}] opened before closing previous [${stack[stack.length-1].tag}] (opened line ${stack[stack.length-1].line})`,'nested-speaker',{prev:stack[stack.length-1].tag,prevLine:stack[stack.length-1].line});
            stack.push({tag:name,line:lineNum});
          } else { stack.push({tag:name,line:lineNum}); }
        } else {
          if(!stack.length){ addIssue(lineNum,`stray closing tag [\/${name}]`,'stray-close',{tag:name}); continue; }
          const top=stack[stack.length-1];
          if(top.tag===name){ stack.pop(); if(name==='s1') s1Blocks++; else if(name==='s2') s2Blocks++; else if(name==='note') noteBlocks++; }
          else {
            addIssue(lineNum,`mismatched closing [\/${name}] – expected [\/${top.tag}] for opening on line ${top.line}`,'mismatch',{expected:top.tag,openLine:top.line,found:name});
            let poppedAny=false; while(stack.length && stack[stack.length-1].tag!==name){ stack.pop(); poppedAny=true; }
            if(stack.length && stack[stack.length-1].tag===name){ const opener=stack.pop(); if(name==='s1') s1Blocks++; else if(name==='s2') s2Blocks++; else if(name==='note') noteBlocks++; if(poppedAny) addIssue(lineNum,`auto-recovered by closing [\/${name}] (opened line ${opener.line}) after mismatches`,'auto-recover',{tag:name,openLine:opener.line}); }
            else addIssue(lineNum,`no matching open tag for [\/${name}]`,'no-match',{tag:name});
          }
        }
      }
    }
    for(const open of stack) addIssue(open.line,`unclosed [${open.tag}] opened here`,'unclosed',{tag:open.tag});
    const summaryParts=[`s1 blocks: ${s1Blocks}`,`s2 blocks: ${s2Blocks}`,`notes: ${noteBlocks}`]; if(unknownCount) summaryParts.push(`unsupported tags: ${unknownCount}`);
    // Quick fixes
    const fixes=[]; for(const iss of issueObjs){
      if(iss.type==='unclosed' && /(s1|s2)/i.test(iss.message)){ const tag=iss.message.match(/\[(s1|s2)\]/i)?.[1]; if(tag) fixes.push({type:'append-close',tag,label:`Append closing [\/${tag}] at end`,apply:(text)=> text + (text.endsWith('\n')?'':'\n') + `[\/${tag}]\n`}); }
      else if(iss.type==='stray-close'){ fixes.push({type:'remove-line',line:iss.line,label:`Remove stray closing tag on line ${iss.line}`,apply:(text)=> text.split(/\r?\n/).filter((_,i)=>i!==iss.line-1).join('\n')}); }
      else if(iss.type==='mismatch'){ const found=iss.message.match(/mismatched closing \[\/(\w+)\]/i)?.[1]; const expected=iss.message.match(/expected \[\/(\w+)\]/i)?.[1]; if(found&&expected&&found!==expected) fixes.push({type:'replace-tag',line:iss.line,from:found,to:expected,label:`Replace [\/${found}] with [\/${expected}] on line ${iss.line}`,apply:(text)=>{ const arr=text.split(/\r?\n/); const ln=arr[iss.line-1]; if(ln) arr[iss.line-1]=ln.replace(new RegExp(`\[\/${found}\]`,'i'),`[\/${expected}]`); return arr.join('\n'); }}); }
    }
    let msg = !issues.length ? `No issues found. (${summaryParts.join(', ')})` : `Validation issues (${issues.length}):\n- ${issues.join('\n- ')}\n\nSummary: ${summaryParts.join(', ')}`;
    window.__lastValidation={ issues: issueObjs, summary: summaryParts, fixes };
    // Inline highlighting
    try {
      const existing = document.getElementById('validatorLineOverlay');
      if (existing) existing.remove();
      if (issueObjs.length && ta){
        const overlay = document.createElement('div');
        overlay.id='validatorLineOverlay';
        overlay.style.cssText='position:absolute;inset:0;pointer-events:none;font:inherit;';
        // Positioning container wrapper if not already relative
        const wrap = ta.parentElement;
        if (wrap && getComputedStyle(wrap).position==='static') wrap.style.position='relative';
        // Map: line -> severity color
        const colors = { 'unclosed':'#d33', 'mismatch':'#d33', 'nested-speaker':'#d33', 'nested-note':'#d33', 'stray-close':'#d55', 'unsupported':'#b46', 'auto-recover':'#c80', 'no-match':'#d33', 'issue':'#c30' };
        const badLines = new Set(issueObjs.map(i=>i.line));
        // Build spans aligned via line height approximation
        const style = getComputedStyle(ta); const lh = parseFloat(style.lineHeight)||16; const padTop = ta.scrollTop; // will adjust on scroll
        function rebuild(){
          overlay.innerHTML='';
          const scrollTop = ta.scrollTop; const firstVisible = Math.floor(scrollTop / lh)-1; const linesVisible = Math.ceil(ta.clientHeight / lh)+2;
          for (let i=0;i<linesVisible;i++){
            const lineIdx = firstVisible + i; if (lineIdx <0) continue; const lineNumber=lineIdx+1; if(!badLines.has(lineNumber)) continue;
            const issue = issueObjs.find(o=>o.line===lineNumber);
            const bar = document.createElement('div');
            bar.title = issue.message;
            bar.style.cssText = `position:absolute;left:0;right:0;top:${lineIdx*lh}px;height:${lh}px;background:linear-gradient(90deg,${colors[issue.type]||'#c30'}22,transparent 80%);pointer-events:none;`;
            overlay.appendChild(bar);
          }
        }
        rebuild();
        ta.addEventListener('scroll', rebuild, { passive:true });
        // cleanup on next validation run handled by removal above
        wrap.appendChild(overlay);
      }
    } catch {}
    if (!silent) showCopyDialog(msg, 'Validator');
    return msg;
  };
  window.extendValidatorTags = function(tags){ if(!Array.isArray(tags)) return; if(!window.validatorConfig) window.validatorConfig={allowedTags:new Set(['s1','s2','note'])}; tags.forEach(t=>{ if(t) window.validatorConfig.allowedTags.add(String(t).toLowerCase()); }); };
  window.setValidatorAllowedTags = function(tags){ if(!Array.isArray(tags)) return; window.validatorConfig={allowedTags:new Set(tags.map(t=>String(t).toLowerCase()))}; };

  /* ──────────────────────────────────────────────────────────────
   * Globals and state
   * ────────────────────────────────────────────────────────────── */
  let displayWin = null;
  let displayReady = false;
  // Handshake retry: if display opens but READY message never arrives (popup timing race),
  // we ping it a few times with a lightweight hello. Stops early if READY received.
  let displayHelloTimer = null;      // interval id
  let displayHelloDeadline = 0;      // timestamp (ms) when we stop retrying
  let dbAnim = null, analyser = null, audioStream = null;
  let audioCtx = null; // global reference to AudioContext for suspend/resume
  let peakHold = { value:0, decay:0.005, lastUpdate:0 };
  const DEVICE_KEY = 'tp_last_input_device_v1';
  let pendingAutoStart = false;
  let recActive = false;          // you already have this
  let recog = null;               // SpeechRecognition instance
  let recAutoRestart = true;      // keep recognition alive while active
  // Persisted preference (default ON)
  try {
    const v = localStorage.getItem('tp_rec_autorestart_v1');
    if (v === '0' || v === 'false') recAutoRestart = false;
  } catch {}
  // Expose a live getter/setter for Help → Advanced to toggle at runtime
  try {
    Object.defineProperty(window, 'recAutoRestart', {
      configurable: true,
      get(){ return recAutoRestart; },
      set(v){ recAutoRestart = !!v; try{ localStorage.setItem('tp_rec_autorestart_v1', recAutoRestart ? '1' : '0'); } catch {} }
    });
  } catch {}
  let recBackoffMs   = 300;       // grows on repeated failures
  const MATCH_WINDOW = 6;         // how far ahead we’ll look for the next word
  // Safe placeholders for optional modules to prevent ReferenceError when dynamic import fails
  let __scrollHelpers = null; // set after scroll-helpers.js loads
  let __anchorObs = null;     // set after io-anchor.js loads
  let __scrollCtl = null;     // set after scroll-control.js loads
  // Mic selector single source of truth (settings overlay)
  const getMicSel = () => document.getElementById('settingsMicSel');
  let autoTimer = null, chrono = null, chronoStart = 0;
  let scriptWords = [], paraIndex = [], currentIndex = 0;
  // Hard-bound current line tracking
  let currentEl = null;               // currently active <p> element
  let lineEls = [];                   // array of <p> elements in script order
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
  // Broadcast channel to keep display colors in sync with Settings
  let bc = null; try { bc = new BroadcastChannel('prompter'); } catch {}
  function applyRoleCssVars(){
    try {
      const r = document.documentElement;
      if (ROLES?.s1?.color) r.style.setProperty('--s1-color', ROLES.s1.color);
      if (ROLES?.s2?.color) r.style.setProperty('--s2-color', ROLES.s2.color);
    } catch {}
  }
  function broadcastSpeakerColors(){
    try { bc && bc.postMessage({ type:'SPEAKER_COLORS', s1: ROLES?.s1?.color, s2: ROLES?.s2?.color }); } catch {}
  }
  function broadcastSpeakerNames(){
    try { bc && bc.postMessage({ type:'SPEAKER_NAMES', s1Name: ROLES?.s1?.name, s2Name: ROLES?.s2?.name }); } catch {}
  }

  // DOM (late‑bound during init)
  let editor, scriptEl, viewer, legendEl,
      permChip, displayChip, recChip,
    debugPosChip,
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
  dbMeterTop,
      toggleSpeakersBtn, speakersBody;

  // TP: meter-audio
  // ───────────────────────────────────────────────────────────────
  // dB meter utilities (single source of truth: top bar only)
  // ───────────────────────────────────────────────────────────────
  function buildDbBars(target){
    if (!target) return [];
    target.classList.add('db-bars');
    // If already has bars, reuse
    let bars = Array.from(target.querySelectorAll('.bar'));
    if (bars.length >= 16) return bars;
    target.innerHTML = '';
    const total = 20;
    for (let i=0;i<total;i++){
      const b=document.createElement('div');
      b.className='bar';
      const ratio = i/(total-1); // 0 (left) -> 1 (right)
      // Interpolate hue 120 (green) -> 0 (red)
      const hue = 120 - (120 * ratio);
      const sat = 70; // percent
      const light = 30 + (ratio*25); // brighten a bit toward red end
      b.style.setProperty('--bar-color', `hsl(${hue}deg ${sat}% ${light}%)`);
      target.appendChild(b);
    }
    // Peak marker
    const peak = document.createElement('div'); peak.className='peak-marker'; peak.style.transform='translateX(0)'; target.appendChild(peak);
    // Scale ticks (every 5 bars) – positioned absolutely
    const ticks = document.createElement('div');
    ticks.style.cssText='position:absolute;inset:0;pointer-events:none;font:8px/1 ui-monospace,monospace;color:#fff5;display:flex;';
    for (let i=0;i<20;i++){
      if (i % 5 === 0){
        const t = document.createElement('div');
        t.style.cssText='flex:1;position:relative;';
        const line = document.createElement('div'); line.style.cssText='position:absolute;top:0;bottom:0;left:0;width:1px;background:#ffffff22';
        const lbl = document.createElement('div'); lbl.textContent = (i===0?'-∞': `-${(20 - i)}dB`).replace('--','-'); lbl.style.cssText='position:absolute;bottom:100%;left:0;transform:translate(-2px,-2px);white-space:nowrap;';
        t.appendChild(line); t.appendChild(lbl); ticks.appendChild(t);
      } else {
        const spacer = document.createElement('div'); spacer.style.flex='1'; ticks.appendChild(spacer);
      }
    }
    target.appendChild(ticks);
    return Array.from(target.querySelectorAll('.bar'));
  }

  function clearBars(el){ if (!el) return; el.querySelectorAll('.bar.on').forEach(b=>b.classList.remove('on')); }

  function stopDbMeter(){
    if (dbAnim) cancelAnimationFrame(dbAnim); dbAnim = null;
    try{ if (audioStream) audioStream.getTracks().forEach(t=>t.stop()); }catch{}
    audioStream = null; analyser = null;
  try { clearBars(dbMeterTop); } catch {}
  }

  async function startDbMeter(stream){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { warn('AudioContext unavailable'); return; }
  const ctx = new AC();
  audioCtx = ctx; // retain for suspend/resume when tab visibility changes
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const topBars  = buildDbBars(dbMeterTop);
    const peakEl = dbMeterTop?.querySelector('.peak-marker');
    peakHold.value = 0; peakHold.lastUpdate = performance.now();
    // Log scaling configuration
    const dBFloor = -60;  // anything quieter treated as silence
    const attack = 0.55;  // 0..1 (higher = faster rise)
    const release = 0.15; // 0..1 (higher = faster fall)
    let levelSmooth = 0;  // smoothed 0..1 level after log mapping
    const draw = () => {
      analyser.getByteFrequencyData(data);
      // Root-mean-square amplitude 0..1
      const rms = Math.sqrt(data.reduce((a,b)=>a + b*b, 0) / data.length) / 255;
      // Convert to approximate dBFS
      const dbfs = rms>0 ? (20 * Math.log10(rms)) : -Infinity;
      // Clamp & normalize to 0..1 based on floor
      const dB = dbfs === -Infinity ? dBFloor : Math.max(dBFloor, Math.min(0, dbfs));
      let level = (dB - dBFloor) / (0 - dBFloor); // linear 0..1 after log compress
      if (!isFinite(level) || level < 0) level = 0; else if (level > 1) level = 1;
      // Smooth (different attack/release)
      if (level > levelSmooth) levelSmooth = levelSmooth + (level - levelSmooth) * attack; else levelSmooth = levelSmooth + (level - levelSmooth) * release;
      const bars = Math.max(0, Math.min(topBars.length, Math.round(levelSmooth * topBars.length)));
      for (let i=0;i<topBars.length;i++) topBars[i].classList.toggle('on', i < bars);
      // Peak hold: keep highest bar for a short decay
      const now = performance.now();
      if (bars > peakHold.value) { peakHold.value = bars; peakHold.lastUpdate = now; }
      else if (now - peakHold.lastUpdate > 350) { // start decay after hold period
        peakHold.value = Math.max(0, peakHold.value - peakHold.decay * ( (now - peakHold.lastUpdate) / 16 ));
      }
      const peakIndex = Math.max(0, Math.min(topBars.length-1, Math.floor(peakHold.value-1)));
      if (peakEl){
        const bar = topBars[peakIndex];
        if (bar){
          const x = bar.offsetLeft;
          peakEl.style.transform = `translateX(${x}px)`;
          peakEl.style.opacity = peakHold.value>0?'.9':'0';
          // Color shift based on level percentage
          const pct = levelSmooth; // use smoothed 0..1 level for color classification
          let color = '#2eff7d'; // green
          if (pct > 0.85) color = '#ff3131';
          else if (pct > 0.65) color = '#ffb347';
          peakEl.style.backgroundColor = color;
          peakEl.style.boxShadow = `0 0 4px ${color}aa`;
        }
        // Tooltip stats (rounded)
        peakEl.title = `Approx RMS: ${(rms*100).toFixed(0)}%\nApprox dBFS: ${dbfs===-Infinity?'–∞':dbfs.toFixed(1)} dB`;
      }
      dbAnim = requestAnimationFrame(draw);
    };
    draw();
  }

  async function requestMic(){
    try {
      const chosenId = getMicSel()?.value || undefined;
      const constraints = { audio: { deviceId: chosenId ? { exact: chosenId } : undefined } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      audioStream = stream;
      try { permChip && (permChip.textContent = 'Mic: allowed'); } catch {}
      startDbMeter(stream);
      // Persist chosen device
      try { if (chosenId) localStorage.setItem(DEVICE_KEY, chosenId); } catch {}
    } catch(e){
      warn('Mic denied or failed', e);
      try { permChip && (permChip.textContent = 'Mic: denied'); } catch {}
    }
  }

  async function populateDevices(){
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devs = await navigator.mediaDevices.enumerateDevices();
      const aud = devs.filter(d => d.kind === 'audioinput');
      const cams = devs.filter(d => d.kind === 'videoinput');

      // Populate only the active settings mic selector; leave hidden legacy stub inert
      const micSelB = document.getElementById('settingsMicSel');
      if (micSelB){
        try {
          const cur = micSelB.value;
          micSelB.innerHTML = '';
          aud.forEach(d => {
            const o = document.createElement('option');
            o.value = d.deviceId; o.textContent = d.label || 'Microphone';
            micSelB.appendChild(o);
          });
          if (cur && Array.from(micSelB.options).some(o=>o.value===cur)) micSelB.value = cur;
        } catch {}
      }

      const camSelA = (typeof camDeviceSel !== 'undefined') ? camDeviceSel : null;
      const camSelB = document.getElementById('settingsCamSel');
      [camSelA, camSelB].filter(Boolean).forEach(sel => {
        try {
          const cur = sel.value;
          sel.innerHTML = '';
            cams.forEach(d => {
              const o = document.createElement('option');
              o.value = d.deviceId; o.textContent = d.label || 'Camera';
              sel.appendChild(o);
            });
          if (cur && Array.from(sel.options).some(o=>o.value===cur)) sel.value = cur;
        } catch {}
      });
    } catch (e) { /* ignore */ }
  }

  // TP: init-minimal
  // Minimal init to wire the meter pieces and help overlay (internal helper)
  async function __initMinimal(){
    // Help UI
    try { ensureHelpUI(); } catch {}

    // Query essentials
    permChip = document.getElementById('permChip');
    micBtn = document.getElementById('micBtn');
  // (Removed micDeviceSel rebinding; use getMicSel())
    refreshDevicesBtn = document.getElementById('refreshDevicesBtn');
    dbMeterTop = document.getElementById('dbMeterTop');
    const normalizeTopBtn = document.getElementById('normalizeTopBtn');

    // Build both meters
    buildDbBars(dbMeterTop);

  // TP: mic-wire
  // Wire mic + devices
    micBtn?.addEventListener('click', requestMic);
    refreshDevicesBtn?.addEventListener('click', populateDevices);
    try {
      await populateDevices();
      // Pre-select last device if present
      try {
        const last = localStorage.getItem(DEVICE_KEY);
        if (last) {
          const sel = document.getElementById('settingsMicSel');
          if (sel && Array.from(sel.options).some(o=>o.value===last)) {
            sel.value = last;
          }
          pendingAutoStart = true;
        }
      } catch {}
      if (pendingAutoStart) {
        // Attempt auto-start (user gesture may still be required in some browsers)
        requestMic();
      }
    } catch {}

  // TP: normalize-top-btn
  // Wire Top-bar Normalize button
    wireNormalizeButton(normalizeTopBtn);
  }

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
  if (window.__help?.ensureHelpUI) return window.__help.ensureHelpUI();
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
          <div><strong>~</strong></div><div>Debug HUD</div>
          <div><strong>?v=clear</strong></div><div>Force refresh</div>
        </div>

        <hr class="hr" />
        <div>
          <h4 style="margin:8px 0 6px">Official Teleprompter Tags</h4>
          <p style="margin:0 0 8px; color:#96a0aa">Speakers: <code>[s1] ... [/s1]</code>, <code>[s2] ... [/s2]</code>. Notes: <code>[note] ... [/note]</code>.</p>
          <!-- Tag guide will be augmented below if missing Normalize/Validate -->
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // If we reused an existing overlay, inject Tag Guide only if a Tags heading is NOT already present
  if (overlay && !overlay.querySelector('#normalizeBtn') && !overlay.querySelector('#guideNormalize')){
    const sheet = overlay.querySelector('.sheet') || overlay;
    const hasTagsHeading = !!sheet.querySelector('h4') && Array.from(sheet.querySelectorAll('h4')).some(h=>/Official\s+Teleprompter\s+Tags/i.test(h.textContent||''));
    if (!hasTagsHeading){
      const container = document.createElement('div');
      container.innerHTML = `
        <hr class="hr" />
        <div class="tp-tags-block">
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
  }

  // If missing, append the optional Advanced section (hidden by default)
  if (overlay && !overlay.querySelector('#helpAdvanced')){
    const sheet = overlay.querySelector('.sheet') || overlay;
    const adv = document.createElement('div');
    adv.innerHTML = `
<div id="helpAdvanced" class="hidden" style="margin-top:12px">
  <h4 style="margin:0 0 6px">Advanced</h4>
  <div class="shortcuts-grid">
    <div><strong>Alt-click title</strong></div><div>Toggle this section</div>
    <div><strong>~</strong></div><div>Debug HUD</div>
    <div><strong>?v=clear</strong></div><div>Force refresh</div>
  </div>
</div>`;
    sheet.appendChild(adv.firstElementChild);
  }

  // --- wire open/close ---
  const closeBtn = overlay.querySelector('#shortcutsClose');
  function openHelp(){ overlay.classList.remove('hidden'); helpBtn.setAttribute('aria-expanded','true'); }
  function closeHelp(){ overlay.classList.add('hidden'); helpBtn.setAttribute('aria-expanded','false'); }
  if (helpBtn) helpBtn.onclick = openHelp;
  if (closeBtn) closeBtn.onclick = closeHelp;
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) closeHelp(); });
  document.addEventListener('keydown', (e)=>{ if(e.key === '?' && (e.shiftKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); openHelp(); } });

  // --- Normalize button wiring ---
  wireNormalizeButton(overlay.querySelector('#normalizeBtn'));

  // --- Validate tags quickly ---
  const validateBtn = overlay.querySelector('#validateBtn');
  if (validateBtn) {
    const showValidation = (text) => {
      const sheet = overlay.querySelector('.sheet') || overlay;
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
              try { setStatus && setStatus('Validation copied ✓'); } catch {}
            } catch {
              // fallback if clipboard API blocked
              try {
                const sel = window.getSelection(); const r = document.createRange();
                r.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(r);
                document.execCommand('copy');
                try { setStatus && setStatus('Validation copied ✓'); } catch {}
              } catch (e) {
                try { setStatus && setStatus('Copy failed: ' + (e?.message||e)); } catch {}
              }
            }
          });
        }
      }
      const pre = panel.querySelector('#validateOut');
      pre.textContent = (String(text||'').trim()) || 'No issues found.';
      panel.classList.remove('hidden');
      // focus so Ctrl/Cmd+C works immediately
      pre.focus();
      // auto-select all for instant copy
      try {
        const sel = window.getSelection(); const r = document.createRange();
        r.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(r);
      } catch {}
    };

    validateBtn.onclick = () => {
      let msg;
      try { msg = window.validateStandardTags ? window.validateStandardTags(true) : 'Validator missing.'; }
      catch(e){ msg = 'Validation error: ' + (e?.message||e); }
      try { window.showValidation(msg); } catch { showCopyDialog(msg, 'Validator'); }
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

async function init() {
  // Run minimal wiring first (meters, help overlay, normalize button)
  try { __initMinimal(); } catch(e) { console.warn('Minimal init failed', e); }
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
      try { scrollByPx(FALLBACK_STEP_PX); } catch { viewer.scrollTop = Math.min(viewer.scrollTop + FALLBACK_STEP_PX, viewer.scrollHeight); }
      {
        const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        const ratio = max ? (viewer.scrollTop / max) : 0;
        sendToDisplay({ type:'scroll', top: viewer.scrollTop, ratio });
      }
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
      // dead-man watchdog after logical index adjustment
      try { deadmanWatchdog(currentIndex); } catch {}
    }
  }, 250);

  // After wiring open/close for the overlay:
  (window.__help?.ensureHelpUI || ensureHelpUI)();  // <- renames “Shortcuts” to “Help” and injects Normalize + Validate

  // Query all elements once
  shortcutsBtn     = document.getElementById('shortcutsBtn');
shortcutsOverlay = document.getElementById('shortcutsOverlay');
shortcutsClose   = document.getElementById('shortcutsClose');


  editor   = document.getElementById('editor');
  scriptEl = document.getElementById('script');
  viewer   = document.getElementById('viewer');
  legendEl = document.getElementById('legend');
  debugPosChip = document.getElementById('debugPosChip');

  permChip    = document.getElementById('permChip');
  displayChip = document.getElementById('displayChip');
  recChip     = document.getElementById('recChip');

  openDisplayBtn  = document.getElementById('openDisplayBtn');
  closeDisplayBtn = document.getElementById('closeDisplayBtn');
  presentBtn      = document.getElementById('presentBtn');

  micBtn          = document.getElementById('micBtn');
  recBtn          = document.getElementById('recBtn');
  // (Legacy hidden micDeviceSel retained but not bound; use getMicSel())
  refreshDevicesBtn = document.getElementById('refreshDevicesBtn');

  fontSizeInput   = document.getElementById('fontSize');
  lineHeightInput = document.getElementById('lineHeight');
  autoToggle      = document.getElementById('autoToggle');
  autoSpeed       = document.getElementById('autoSpeed');
  const catchUpBtn   = document.getElementById('catchUpBtn');
  const matchAggroSel = document.getElementById('matchAggro');
  const motionSmoothSel = document.getElementById('motionSmooth');

  timerEl     = document.getElementById('timer');
  resetBtn    = document.getElementById('resetBtn');
  loadSample  = document.getElementById('loadSample');
  clearText   = document.getElementById('clearText');

  downloadFileBtn  = document.getElementById('downloadFile');
  uploadFileBtn    = document.getElementById('uploadFileBtn');
  uploadFileInput  = document.getElementById('uploadFile');
  const scriptSelect = document.getElementById('scriptSelect');
  const saveAsBtn    = document.getElementById('saveAsBtn');
  const loadBtn      = document.getElementById('loadBtn');
  const deleteBtn    = document.getElementById('deleteBtn');
  const resetScriptBtn = document.getElementById('resetScriptBtn');

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
  // OBS toggle UI
  const enableObsChk = document.getElementById('enableObs');
  const obsStatus    = document.getElementById('obsStatus');
  const obsUrlInput  = document.getElementById('obsUrl');
  const obsPassInput = document.getElementById('obsPassword');
  const obsTestBtn   = document.getElementById('obsTestBtn');
  const settingsBtn  = document.getElementById('settingsBtn');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsClose = document.getElementById('settingsClose');
  const settingsBody  = document.getElementById('settingsBody');

  // Speakers toggle bits
  toggleSpeakersBtn = document.getElementById('toggleSpeakers');
  speakersBody      = document.getElementById('speakersBody');

  if (!openDisplayBtn) { setStatus('Boot: DOM not ready / IDs missing'); return; }
    // Initialize modular helpers now that viewer exists
    try {
      const shMod = await import('./scroll-helpers.js');
      const sh = shMod.createScrollerHelpers(() => viewer);
      __scrollHelpers = sh;
      clampScrollTop = sh.clampScrollTop;
      scrollByPx     = (px)=>{ sh.scrollByPx(px); try{ updateDebugPosChip(); }catch{} };
      scrollToY      = (y)=>{ sh.scrollToY(y); try{ updateDebugPosChip(); }catch{} };
      scrollToEl     = (el,off=0)=>{ sh.scrollToEl(el,off); try{ updateDebugPosChip(); }catch{} };
    } catch(e) { console.warn('scroll-helpers load failed', e); }

    try {
      const ioMod = await import('./io-anchor.js');
      __anchorObs = ioMod.createAnchorObserver(() => viewer, () => { try{ updateDebugPosChip(); }catch{} });
    } catch(e) { console.warn('io-anchor load failed', e); }
    try {
      const scMod = await import('./scroll-control.js');
      __scrollCtl = scMod.createScrollController(() => viewer);
    } catch (e) { console.warn('scroll-control load failed', e); }
  // …keep the rest of your init() as-is…

    // Wire UI
    openDisplayBtn.addEventListener('click', openDisplay);
    closeDisplayBtn.addEventListener('click', closeDisplay);
    presentBtn.addEventListener('click', openDisplay);
  // Mark that core buttons have direct listeners (used by delegation heuristic)
  try { openDisplayBtn.__listenerAttached = true; closeDisplayBtn.__listenerAttached = true; presentBtn.__listenerAttached = true; } catch {}
  window.__tpInitSuccess = true;

    fontSizeInput.addEventListener('input', applyTypography);
    lineHeightInput.addEventListener('input', applyTypography);

    autoToggle.addEventListener('click', () => {
      if (autoTimer) stopAutoScroll(); else startAutoScroll();
    });

    // OBS enable toggle wiring (after recorder module possibly loaded)
    if (enableObsChk) {
      const applyFromSettings = () => {
        try {
          if (!__recorder?.getSettings) return;
            const s = __recorder.getSettings();
            const has = s.selected.includes('obs');
            enableObsChk.checked = has;
            if (obsStatus) obsStatus.textContent = has ? 'OBS: enabled' : 'OBS: disabled';
            // Prefill URL/password
            try {
              if (obsUrlInput && s.configs?.obs?.url) obsUrlInput.value = s.configs.obs.url;
              if (obsPassInput && typeof s.configs?.obs?.password === 'string') obsPassInput.value = s.configs.obs.password;
            } catch {}
        } catch {}
      };
      applyFromSettings();
      enableObsChk.addEventListener('change', async ()=>{
        try {
          if (!__recorder?.getSettings || !__recorder?.setSettings) return;
          const s = __recorder.getSettings();
          let sel = s.selected.filter(id => id !== 'obs');
          if (enableObsChk.checked) sel.push('obs');
          const cfgs = { ...(s.configs||{}) };
          if (!cfgs.obs) cfgs.obs = { url: obsUrlInput?.value || 'ws://127.0.0.1:4455', password: obsPassInput?.value || '' };
          __recorder.setSettings({ selected: sel, configs: cfgs });
          if (obsStatus) obsStatus.textContent = enableObsChk.checked ? 'OBS: enabled' : 'OBS: disabled';
          // Optionally check availability quickly
          if (enableObsChk.checked && __recorder.get('obs')?.isAvailable) {
            try {
              const ok = await __recorder.get('obs').isAvailable();
              if (obsStatus) obsStatus.textContent = ok ? 'OBS: ready' : 'OBS: offline';
            } catch { if (obsStatus) obsStatus.textContent = 'OBS: offline'; }
          }
        } catch {}
      });
    }

    // Settings overlay wiring
    if (settingsBtn && settingsOverlay && settingsClose && settingsBody){
      const openSettings = () => {
        try { buildSettingsContent(); } catch(e){}
        settingsOverlay.classList.remove('hidden');
        settingsBtn.setAttribute('aria-expanded','true');
      };
      // Prebuild asynchronously after main init so first open isn't empty if user opens quickly
      setTimeout(()=>{ try { buildSettingsContent(); } catch{} }, 0);
      const closeSettings = () => { settingsOverlay.classList.add('hidden'); settingsBtn.setAttribute('aria-expanded','false'); };
      settingsBtn.addEventListener('click', openSettings);
      settingsClose.addEventListener('click', closeSettings);
      settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeSettings(); });
      window.addEventListener('keydown', e => { if (e.key === 'Escape' && !settingsOverlay.classList.contains('hidden')) closeSettings(); });
    }

    // (Removed duplicate simple buildSettingsContent; using tabbed version defined earlier.)

    function wireSettingsDynamic(){
      // Mic
      const reqMicBtn = document.getElementById('settingsReqMic');
      const micSel    = document.getElementById('settingsMicSel');
      if (micSel){
        micSel.addEventListener('change', ()=>{
          try { localStorage.setItem(DEVICE_KEY, micSel.value); } catch {};
          // Mirror value into legacy micDeviceSel element if it still exists
          try { if (typeof micDeviceSel !== 'undefined' && micDeviceSel && micDeviceSel !== micSel) micDeviceSel.value = micSel.value; } catch {}
        });
      }
  reqMicBtn?.addEventListener('click', async ()=> { await micBtn?.click(); _toast('Mic requested',{type:'ok'}); });
      // Camera
      const startCamS = document.getElementById('settingsStartCam');
      const stopCamS  = document.getElementById('settingsStopCam');
      const camSelS   = document.getElementById('settingsCamSel');
      const camSizeS  = document.getElementById('settingsCamSize');
      const camOpacityS = document.getElementById('settingsCamOpacity');
      const camMirrorS  = document.getElementById('settingsCamMirror');
      if (camSelS && camDeviceSel){
        // Mirror camera selection both ways only on change (device list is populated centrally)
        camSelS.addEventListener('change', ()=>{ camDeviceSel.value = camSelS.value; });
      }
  startCamS?.addEventListener('click', ()=> { startCamBtn?.click(); _toast('Camera starting…'); });
  stopCamS?.addEventListener('click', ()=> { stopCamBtn?.click(); _toast('Camera stopped',{type:'ok'}); });
      camSizeS?.addEventListener('change', ()=>{ if (camSize) { camSize.value = camSizeS.value; camSize.dispatchEvent(new Event('input',{bubbles:true})); }});
      camOpacityS?.addEventListener('change', ()=>{ if (camOpacity){ camOpacity.value = camOpacityS.value; camOpacity.dispatchEvent(new Event('input',{bubbles:true})); }});
      camMirrorS?.addEventListener('change', ()=>{ if (camMirror){ camMirror.checked = camMirrorS.checked; camMirror.dispatchEvent(new Event('change',{bubbles:true})); }});
      // Speakers
      const showSpk = document.getElementById('settingsShowSpeakers');
      showSpk?.addEventListener('click', ()=>{ toggleSpeakersBtn?.click(); buildSettingsContent(); });
      document.getElementById('settingsNormalize')?.addEventListener('click', ()=> normalizeTopBtn?.click());
      // Recording / OBS
      const obsEnable = document.getElementById('settingsEnableObs');
      const obsUrlS = document.getElementById('settingsObsUrl');
      const obsPassS = document.getElementById('settingsObsPass');
      const obsTestS = document.getElementById('settingsObsTest');
      obsEnable?.addEventListener('change', ()=>{ if (enableObsChk){ enableObsChk.checked = obsEnable.checked; enableObsChk.dispatchEvent(new Event('change',{bubbles:true})); } });
      obsUrlS?.addEventListener('change', ()=>{ if (obsUrlInput){ obsUrlInput.value = obsUrlS.value; obsUrlInput.dispatchEvent(new Event('change',{bubbles:true})); }});
      obsPassS?.addEventListener('change', ()=>{ if (obsPassInput){ obsPassInput.value = obsPassS.value; obsPassInput.dispatchEvent(new Event('change',{bubbles:true})); }});
  obsTestS?.addEventListener('click', async ()=> { obsTestBtn?.click(); setTimeout(()=>{ _toast(obsStatus?.textContent||'OBS test', { type: (obsStatus?.textContent||'').includes('ok')?'ok':'error' }); }, 600); });
    }

    // OBS URL/password change persistence (debounced lightweight)
    const saveObsConfig = () => {
      try {
        if (!__recorder?.getSettings || !__recorder?.setSettings) return;
        const s = __recorder.getSettings();
        const cfgs = { ...(s.configs||{}) };
        const prev = cfgs.obs || {};
        cfgs.obs = { ...prev, url: obsUrlInput?.value || prev.url || 'ws://127.0.0.1:4455', password: obsPassInput?.value || prev.password || '' };
        __recorder.setSettings({ configs: cfgs });
        if (obsStatus && enableObsChk?.checked) obsStatus.textContent = 'OBS: updated';
      } catch {}
    };
    obsUrlInput?.addEventListener('change', saveObsConfig);
    obsPassInput?.addEventListener('change', saveObsConfig);

    // Test button
    obsTestBtn?.addEventListener('click', async ()=>{
      if (!__recorder?.get || !__recorder.get('obs')) { if (obsStatus) obsStatus.textContent='OBS: adapter missing'; return; }
      if (obsStatus) obsStatus.textContent='OBS: testing…';
      try {
        saveObsConfig();
        const ok = await __recorder.get('obs').test();
        if (obsStatus) obsStatus.textContent = 'OBS: ok';
      } catch (e){
        if (obsStatus) obsStatus.textContent = 'OBS: failed';
        try {
          const errMsg = __recorder.get('obs').getLastError?.() || e?.message || String(e);
          obsStatus.title = errMsg;
        } catch {}
      }
    });

    resetBtn.addEventListener('click', resetTimer);

    loadSample.addEventListener('click', () => {
      editor.value = 'Welcome to [b]Teleprompter Pro[/b].\n\nUse [s1]roles[/s1], [note]notes[/note], and colors like [color=#ff0]this[/color].';
      renderScript(editor.value);
    });
    clearText.addEventListener('click', () => { editor.value=''; renderScript(''); });

    // Top-bar Normalize button (near Load sample)
    const normalizeTopBtn = document.getElementById('normalizeTopBtn');
    if (normalizeTopBtn && !normalizeTopBtn.dataset.wired){
      normalizeTopBtn.dataset.wired = '1';
      normalizeTopBtn.addEventListener('click', () => {
        if (typeof window.normalizeToStandard === 'function') {
          try { window.normalizeToStandard(); } catch (e) { alert('Normalize error: ' + e.message); }
          return;
        }
        // Shared fallback
        fallbackNormalize();
      });
    }

    // Populate dropdown from browser storage (single draft for now)
    function refreshScriptSelect(){
      if (!scriptSelect) return;
      const opts = [];
      try { if (localStorage.getItem(LS_KEY)) opts.push({ key: LS_KEY, name: 'Draft (browser)' }); } catch {}
      scriptSelect.innerHTML = '';
      if (opts.length === 0){
        const o = document.createElement('option'); o.value=''; o.textContent='— No saved draft —'; scriptSelect.appendChild(o);
      } else {
        for (const it of opts){ const o=document.createElement('option'); o.value=it.key; o.textContent=it.name; scriptSelect.appendChild(o); }
      }
    }
    refreshScriptSelect();

    // Save As -> writes to browser draft and refreshes dropdown
    saveAsBtn?.addEventListener('click', () => { saveToLocal(); refreshScriptSelect(); });
    // Load button -> loads the draft from LS
    loadBtn?.addEventListener('click', () => { loadFromLocal(); });
    // Delete -> clears the draft from LS
    deleteBtn?.addEventListener('click', () => { try{ localStorage.removeItem(LS_KEY); }catch{} refreshScriptSelect(); setStatus('Deleted browser draft.'); });
    // Download current script in chosen format
    const fmtSel = document.getElementById('downloadFormat');
    downloadFileBtn?.addEventListener('click', () => {
      const fmt = (fmtSel?.value || 'txt');
      const name = `script.${fmt}`;
      let mime = 'text/plain';
      if (fmt === 'md') mime = 'text/markdown';
      else if (fmt === 'rtf') mime = 'application/rtf';
      else if (fmt === 'text') mime = 'text/plain';
      // For future docx support, we will generate a blob via Mammoth or a docx builder.
      downloadAsFile(name, editor.value, mime);
    });

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

    // Reset Script -> clear draft, clear editor, reset view and sync
    resetScriptBtn?.addEventListener('click', resetScript);

    // Catch Up button: snap immediately to current line at 40% viewport height
    if (catchUpBtn && !catchUpBtn.dataset.wired){
      catchUpBtn.dataset.wired = '1';
      catchUpBtn.addEventListener('click', () => {
        try {
          // Stop auto-catchup momentarily to avoid contention
          __scrollCtl?.stopAutoCatchup?.();
          const sc = getScroller();
          const offset = Math.round(sc.clientHeight * 0.40);
          // Prefer currentEl, else the paragraph for currentIndex, else most-visible
          const vis = __anchorObs?.mostVisibleEl?.() || null;
          let el = currentEl || (paraIndex.find(p=>currentIndex>=p.start && currentIndex<=p.end)?.el) || vis || null;
          if (!el && Array.isArray(lineEls)) el = lineEls[0] || null;
          if (el) {
            scrollToEl(el, offset);
            const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
            const ratio = max ? (sc.scrollTop / max) : 0;
            sendToDisplay({ type:'scroll', top: sc.scrollTop, ratio });
          }
        } catch {}
      });
    }


    // Mic and devices
    micBtn?.addEventListener('click', requestMic);
    refreshDevicesBtn?.addEventListener('click', populateDevices);

    // Recognition on/off (placeholder toggle)
    recBtn?.addEventListener('click', toggleRec);

    // Speech availability hint: disable if unsupported
    try {
      const SRAvail = (window.SpeechRecognition || window.webkitSpeechRecognition);
      if (!SRAvail) {
        if (recBtn) { recBtn.disabled = true; recBtn.title = 'Speech recognition not supported in this browser'; }
        if (recChip) { recChip.textContent = 'Speech: unsupported'; }
      }
    } catch {}

    // dB meter power save: suspend AudioContext when tab hidden, resume on return
    document.addEventListener('visibilitychange', () => {
      try {
        if (!audioCtx) return;
        if (document.hidden) {
          if (audioCtx.state === 'running') audioCtx.suspend();
        } else {
          if (audioCtx.state === 'suspended') audioCtx.resume();
        }
      } catch {}
    });
    // Extra safety: some browsers fire blur/focus without visibilitychange (e.g., alt-tab quickly)
    window.addEventListener('focus', () => { try { if (audioCtx?.state === 'suspended') audioCtx.resume(); } catch {} });
    window.addEventListener('blur',  () => { try { if (audioCtx?.state === 'running' && document.hidden) audioCtx.suspend(); } catch {} });

    // Tiny wink: Shift+click Rec to hint at future calibration
    if (recBtn){
      recBtn.addEventListener('click', (e)=>{
        if (e.shiftKey){
          try { setStatus && setStatus('Calibration read: listen for pace… (coming soon)'); } catch {}
          // future: sample speech rate and tune MATCH_WINDOW_AHEAD, thresholds, etc.
        }
      }, { capture:true }); // capture so it runs before the normal handler
    }

    // Camera
    startCamBtn?.addEventListener('click', startCamera);
    stopCamBtn?.addEventListener('click', stopCamera);
    camDeviceSel?.addEventListener('change', () => { if (camVideo?.srcObject) startCamera(); });
    camSize?.addEventListener('input', applyCamSizing);
    camOpacity?.addEventListener('input', applyCamOpacity);
    camMirror?.addEventListener('change', applyCamMirror);
    camPiP?.addEventListener('click', togglePiP);

  // TP: display-handshake
  // Display handshake: accept either a string ping or a typed object
    window.addEventListener('message', (e) => {
      if (!displayWin || e.source !== displayWin) return;
      if (e.data === 'DISPLAY_READY' || e.data?.type === 'display-ready') {
        displayReady = true;
        // Stop any outstanding hello ping loop
        if (displayHelloTimer) { clearInterval(displayHelloTimer); displayHelloTimer = null; }
        displayChip.textContent = 'Display: ready';
        // push initial state
        sendToDisplay({ type:'render', html: scriptEl.innerHTML, fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });
        // also push explicit typography in case display needs to apply restored prefs
        sendToDisplay({ type:'typography', fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });
        {
          const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
          const ratio = max ? (viewer.scrollTop / max) : 0;
          sendToDisplay({ type:'scroll', top: viewer.scrollTop, ratio });
        }
        closeDisplayBtn.disabled = false;
      }
    });

  // (Removed stray buildDbBars() call without target; meter already built earlier.)

    // Restore UI prefs from localStorage (if any)
      const FONT_KEY = 'tp_font_size_v1';
      const LINE_KEY = 'tp_line_height_v1';
      try {
        const savedFont = localStorage.getItem(FONT_KEY);
        if (savedFont && fontSizeInput) fontSizeInput.value = savedFont;
      } catch {}
      try {
        const savedLH = localStorage.getItem(LINE_KEY);
        if (savedLH && lineHeightInput) lineHeightInput.value = savedLH;
      } catch {}
    const AGGRO_KEY = 'tp_match_aggro_v1';
  // Dev tuning persistence keys
  const TUNE_KEY = 'tp_match_tuning_v1';
  const TUNE_ENABLE_KEY = 'tp_match_tuning_enabled_v1';
  let _tunePanelEl = null;
  let _tuneInputs = {};
  const DEV_MODE = /[?&]dev=1/.test(location.search) || location.hash.includes('dev') || (()=>{ try { return localStorage.getItem('tp_dev_mode')==='1'; } catch { return false; } })();
    try {
      const savedAggro = localStorage.getItem(AGGRO_KEY);
      if (savedAggro && matchAggroSel) matchAggroSel.value = savedAggro;
    } catch {}
    const SMOOTH_KEY = 'tp_motion_smooth_v1';
    try {
      const savedSmooth = localStorage.getItem(SMOOTH_KEY);
      if (savedSmooth && motionSmoothSel) motionSmoothSel.value = savedSmooth;
    } catch {}

  // TP: initial-render
  // Initial render
    renderScript(editor.value || '');
    // Apply aggressiveness mapping now and on change
  // TP: matcher-tunables
  function applyAggro(){
      const v = (matchAggroSel?.value || '2');
      if (v === '1'){
        // Conservative: require higher similarity, smaller search windows, stricter forward jumping
        SIM_THRESHOLD = 0.62;
        MATCH_WINDOW_AHEAD = 140;
        MATCH_WINDOW_BACK  = 20;
        STRICT_FORWARD_SIM = 0.82;
        MAX_JUMP_AHEAD_WORDS = 8;
      }
      else if (v === '4'){
        // Aggressive live-read: fastest catch for rapid speakers; very permissive similarity, broad forward window
        // Intent: minimize lag when reader sprints ahead; accept earlier fuzzy alignment
        SIM_THRESHOLD = 0.46;          // slightly below preset 3 to allow earlier partial matches
        MATCH_WINDOW_AHEAD = 240;      // wide look-ahead similar to '3'
        MATCH_WINDOW_BACK  = 40;       // allow some recovery if we overshoot
        STRICT_FORWARD_SIM = 0.62;     // relax strict forward gate further
        MAX_JUMP_AHEAD_WORDS = 22;     // permit larger forward corrections in one step
      }
      else if (v === '3'){
        // Aggressive: lower similarity bar, broader windows, allow larger forward nudges
        SIM_THRESHOLD = 0.48;
        MATCH_WINDOW_AHEAD = 240;
        MATCH_WINDOW_BACK  = 40;
        STRICT_FORWARD_SIM = 0.65;
        MAX_JUMP_AHEAD_WORDS = 18;
      }
      else {
        // Normal/balanced defaults
        SIM_THRESHOLD = 0.55;
        MATCH_WINDOW_AHEAD = 200;
        MATCH_WINDOW_BACK  = 30;
        STRICT_FORWARD_SIM = 0.72;
        MAX_JUMP_AHEAD_WORDS = 12;
      }
      // After applying preset, optionally override with custom tuning profile if enabled
      try {
        if (localStorage.getItem(TUNE_ENABLE_KEY)==='1') {
          const raw = localStorage.getItem(TUNE_KEY);
          if (raw) {
            const cfg = JSON.parse(raw);
            if (cfg && typeof cfg==='object') {
              const n = (x)=> typeof x === 'number' && !isNaN(x);
              if (n(cfg.SIM_THRESHOLD)) SIM_THRESHOLD = cfg.SIM_THRESHOLD;
              if (n(cfg.MATCH_WINDOW_AHEAD)) MATCH_WINDOW_AHEAD = cfg.MATCH_WINDOW_AHEAD;
              if (n(cfg.MATCH_WINDOW_BACK)) MATCH_WINDOW_BACK = cfg.MATCH_WINDOW_BACK;
              if (n(cfg.STRICT_FORWARD_SIM)) STRICT_FORWARD_SIM = cfg.STRICT_FORWARD_SIM;
              if (n(cfg.MAX_JUMP_AHEAD_WORDS)) MAX_JUMP_AHEAD_WORDS = cfg.MAX_JUMP_AHEAD_WORDS;
            }
          }
        }
      } catch {}
      // Reflect live constants in panel if open
      if (_tunePanelEl) populateTuningInputs();
    }
    applyAggro();
    matchAggroSel?.addEventListener('change', (e)=>{
      applyAggro();
      try { localStorage.setItem(AGGRO_KEY, matchAggroSel.value || '2'); } catch {}
    });

    // --- Dev-only tuning panel -------------------------------------------------
    function populateTuningInputs(){
      if (!_tuneInputs) return;
      const setV = (k,v)=>{ if(_tuneInputs[k]) _tuneInputs[k].value = String(v); };
      setV('SIM_THRESHOLD', SIM_THRESHOLD);
      setV('MATCH_WINDOW_AHEAD', MATCH_WINDOW_AHEAD);
      setV('MATCH_WINDOW_BACK', MATCH_WINDOW_BACK);
      setV('STRICT_FORWARD_SIM', STRICT_FORWARD_SIM);
      setV('MAX_JUMP_AHEAD_WORDS', MAX_JUMP_AHEAD_WORDS);
    }
    function applyFromInputs(){
      const getNum = (k)=>{ const v = parseFloat(_tuneInputs[k]?.value); return isFinite(v)?v:undefined; };
      const newVals = {
        SIM_THRESHOLD: getNum('SIM_THRESHOLD'),
        MATCH_WINDOW_AHEAD: getNum('MATCH_WINDOW_AHEAD'),
        MATCH_WINDOW_BACK: getNum('MATCH_WINDOW_BACK'),
        STRICT_FORWARD_SIM: getNum('STRICT_FORWARD_SIM'),
        MAX_JUMP_AHEAD_WORDS: getNum('MAX_JUMP_AHEAD_WORDS')
      };
      if (typeof newVals.SIM_THRESHOLD==='number') SIM_THRESHOLD = newVals.SIM_THRESHOLD;
      if (typeof newVals.MATCH_WINDOW_AHEAD==='number') MATCH_WINDOW_AHEAD = newVals.MATCH_WINDOW_AHEAD;
      if (typeof newVals.MATCH_WINDOW_BACK==='number') MATCH_WINDOW_BACK = newVals.MATCH_WINDOW_BACK;
      if (typeof newVals.STRICT_FORWARD_SIM==='number') STRICT_FORWARD_SIM = newVals.STRICT_FORWARD_SIM;
      if (typeof newVals.MAX_JUMP_AHEAD_WORDS==='number') MAX_JUMP_AHEAD_WORDS = newVals.MAX_JUMP_AHEAD_WORDS;
    }
    function saveTuningProfile(){
      try {
        const payload = {
          SIM_THRESHOLD, MATCH_WINDOW_AHEAD, MATCH_WINDOW_BACK, STRICT_FORWARD_SIM, MAX_JUMP_AHEAD_WORDS,
          savedAt: Date.now()
        };
        localStorage.setItem(TUNE_KEY, JSON.stringify(payload));
        const stamp = _tunePanelEl?.querySelector('[data-tune-status]');
        if (stamp) { stamp.textContent = 'Saved'; setTimeout(()=>{ if(stamp.textContent==='Saved') stamp.textContent=''; }, 1500); }
      } catch {}
    }
    function loadTuningProfile(){
      try {
        const raw = localStorage.getItem(TUNE_KEY);
        if (!raw) return false;
        const cfg = JSON.parse(raw);
        if (cfg && typeof cfg==='object') {
          const n=(x)=> typeof x==='number' && !isNaN(x);
          if (n(cfg.SIM_THRESHOLD)) SIM_THRESHOLD = cfg.SIM_THRESHOLD;
          if (n(cfg.MATCH_WINDOW_AHEAD)) MATCH_WINDOW_AHEAD = cfg.MATCH_WINDOW_AHEAD;
          if (n(cfg.MATCH_WINDOW_BACK)) MATCH_WINDOW_BACK = cfg.MATCH_WINDOW_BACK;
          if (n(cfg.STRICT_FORWARD_SIM)) STRICT_FORWARD_SIM = cfg.STRICT_FORWARD_SIM;
          if (n(cfg.MAX_JUMP_AHEAD_WORDS)) MAX_JUMP_AHEAD_WORDS = cfg.MAX_JUMP_AHEAD_WORDS;
          return true;
        }
      } catch {}
      return false;
    }
    function toggleCustomEnabled(on){
      try { localStorage.setItem(TUNE_ENABLE_KEY, on?'1':'0'); } catch {}
      if (on) {
        if (!loadTuningProfile()) saveTuningProfile();
      } else {
        // Reapply preset to revert
        applyAggro();
      }
    }
    function ensureTuningPanel(){
      if (!DEV_MODE) return;
      if (_tunePanelEl) { _tunePanelEl.style.display='block'; populateTuningInputs(); return; }
      const div = document.createElement('div');
      div.id = 'tuningPanel';
      div.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:9999;background:#111c;border:1px solid #444;padding:8px 10px;font:12px system-ui;color:#eee;box-shadow:0 2px 8px #0009;backdrop-filter:blur(4px);max-width:240px;line-height:1.3;border-radius:6px;';
      div.innerHTML = `\n        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">\n          <strong style="font-size:12px;">Matcher Tuning</strong>\n          <button data-close style="background:none;border:0;color:#ccc;cursor:pointer;font-size:14px;">✕</button>\n        </div>\n        <div style="display:grid;grid-template-columns:1fr 60px;gap:4px;">\n          <label style="display:contents;">SIM<th style="display:none"></th><input data-k="SIM_THRESHOLD" type="number" step="0.01" min="0" max="1"></label>\n          <label style="display:contents;">Win+<input data-k="MATCH_WINDOW_AHEAD" type="number" step="10" min="10" max="1000"></label>\n          <label style="display:contents;">Win-<input data-k="MATCH_WINDOW_BACK" type="number" step="1" min="0" max="200"></label>\n          <label style="display:contents;">Strict<input data-k="STRICT_FORWARD_SIM" type="number" step="0.01" min="0" max="1"></label>\n          <label style="display:contents;">Jump<input data-k="MAX_JUMP_AHEAD_WORDS" type="number" step="1" min="1" max="120"></label>\n        </div>\n        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">\n          <button data-apply style="flex:1 1 auto;">Apply</button>\n          <button data-save style="flex:1 1 auto;">Save</button>\n        </div>\n        <label style="display:flex;align-items:center;gap:4px;margin-top:4px;">\n          <input data-enable type="checkbox"> Override presets\n        </label>\n        <div data-tune-status style="font-size:11px;color:#8ec;margin-top:2px;height:14px;"></div>\n        <div style="font-size:10px;color:#999;margin-top:4px;">Ctrl+Alt+T to re-open</div>\n      `;
      document.body.appendChild(div);
      _tunePanelEl = div;
      _tuneInputs = {};
      [...div.querySelectorAll('input[data-k]')].forEach(inp=>{ _tuneInputs[inp.getAttribute('data-k')] = inp; });
      populateTuningInputs();
      // Load existing saved (but don't auto-enable)
      try {
        const raw = localStorage.getItem(TUNE_KEY);
        if (raw) {
          const cfg = JSON.parse(raw);
          if (cfg && typeof cfg==='object') {
            for (const k of Object.keys(_tuneInputs)) if (k in cfg && typeof cfg[k]==='number') _tuneInputs[k].value = cfg[k];
          }
        }
      } catch {}
      // Reflect enabled
      try { const en = localStorage.getItem(TUNE_ENABLE_KEY)==='1'; const cb = div.querySelector('input[data-enable]'); if (cb) cb.checked = en; } catch {}
      div.addEventListener('click', (e)=>{
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        if (t.matches('[data-close]')) { div.style.display='none'; }
        else if (t.matches('[data-apply]')) { applyFromInputs(); populateTuningInputs(); }
        else if (t.matches('[data-save]')) { applyFromInputs(); saveTuningProfile(); }
      });
      const enableCb = div.querySelector('input[data-enable]');
      if (enableCb) enableCb.addEventListener('change', ()=>{ toggleCustomEnabled(enableCb.checked); if (enableCb.checked){ applyFromInputs(); saveTuningProfile(); } });
      // Live update on input (without saving)
      div.querySelectorAll('input[data-k]').forEach(inp=>{
        inp.addEventListener('input', ()=>{ applyFromInputs(); });
      });
    }
    // Keybinding to toggle panel (dev mode only)
    window.addEventListener('keydown', (e)=>{
      if (e.ctrlKey && e.altKey && e.key.toLowerCase()==='t') { if (DEV_MODE){ ensureTuningPanel(); e.preventDefault(); } }
    });
    // Auto-create if dev hash present
    if (DEV_MODE && (location.hash.includes('devtune') || location.search.includes('devtune=1'))) setTimeout(()=> ensureTuningPanel(), 300);

    // If override enabled on load, ensure it applies AFTER initial preset
    setTimeout(()=>{
      try {
        if (localStorage.getItem(TUNE_ENABLE_KEY)==='1') {
          // Re-run applyAggro to force preset then override
          applyAggro();
        }
      } catch {}
    }, 50);

    // Apply motion smoothness mapping now and on change
  // TP: motion-smoothness
  function applySmooth(){
      const v = (motionSmoothSel?.value || 'balanced');
      // adjust soft scroll tunables used in advanceByTranscript and scrollToCurrentIndex
      if (v === 'stable'){
        window.__TP_SCROLL = { DEAD: 22, THROTTLE: 280, FWD: 80, BACK: 30, EASE_STEP: 60, EASE_MIN: 12 };
      } else if (v === 'responsive'){
        // less jitter: higher deadband/throttle, smaller back steps
        window.__TP_SCROLL = { DEAD: 20, THROTTLE: 240, FWD: 110, BACK: 50, EASE_STEP: 96, EASE_MIN: 6 };
      } else {
        // balanced
        window.__TP_SCROLL = { DEAD: 22, THROTTLE: 260, FWD: 96, BACK: 40, EASE_STEP: 80, EASE_MIN: 10 };
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
    // Fun extras (Konami theme, meter party, advanced tools, :roar) — call once at the very end
  try { (window.__eggs?.installEasterEggs || installEasterEggs)(); } catch {}
    // CK watermark egg (toggleable)
  try { (window.__eggs?.installCKEgg || installCKEgg)(); } catch {}

    // Run tiny self-checks to catch regressions fast
    try { setTimeout(runSelfChecks, 0); } catch {}

    // Keep bottom padding responsive to viewport changes
    try { window.addEventListener('resize', applyBottomPad, { passive: true }); } catch {}
    // Update debug chip on scroll
    try { viewer?.addEventListener('scroll', () => { updateDebugPosChip(); }, { passive:true }); } catch {}
    // Initial debug chip paint
    try { updateDebugPosChip(); } catch {}
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
    applyRoleCssVars();
    broadcastSpeakerColors();
    broadcastSpeakerNames();
  }
  function onRoleChange(){
    ROLES.s1.name = nameS1?.value || ROLES.s1.name; ROLES.s1.color = colorS1?.value || ROLES.s1.color;
    ROLES.s2.name = nameS2?.value || ROLES.s2.name; ROLES.s2.color = colorS2?.value || ROLES.s2.color;
    ROLES.g1.name = nameG1?.value || ROLES.g1.name; ROLES.g1.color = colorG1?.value || ROLES.g1.color;
    ROLES.g2.name = nameG2?.value || ROLES.g2.name; ROLES.g2.color = colorG2?.value || ROLES.g2.color;
    saveRoles(ROLES);
    updateLegend();
    renderScript(editor.value);
    applyRoleCssVars();
    broadcastSpeakerColors();
    broadcastSpeakerNames();
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

// TP: scroll-current-index
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
  {
    const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
    const ratio = max ? (viewer.scrollTop / max) : 0;
    sendToDisplay({ type: 'scroll', top: viewer.scrollTop, ratio });
  }
}

// Ensure init runs (was previously implicit). Guard against double-run.
try {
  if (!window.__tpInitScheduled) {
    window.__tpInitScheduled = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { try { init(); } catch(e){ console.error('init failed', e); } });
    } else {
      Promise.resolve().then(()=>{ try { init(); } catch(e){ console.error('init failed', e); } });
    }
  }
} catch {}

// Conditionally install last‑resort delegation ONLY if core buttons appear unwired after init grace period.
setTimeout(() => {
  try {
    if (window.__tpInitSuccess) return; // direct wiring succeeded, skip fallback
    // Heuristic: if openDisplayBtn exists and has no inline onclick AND we haven't flagged init success
    const btn = document.getElementById('openDisplayBtn');
    if (!btn) return; // no need
    const already = btn.__listenerAttached; // we can mark in init later if desired
    if (already) return; // direct wiring succeeded
    // Light probe: synthesize a custom event property after adding direct listener (future refactor)
    let delegated = false;
    const fallback = (e) => {
      const id = e.target?.id;
      try {
        if (id === 'openDisplayBtn' && typeof openDisplay === 'function') { openDisplay(); }
        else if (id === 'closeDisplayBtn' && typeof closeDisplay === 'function') { closeDisplay(); }
        else if (id === 'presentBtn' && typeof openDisplay === 'function') { openDisplay(); }
        else if (id === 'micBtn') { requestMic(); }
      } catch(err){ console.warn('Delegated handler error', err); }
    };
    document.addEventListener('click', fallback, { capture:true });
    delegated = true;
    if (delegated) console.warn('[TP-Pro] Fallback delegation installed (direct button wiring not detected).');
  } catch {}
}, 800);

// Gentle PID-like catch-up controller
function tryStartCatchup(){
  if (!__scrollCtl?.startAutoCatchup || !viewer) return;
  // If auto-scroll is running, skip catch-up to avoid conflicts
  if (autoTimer) return;
  const markerTop = () => (viewer?.clientHeight || 0) * (typeof MARKER_PCT === 'number' ? MARKER_PCT : 0.36);
  const getTargetY = () => markerTop();
  const getAnchorY = () => {
    try {
      // Prefer most-visible paragraph from IntersectionObserver
  const vis = __anchorObs?.mostVisibleEl?.() || null;
      if (vis) {
        const rect = vis.getBoundingClientRect();
        const vRect = viewer.getBoundingClientRect();
        return rect.top - vRect.top; // Y relative to viewer
      }
      // Otherwise, find active paragraph (as set in scrollToCurrentIndex)
      const activeP = (scriptEl || viewer)?.querySelector('p.active') || null;
      if (activeP) {
        const rect = activeP.getBoundingClientRect();
        const vRect = viewer.getBoundingClientRect();
        return rect.top - vRect.top; // Y relative to viewer
      }
      // Fallback: approximate using currentIndex paragraph element if available
      const p = (paraIndex || []).find(p => currentIndex >= p.start && currentIndex <= p.end) || (paraIndex||[])[0];
      if (p?.el) {
        const rect = p.el.getBoundingClientRect();
        const vRect = viewer.getBoundingClientRect();
        return rect.top - vRect.top;
      }
    } catch {}
    return markerTop();
  };
  const scrollBy = (dy) => {
    try {
      viewer.scrollTop = Math.max(0, Math.min(viewer.scrollTop + dy, viewer.scrollHeight));
      const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const ratio = max ? (viewer.scrollTop / max) : 0;
      sendToDisplay({ type:'scroll', top: viewer.scrollTop, ratio });
    } catch {}
  };
  try { __scrollCtl.stopAutoCatchup(); } catch {}
  __scrollCtl.startAutoCatchup(getAnchorY, getTargetY, scrollBy);
}

// Heuristic gate: only run catch-up if the anchor (current line) sits low in the viewport
let _lowStartTs = 0;
function maybeCatchupByAnchor(anchorY, viewportH){
  try {
    if (!__scrollCtl?.startAutoCatchup || !viewer) return;
    // Don't start while auto-scroll is active
    if (autoTimer) { _lowStartTs = 0; try{ __scrollCtl.stopAutoCatchup(); }catch{}; return; }
    const h = Math.max(1, Number(viewportH)||viewer.clientHeight||1);
    const ratio = anchorY / h; // 0=top, 1=bottom
    if (ratio > 0.65){
      if (!_lowStartTs) _lowStartTs = performance.now();
      if (performance.now() - _lowStartTs > 500){
        // Start (or keep) the catch-up loop with our standard closures
        tryStartCatchup();
      }
    } else {
      _lowStartTs = 0;
      // Save CPU/jitter when we don't need it
      try { __scrollCtl.stopAutoCatchup(); } catch {}
    }
  } catch {}
}


// Matcher constants and helpers (single source of truth)
let _lastMatchAt = 0;
let _lastCorrectionAt = 0;
let _lastAdvanceAt = performance.now(); // stall-recovery timestamp
// Throttle interim matches; how many recent spoken tokens to consider
const MATCH_INTERVAL_MS = 120;
const SPOKEN_N = 8;
// Window relative to currentIndex to search
  // Tunables (let so we can adjust via the “Match aggressiveness” select)
  let MATCH_WINDOW_BACK  = 30;   // how far back we search around the current index
  let MATCH_WINDOW_AHEAD = 200;  // how far forward we search
  let SIM_THRESHOLD      = 0.55; // minimum similarity to accept a match (0..1)
// Similarity thresholds and motion clamps
let STRICT_FORWARD_SIM = 0.72;   // extra gate when skipping forward a lot
let MAX_JUMP_AHEAD_WORDS = 12;   // max words to bump when pushing forward
// Scroll correction tuning
// TP: marker-percent — forward bias the reading line slightly to reduce lag
const MARKER_PCT = 0.36;
// Gentler motion to avoid jumpiness
let DEAD_BAND_PX = 18;          // ignore small errors
let CORRECTION_MIN_MS = 240;    // throttle corrections
let MAX_FWD_STEP_PX = 96;       // clamp forward step size
let MAX_BACK_STEP_PX = 140;     // clamp backward step size
// Anti-jitter: remember last move direction (+1 fwd, -1 back, 0 none)
let _lastMoveDir = 0;

// Quick fuzzy contain check (Unicode-aware normalization)
function _normQuick(s){
  try { return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim(); }
  catch { // fallback for engines lacking Unicode property escapes
    return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  }
}
function fuzzyAdvance(textSlice, spoken){
  const A = _normQuick(textSlice);
  const rawB = _normQuick(spoken);
  const B = rawB.length > 80 ? rawB.slice(-80) : rawB; // focus on tail
  return A.indexOf(B); // >= 0 if found
}
function getUpcomingTextSlice(maxWords = 120){
  try {
    const end = Math.min(scriptWords.length, currentIndex + Math.max(1, maxWords));
    return (scriptWords.slice(currentIndex, end) || []).join(' ');
  } catch { return ''; }
}
// expose for quick experiments in console/debug tools
try { Object.assign(window, { fuzzyAdvance, getUpcomingTextSlice }); } catch {}

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
// TP: advance-by-transcript
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
  // Maintain a persistent pointer to the current line element
  try { if (currentEl && currentEl !== targetPara.el) { currentEl.classList.remove('active'); currentEl.classList.remove('current'); } } catch {}
  currentEl = targetPara.el;
  try { currentEl.classList.add('active'); currentEl.classList.add('current'); } catch {}

  const maxTop     = Math.max(0, scriptEl.scrollHeight - viewer.clientHeight);
  const markerTop  = Math.round(viewer.clientHeight * (typeof MARKER_PCT === 'number' ? MARKER_PCT : 0.4));
  const desiredTop = Math.max(0, Math.min(maxTop, (targetPara.el.offsetTop - markerTop)));

  const err = desiredTop - viewer.scrollTop;
  const tNow = performance.now();
  if (Math.abs(err) < DEAD_BAND_PX || (tNow - _lastCorrectionAt) < CORRECTION_MIN_MS) return;

  // Anti-jitter: for interim results, avoid backward corrections entirely
  const dir = err > 0 ? 1 : (err < 0 ? -1 : 0);
  if (!isFinal && dir < 0) return;
  // Hysteresis: don’t change direction on interim unless the error is clearly large
  if (!isFinal && _lastMoveDir !== 0 && dir !== 0 && dir !== _lastMoveDir && Math.abs(err) < (DEAD_BAND_PX * 2)) return;

  // Scale steps based on whether this came from a final (more confident) match
  const fwdStep = isFinal ? MAX_FWD_STEP_PX : Math.round(MAX_FWD_STEP_PX * 0.6);
  const backStep = isFinal ? MAX_BACK_STEP_PX : Math.round(MAX_BACK_STEP_PX * 0.6);
  // Prefer element-anchored scrolling so we always target the same line element
  try {
    scrollToEl(currentEl, markerTop);
  } catch {
    let next;
    if (err > 0) next = Math.min(viewer.scrollTop + fwdStep, desiredTop);
    else         next = Math.max(viewer.scrollTop - backStep, desiredTop);
    viewer.scrollTop = next;
  }
  if (typeof debug === 'function') debug({ tag:'scroll', top: viewer.scrollTop });
  {
    const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
    const ratio = max ? (viewer.scrollTop / max) : 0;
    sendToDisplay({ type:'scroll', top: viewer.scrollTop, ratio });
  }
  // Evaluate whether to run the gentle catch-up loop based on anchor position
  try {
    const vRect = viewer.getBoundingClientRect();
    // Prefer the most visible element if available; else current paragraph
  const anchorEl = (__anchorObs?.mostVisibleEl?.() || null) || targetPara.el;
    const pRect = anchorEl.getBoundingClientRect();
    const anchorY = pRect.top - vRect.top; // anchor relative to viewer
    maybeCatchupByAnchor(anchorY, viewer.clientHeight);
  } catch {}
  // mark progress for stall-recovery
  if (typeof markAdvance === 'function') markAdvance(); else _lastAdvanceAt = performance.now();
  _lastCorrectionAt = tNow;
  if (dir !== 0) _lastMoveDir = dir;
  // Dead-man timer: ensure scroll keeps up with HUD index
  try { deadmanWatchdog(currentIndex); } catch {}
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

  // TP: typography-apply
  function applyTypography(){
    scriptEl.querySelectorAll('p, .note').forEach(el => {
     
     
      el.style.fontSize  = String(fontSizeInput.value) + 'px';
      el.style.lineHeight= String(lineHeightInput.value);
    });
    // Persist preferences
    try { localStorage.setItem('tp_font_size_v1', String(fontSizeInput.value||'')); } catch {}
    try { localStorage.setItem('tp_line_height_v1', String(lineHeightInput.value||'')); } catch {}
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
        const pieces = html.split(/(?=<div class=\"note")|(?<=<\/div>)/i).filter(Boolean);
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
  // Ensure enough breathing room at the bottom so the last lines can reach the marker comfortably
  applyBottomPad();
  // currentIndex = 0; // Do not reset index when rendering script for speech sync

    // Mirror to display
    sendToDisplay({ type:'render', html: scriptEl.innerHTML, fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });

    // Build paragraph index
    // Rebuild IntersectionObserver and (re)observe visible paragraphs
    // Rebuild IntersectionObserver via modular anchor observer
    try { __anchorObs?.ensure?.(); } catch {}
    const paras = Array.from(scriptEl.querySelectorAll('p'));
    try { __anchorObs?.observeAll?.(paras); } catch {}
    lineEls = paras;
    try { updateDebugPosChip(); } catch {}
    paraIndex = []; let acc = 0;
    for (const el of paras){
      const wc = normTokens(el.textContent || '').length || 1;
      paraIndex.push({ el, start: acc, end: acc + wc - 1 });
      acc += wc;
    }
    // Initialize current element pointer
    try { currentEl?.classList.remove('active'); } catch {}
    currentEl = paraIndex.find(p => currentIndex >= p.start && currentIndex <= p.end)?.el || paraIndex[0]?.el || null;
    if (currentEl) currentEl.classList.add('active');
  }

  // Dynamic bottom padding so the marker can sit over the final paragraphs
  function applyBottomPad(){
    try {
      const pad = Math.max(window.innerHeight * 0.5, 320);
      if (scriptEl) scriptEl.style.paddingBottom = `${pad}px`;
    } catch {}
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

// TP: display-open
function openDisplay(){
  try {
    // Always use the standalone external display for production
    displayWin = window.open('display.html', 'TeleprompterDisplay', 'width=1000,height=700');
    if (!displayWin) {
      setStatus('Pop-up blocked. Allow pop-ups and try again.');
      displayChip.textContent = 'Display: blocked';
      return;
    }
    displayReady = false;
    displayChip.textContent = 'Display: open';
    closeDisplayBtn.disabled = true;  // will be enabled by global DISPLAY_READY handler
    // Kick off handshake retry pings: every 300ms up to ~3s or until READY.
    if (displayHelloTimer) { clearInterval(displayHelloTimer); displayHelloTimer = null; }
    displayHelloDeadline = performance.now() + 3000; // 3s window
    displayHelloTimer = setInterval(()=>{
      // If closed or already ready, stop.
      if (!displayWin || displayWin.closed || displayReady) {
        clearInterval(displayHelloTimer); displayHelloTimer = null; return;
      }
      // If deadline passed, stop trying.
      if (performance.now() > displayHelloDeadline) {
        clearInterval(displayHelloTimer); displayHelloTimer = null; return;
      }
      try { sendToDisplay({ type:'hello' }); } catch {}
    }, 300);
  } catch (e) {
    setStatus('Unable to open display window: ' + e.message);
  }
}
  function closeDisplay(){ if(displayWin && !displayWin.closed) displayWin.close(); displayWin=null; displayReady=false; closeDisplayBtn.disabled=true; displayChip.textContent='Display: closed'; }
  // TP: display-send
  function sendToDisplay(payload){ if(displayWin && !displayWin.closed) displayWin.postMessage(payload, '*'); }
  window.sendToDisplay = sendToDisplay;

  // Centralized scroll target + helpers (always scroll the same container, not window)
  // Installed later once viewer is bound
  function getScroller(){ return viewer; }
  let clampScrollTop, scrollByPx, scrollToY, scrollToEl;

  // Debug chip updater (throttled via rAF): shows anchor percentage within viewport and scrollTop
  function updateDebugPosChipImmediate(){
    try {
      if (!debugPosChip || !viewer) return;
      const vH = Math.max(1, viewer.clientHeight || 1);
      const active = (scriptEl || viewer)?.querySelector('p.active');
      const vis = __anchorObs?.mostVisibleEl?.() || null;
      const el = vis || active || (paraIndex.find(p=>currentIndex>=p.start && currentIndex<=p.end)?.el) || null;
      let pct = 0;
      if (el){
        const vRect = viewer.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const anchorY = r.top - vRect.top;
        pct = Math.round(Math.max(0, Math.min(100, (anchorY / vH) * 100)));
      }
      const topStr = (viewer.scrollTop||0).toLocaleString();
      debugPosChip.textContent = `Anchor ${pct}% • scrollTop ${topStr}`;
    } catch {}
  }
  let __debugPosRaf = 0; let __debugPosPending = false;
  function updateDebugPosChip(){
    if (__debugPosPending) return; // already scheduled
    __debugPosPending = true;
    __debugPosRaf && cancelAnimationFrame(__debugPosRaf);
    __debugPosRaf = requestAnimationFrame(()=>{ __debugPosPending = false; updateDebugPosChipImmediate(); });
  }


  // Dead-man timer: if HUD index advances but scrollTop doesn’t, force a catch-up jump
  let _wdLastIdx = -1, _wdLastTop = 0, _wdLastT = 0;
  function deadmanWatchdog(idx){
    try {
      const sc = getScroller(); if (!sc) return;
      // Don’t fight auto-scroll
      if (autoTimer) return;
      const now = performance.now();
      const top = sc.scrollTop;
      if (idx > _wdLastIdx && (now - _wdLastT) > 600 && Math.abs(top - _wdLastTop) < 4){
        // Force a catch-up jump to the current element/paragraph under idx
        let el = null;
        try {
          const p = (paraIndex||[]).find(p => idx >= p.start && idx <= p.end);
          el = p?.el || null;
          if (!el && Array.isArray(lineEls)) el = lineEls[Math.min(idx, lineEls.length-1)] || null; // best-effort fallback
        } catch {}
        if (el){
          const offset = Math.round(sc.clientHeight * 0.40);
          scrollToEl(el, offset);
          // mirror to display
          const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
          const ratio = max ? (sc.scrollTop / max) : 0;
          sendToDisplay({ type:'scroll', top: sc.scrollTop, ratio });
        }
      }
      if (idx > _wdLastIdx){ _wdLastIdx = idx; _wdLastT = now; _wdLastTop = top; }
    } catch {}
  }

  /* ──────────────────────────────────────────────────────────────
   * Typography + Auto‑scroll + Timer
   * ────────────────────────────────────────────────────────────── */
function startAutoScroll(){
  if (autoTimer) return;
  // Pause catch-up controller while auto-scroll is active
  try { __scrollCtl?.stopAutoCatchup?.(); } catch {}
  const step = () => {
    const pxPerSec = Math.max(0, Number(autoSpeed.value) || 0);
    try { scrollByPx(pxPerSec / 60); } catch { viewer.scrollTop += (pxPerSec / 60); }
    {
      const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const ratio = max ? (viewer.scrollTop / max) : 0;
      sendToDisplay({ type: 'scroll', top: viewer.scrollTop, ratio });
    }
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
  // Resume catch-up controller if speech sync is active — via heuristic gate
  if (recActive) {
    try {
      const vRect = viewer.getBoundingClientRect();
      // Compute current anchor from active paragraph or currentIndex
      let anchorY = 0;
  // Prefer most-visible from IO module, then active/current paragraph
      const active = (scriptEl || viewer)?.querySelector('p.active');
  const el = (__anchorObs?.mostVisibleEl?.() || null) || active || (paraIndex.find(p=>currentIndex>=p.start && currentIndex<=p.end)?.el);
      if (el){ const r = el.getBoundingClientRect(); anchorY = r.top - vRect.top; }
      maybeCatchupByAnchor(anchorY, viewer.clientHeight);
    } catch { try { __scrollCtl?.stopAutoCatchup?.(); } catch {} }
  }
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
  // TP: preroll-controls
  const show = (v) => { countNum.textContent = String(v); countOverlay.style.display='flex'; sendToDisplay({type:'preroll', show:true, n:v}); };
    show(n);
    const id = setInterval(() => { n -= 1; if (n<=0){ clearInterval(id); countOverlay.style.display='none'; sendToDisplay({type:'preroll', show:false}); fn(); } else show(n); }, 1000);
  }


function toggleRec(){
  if (recActive){
    // stopping (before calling recog.stop())
    recAutoRestart = false;
    recActive = false;
    document.body.classList.remove('listening'); // when stopping
    stopSpeechSync();
    recChip.textContent = 'Speech: idle';
    recBtn.textContent = 'Start speech sync';
    // Try to stop external recorders per settings
    try { __recorder?.stop?.(); } catch {}
    return;
  }

  const sec = Number(prerollInput?.value) || 0;
  beginCountdownThen(sec, () => {
    // starting:
    recAutoRestart = true;
    recActive = true;
    document.body.classList.add('listening'); // when starting
    recChip.textContent = 'Speech: listening…';
    recBtn.textContent = 'Stop speech sync';
    startTimer();
    startSpeechSync();
    // Try to start external recorders per settings
    try { __recorder?.start?.(); } catch {}
  });
}



  // (Removed duplicate populateDevices/requestMic/updateMicDevices/updateCamDevices — consolidated earlier.)

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

  // TP: reset-script
  function resetScript(){
    // Stop auto-scroll and reset timer for a clean take
    if (autoTimer) stopAutoScroll();
    resetTimer();
    // Rebuild layout to ensure paraIndex is fresh, but keep content
    renderScript(editor?.value || '');
    // Reset logical position and scroll to the very top
    currentIndex = 0;
    viewer.scrollTop = 0;
    // Reset dead-man timer state
    _wdLastIdx = -1; _wdLastTop = 0; _wdLastT = 0;
    try {
      sendToDisplay({ type:'scroll', top: 0, ratio: 0 });
    } catch {}
    setStatus('Script reset to top for new take.');
  }

  function downloadAsFile(name, text, mime='text/plain'){
    try {
      let type = String(mime || 'text/plain');
      if (type.startsWith('text/') && !/charset=/i.test(type)) type += ';charset=utf-8';
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = name || 'download.txt';
      a.href = url;
      a.rel = 'noopener';
      // Fallback for browsers that ignore the download attribute
      if (typeof a.download === 'undefined') a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} a.remove(); }, 1000);
    } catch (e) {
      try { alert('Download failed: ' + (e?.message || e)); } catch {}
    }
  }

  /* ──────────────────────────────────────────────────────────────
   * Speech recognition start/stop logic
   * ────────────────────────────────────────────────────────────── */
  // TP: speech-start
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

    // Reset backoff on a good start and reflect UI state
    recog.onstart = () => {
      recBackoffMs = 300;
      document.body.classList.add('listening');
      try { recChip.textContent = 'Speech: listening…'; } catch {}
    };

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
      document.body.classList.remove('listening');
      try { recChip.textContent = 'Speech: idle'; } catch {}
      // If user didn't stop it, try to bring it back with backoff
      if (recAutoRestart && recActive) {
        setTimeout(() => {
          try {
            recog.start();
            try { recChip.textContent = 'Speech: listening…'; } catch {}
            document.body.classList.add('listening');
          } catch (e) {
            // swallow; next interval will try again
          }
        }, recBackoffMs);
        recBackoffMs = Math.min(recBackoffMs * 1.5, 5000); // cap at 5s
      }
    };

    try { recog.start(); } catch(e){ console.warn('speech start failed', e); }
    // Don't start catch-up unconditionally; the heuristic will kick it in when needed
  }

  // TP: speech-stop
  function stopSpeechSync(){
    try { recog && recog.stop(); } catch(_) {}
    recog = null;
    try { __scrollCtl?.stopAutoCatchup?.(); } catch {}
  }

  // TP: docx-mammoth
  async function ensureMammoth(){
    if (window.mammoth) return window.mammoth;
    const loadScript = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = res;
      s.onerror = () => rej(new Error('Failed to load '+src));
      document.head.appendChild(s);
    });
    // Try primary CDN, then alternate, then local vendor copy if present
    const sources = [
      'https://unpkg.com/mammoth/mammoth.browser.min.js',
      'https://cdn.jsdelivr.net/npm/mammoth/mammoth.browser.min.js',
      // Optional local fallback (place file at d:/teleprompter/vendor/mammoth/mammoth.browser.min.js)
      'vendor/mammoth/mammoth.browser.min.js'
    ];
    let lastErr;
    for (const src of sources){
      try { await loadScript(src); if (window.mammoth) return window.mammoth; } catch(e){ lastErr = e; }
    }
    throw new Error('Mammoth failed to load from CDN and local fallback. '+(lastErr?.message||''));
  }

  // TP: upload-file
  async function uploadFromFile(file){
    const lower = (file.name||'').toLowerCase();
    const isDocx = lower.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (isDocx){
      try{
        const mammoth = await ensureMammoth();
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        const text = String(value||'').replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
        // Pipeline: raw (Mammoth) -> Normalize (if available) -> render normalized
        editor.value = text;
        let normalized = false;
        try {
          if (typeof window.normalizeToStandard === 'function') { window.normalizeToStandard(); normalized = true; }
          else if (typeof window.fallbackNormalize === 'function') { window.fallbackNormalize(); normalized = true; }
        } catch {}
        renderScript(editor.value);
        setStatus(`Loaded "${file.name}" (.docx)${normalized ? ' and normalized' : ''}.`);
      } catch(e){ err(e); setStatus('Failed to read .docx: ' + (e?.message||e)); }
      return;
    }

    // Plain text / md / rtf / .text → read as text (RTF will include markup)
    const reader = new FileReader();
    reader.onload = () => { editor.value = reader.result || ''; renderScript(editor.value); setStatus(`Loaded “${file.name}”.`); };
    reader.onerror = () => setStatus('Failed to read file.');
    reader.readAsText(file, 'utf-8');
  }

// Debug HUD moved to debug-tools.js

// ───────────────────────────────────────────────────────────────
// Self-checks: quick asserts at load, with a small pass/fail bar
// ───────────────────────────────────────────────────────────────
// TP: self-checks
function runSelfChecks(){
  const checks = [];

  // 1) Exactly one script include (by current script src if available)
  try {
    const cs = document.currentScript;
    let count = 1, label = 'n/a';
    if (cs && cs.src){
      const src = cs.src;
      count = Array.from(document.scripts).filter(s => s.src && s.src === src).length;
      label = src.split('/').pop();
    }
    checks.push({ name:'Single script include', pass: count === 1, info:`${label} found ${count}` });
  } catch (e) {
    checks.push({ name:'Single script include', pass:true, info:'(skipped)' });
  }

  // 2) Help injected with Normalize/Validate
  try {
    const help = document.getElementById('shortcutsOverlay');
    const has = !!(help && help.querySelector('#normalizeBtn') && help.querySelector('#validateBtn'));
    checks.push({ name:'Help injected', pass: has, info: has ? 'OK' : 'missing pieces' });
  } catch { checks.push({ name:'Help injected', pass:false, info:'error' }); }

  // 3) Matcher constants defined and sane
  try {
  const a = (typeof SIM_THRESHOLD === 'number' && SIM_THRESHOLD > 0 && SIM_THRESHOLD < 1);
  const b = (typeof MATCH_WINDOW_AHEAD === 'number' && MATCH_WINDOW_AHEAD >= 60 && MATCH_WINDOW_AHEAD <= 1000);
  const c = (typeof MATCH_WINDOW_BACK === 'number' && MATCH_WINDOW_BACK >= 0 && MATCH_WINDOW_BACK <= 500);
  const d = (typeof STRICT_FORWARD_SIM === 'number' && STRICT_FORWARD_SIM > 0 && STRICT_FORWARD_SIM < 1);
  const e = (typeof MAX_JUMP_AHEAD_WORDS === 'number' && MAX_JUMP_AHEAD_WORDS >= 1 && MAX_JUMP_AHEAD_WORDS <= 200);
  checks.push({ name:'Matcher constants', pass: a && b && c && d && e, info:`SIM=${typeof SIM_THRESHOLD==='number'?SIM_THRESHOLD:'?'} WIN_F=${typeof MATCH_WINDOW_AHEAD==='number'?MATCH_WINDOW_AHEAD:'?'} WIN_B=${typeof MATCH_WINDOW_BACK==='number'?MATCH_WINDOW_BACK:'?'} STRICT=${typeof STRICT_FORWARD_SIM==='number'?STRICT_FORWARD_SIM:'?'} JUMP=${typeof MAX_JUMP_AHEAD_WORDS==='number'?MAX_JUMP_AHEAD_WORDS:'?'}` });
  } catch { checks.push({ name:'Matcher constants', pass:false, info:'not defined' }); }

  // 4) Display handshake wiring present (openDisplay + sendToDisplay)
  try {
    const ok = (typeof openDisplay === 'function' && typeof sendToDisplay === 'function');
    checks.push({ name:'Display handshake', pass: ok, info: ok ? 'wiring present' : 'functions missing' });
  } catch { checks.push({ name:'Display handshake', pass:false, info:'error' }); }

  // 5) Top Normalize button wired
  try {
    const btn = document.getElementById('normalizeTopBtn');
    const wired = !!(btn && (btn.onclick || btn.dataset.wired));
    checks.push({ name:'Top Normalize button wired', pass: wired, info: wired ? 'OK' : 'missing' });
  } catch { checks.push({ name:'Top Normalize button wired', pass:false, info:'error' }); }

  // 6) Mic bars drawing (top bar meter)
  try {
    const meter = document.getElementById('dbMeterTop');
    const bars = meter ? meter.querySelectorAll('.bar').length : 0;
    let pass = bars >= 8; let info = `${bars} bars`;
    if (audioStream && analyser){
      setTimeout(()=>{
        try {
          const on = meter.querySelectorAll('.bar.on').length;
          const row = checks.find(c=>c.name==='Mic bars drawing');
            if (row){ row.pass = row.pass && on > 0; row.info = `${bars} bars, ${on} on`; renderSelfChecks(checks); }
        } catch {}
      }, 300);
      info += ', sampling…';
    }
    checks.push({ name:'Mic bars drawing', pass, info });
  } catch { checks.push({ name:'Mic bars drawing', pass:false, info:'error' }); }

  renderSelfChecks(checks);
  return checks;
}

function renderSelfChecks(checks){
  try {
    const total = checks.length;
    const passed = checks.filter(c=>c.pass).length;
    const allOk = passed === total;

    // Try to append in the topbar if present; else fixed bar at top
    const host = document.querySelector('.topbar');
    let bar = document.getElementById('selfChecksBar');
    if (!bar){
      bar = document.createElement('div');
      bar.id = 'selfChecksBar';
      bar.style.cssText = host
        ? 'margin-left:8px; padding:4px 8px; border:1px solid var(--edge); border-radius:8px; font-size:12px; cursor:pointer;'
        : 'position:fixed; left:8px; right:8px; top:8px; z-index:99999; padding:8px 10px; border:1px solid var(--edge); border-radius:10px; font-size:13px; cursor:pointer; background:#0e141b; color:var(--fg);'
      ;
      if (host) host.appendChild(bar); else document.body.appendChild(bar);
    }

    bar.style.background = allOk ? (host ? '' : '#0e141b') : (host ? '' : '#241313');
    bar.style.borderColor = allOk ? 'var(--edge)' : '#7f1d1d';
    bar.textContent = `Self-checks: ${passed}/${total} ${allOk ? '✅' : '❌'}  (click)`;

    let panel = document.getElementById('selfChecksPanel');
    if (!panel){
      panel = document.createElement('div');
      panel.id = 'selfChecksPanel';
      panel.className = 'hidden';
      panel.style.cssText = 'position:fixed; right:10px; top:44px; z-index:99999; max-width:420px; background:#0e141b; border:1px solid var(--edge); border-radius:12px; box-shadow:0 8px 28px rgba(0,0,0,.45); padding:10px; color:var(--fg); font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;';
      panel.innerHTML = '<div style="margin:4px 0 6px; opacity:.8">Quick startup checks</div><div id="selfChecksList"></div>';
  document.body.appendChild(panel);
  document.addEventListener('click', (e)=>{ if (e.target !== bar && !panel.contains(e.target)) panel.classList.add('hidden'); });
  const aboutCloseBtn = panel.querySelector('#aboutClose');
  if (aboutCloseBtn) aboutCloseBtn.onclick = () => panel.classList.add('hidden');
    }

    const list = panel.querySelector('#selfChecksList');
    list.innerHTML = '';
    for (const c of checks){
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; gap:10px; padding:4px 0; border-bottom:1px dashed var(--edge)';
      row.innerHTML = `<span>${c.pass ? '✅' : '❌'} ${c.name}</span><span class="dim" style="opacity:.8">${c.info||''}</span>`;
      list.appendChild(row);
    }

    bar.onclick = () => { panel.classList.toggle('hidden'); };
  } catch (e) { try { console.warn('Self-checks UI failed:', e); } catch {} }

  // Ensure a top Normalize button exists for self-checks (in case HTML removed it)
  try {
    let topNorm = document.getElementById('normalizeTopBtn');
    if (!topNorm) {
      const targetRow = document.querySelector('.panel .row');
      if (targetRow) {
        topNorm = document.createElement('button');
        topNorm.id = 'normalizeTopBtn';
        topNorm.className = 'btn-chip';
        topNorm.textContent = 'Normalize';
        topNorm.title = 'Normalize current script tags';
        targetRow.appendChild(topNorm);
      }
    }
  } catch {}
}

// ───────────────────────────────────────────────────────────────
// Easter eggs: theme toggle, party meter, advanced tools, :roar
// ───────────────────────────────────────────────────────────────
function installEasterEggs(){
  // ---- restore theme
  try {
    const savedTheme = localStorage.getItem('egg.theme');
    if (savedTheme) document.body.classList.add(savedTheme);
  } catch {}

  // ---- Konami unlock -> toggles 'savanna' class
  const konami = [38,38,40,40,37,39,37,39,66,65];
  let pos = 0;
  window.addEventListener('keydown', (e) => {
    const code = e.keyCode || e.which;
    pos = (code === konami[pos]) ? pos + 1 : 0;
    if (pos === konami.length){
      pos = 0;
      document.body.classList.toggle('savanna');
      const on = document.body.classList.contains('savanna');
      try { localStorage.setItem('egg.theme', on ? 'savanna' : ''); } catch {}
      try { setStatus && setStatus(on ? 'Savanna unlocked 🦁' : 'Savanna off'); } catch {}
    }
  });

  // ---- dB meter party mode (5 clicks within 1.2s)
  const meter = document.getElementById('dbMeter');
  if (meter){
    let clicks = 0, t0 = 0;
    meter.addEventListener('click', () => {
      const t = performance.now();
      if (t - t0 > 1200) clicks = 0;
      t0 = t; clicks++;
      if (clicks >= 5){
        clicks = 0;
        meter.classList.toggle('party');
        try { setStatus && setStatus(meter.classList.contains('party') ? 'Meter party 🎉' : 'Meter normal'); } catch {}
      }
    });
  }

  // ---- Help title alt-click -> show hidden "Advanced" tools
  const helpTitle = document.getElementById('shortcutsTitle');
  const advanced  = document.getElementById('helpAdvanced');
  if (helpTitle && advanced){
    helpTitle.addEventListener('click', (e)=>{
      if (!e.altKey) return;
      advanced.classList.toggle('hidden');
    });
  }

  // ---- :roar in editor -> quick emoji confetti
  const ed = document.getElementById('editor');
  if (ed){
    ed.addEventListener('input', ()=>{
      const v = ed.value.slice(-5).toLowerCase();
      if (v === ':roar') {
        ed.value = ed.value.slice(0, -5);
        roarOverlay();
        ed.dispatchEvent(new Event('input', {bubbles:true}));
      }
    });
  }
}

function roarOverlay(){
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;z-index:99999;pointer-events:none';
  o.innerText = '🦁';
  o.style.fontSize = '14vw'; o.style.opacity = '0';
  document.body.appendChild(o);
  requestAnimationFrame(()=>{
    o.style.transition = 'transform .5s ease, opacity .5s ease';
    o.style.transform = 'scale(1.1)'; o.style.opacity = '0.9';
    setTimeout(()=>{ o.style.opacity='0'; o.style.transform='scale(0.9)'; }, 700);
    setTimeout(()=> o.remove(), 1200);
  });
}

// ───────────────────────────────────────────────────────────────
// About popover (Ctrl+Alt+K)
// ───────────────────────────────────────────────────────────────
(function(){
  let about;
  function showAbout(){
    if (!about){
      about = document.createElement('div');
      about.className = 'overlay';
      const built = new Date().toLocaleString();
      const ver = (window.APP_VERSION||'local');
      about.innerHTML = `
      <div class="sheet" style="max-width:560px">
        <header style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <h3 style="margin:0">Teleprompter • About</h3>
          <button class="btn-chip" id="aboutClose">Close</button>
        </header>
        <p style="margin:0 0 6px; color:#96a0aa">Hidden credits & build info</p>
        <pre style="white-space:pre-wrap; user-select:text;">Build: ${built}
JS: v${ver}
Easter eggs: Konami (savanna), Meter party, :roar</pre>
      </div>`;
      document.body.appendChild(about);
      about.addEventListener('click', e => { if (e.target === about) about.classList.add('hidden'); });
      about.querySelector('#aboutClose').onclick = () => about.classList.add('hidden');
    }
    about.classList.remove('hidden');
  }
  window.addEventListener('keydown', (e)=>{
    if (e.ctrlKey && e.altKey && (e.key?.toLowerCase?.() === 'k')){ e.preventDefault(); showAbout(); }
  });
})();

})();
