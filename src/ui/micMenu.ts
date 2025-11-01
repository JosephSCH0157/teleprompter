// Mic pill (permChip) popover menu for quick ASR access
import { getAsrState, setActiveProfile } from '../asr/store';

function openSettingsToAsr(startWizard?: boolean) {
  try {
    // Open overlay
    (window as any).__tpSettings?.open?.();
    // Switch to Media tab
    const overlay = document.getElementById('settingsOverlay');
    if (overlay) overlay.classList.remove('hidden');
    const tabsRoot = document.getElementById('settingsTabs') || document;
    tabsRoot?.querySelectorAll('[data-tab-content]')?.forEach((c) => ((c as HTMLElement).style.display = 'none'));
    const media = document.querySelector('[data-tab-content="media"]') as HTMLElement | null;
    if (media) media.style.display = '';
    // Scroll into ASR card
    setTimeout(() => {
      const sec = document.getElementById('asrSettings');
      if (sec) {
        try { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { sec.scrollIntoView(); }
        try { sec.classList.add('asr-highlight'); setTimeout(() => sec.classList.remove('asr-highlight'), 1400); } catch {}
      }
      // focus device select if present
      const devSel = document.getElementById('asrDevice') as HTMLSelectElement | null;
      devSel?.focus?.();
      if (startWizard) { try { (window as any).startAsrWizard?.(); } catch {} }
    }, 50);
  } catch {}
}

function buildMenu() {
  let el = document.getElementById('micMenu');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'micMenu';
  el.style.position = 'fixed';
  el.style.zIndex = '2147483640';
  el.style.background = 'rgba(10,14,22,0.98)';
  el.style.border = '1px solid rgba(255,255,255,0.08)';
  el.style.borderRadius = '10px';
  el.style.padding = '8px';
  el.style.minWidth = '220px';
  el.style.boxShadow = '0 6px 24px rgba(0,0,0,0.4)';
  el.style.display = 'none';
  el.setAttribute('role', 'menu');
  el.innerHTML = `
    <button class="mm-item" data-act="grant">Grant mic access</button>
    <button class="mm-item" data-act="select">Select microphone…</button>
    <button class="mm-item" data-act="calibrate">Calibrate now…</button>
    <div class="mm-sep" role="separator" style="margin:6px 0;border-top:1px solid rgba(255,255,255,0.08)"></div>
    <div class="mm-hdr">Profile</div>
    <div id="mm-profiles"></div>
  `;
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('.mm-item')) {
      const act = t.getAttribute('data-act');
      if (act === 'grant') { try { (window as any).__tpMic?.requestMic?.(); } catch {} }
      if (act === 'select') openSettingsToAsr(false);
      if (act === 'calibrate') {
        try {
          const Auto = (window as any).__tpAuto || (window as any).Auto;
          const isLive = !!Auto?.getState?.().enabled;
          if (isLive) {
            (window as any).toast?.('Pause Auto-scroll to calibrate', { type: 'info' });
          } else {
            openSettingsToAsr(true);
          }
        } catch { openSettingsToAsr(true); }
      }
      hide();
    } else if (t.matches('[data-profile]')) {
      const id = t.getAttribute('data-profile') || '';
      try { setActiveProfile(id as any); (window as any).toast?.('ASR profile selected', { type: 'info' }); } catch {}
      hide();
    }
  });
  document.body.appendChild(el);
  return el;
}

function populateProfiles(el: HTMLElement) {
  try {
    const cont = el.querySelector('#mm-profiles') as HTMLElement | null;
    if (!cont) return;
    cont.innerHTML = '';
    const s = getAsrState();
    const ids = Object.keys(s.profiles || {});
    if (ids.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mm-empty';
      empty.textContent = 'No profiles';
      cont.appendChild(empty);
      return;
    }
    ids.forEach((id) => {
      const p = (s.profiles as any)[id];
      const btn = document.createElement('button');
      btn.className = 'mm-item';
      btn.setAttribute('data-profile', id);
      btn.textContent = p?.label || id;
      cont.appendChild(btn);
    });
  } catch {}
}

function show(anchor: HTMLElement) {
  const el = buildMenu();
  populateProfiles(el);
  const r = anchor.getBoundingClientRect();
  const x = Math.min(window.innerWidth - 240, r.left);
  const y = r.bottom + 6;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.display = '';
  setTimeout(() => {
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      if (!el.contains(t) && t !== anchor) { hide(); document.removeEventListener('mousedown', onDoc, true); }
    };
    document.addEventListener('mousedown', onDoc, true);
  }, 0);
}

function hide() {
  const el = document.getElementById('micMenu');
  if (el) el.style.display = 'none';
}

(function initMicPillMenu(){
  try {
    const pill = document.getElementById('permChip');
    if (!pill) return;
    pill.style.cursor = 'pointer';
    pill.title = 'Microphone menu';
    pill.addEventListener('click', () => {
      const el = document.getElementById('micMenu');
      if (el && el.style.display !== 'none') hide(); else show(pill);
    });
    // Device changed prompt (when selecting a new device)
    document.addEventListener('change', (e) => {
      const t = e.target as HTMLElement | null;
      if ((t as HTMLSelectElement)?.id === 'settingsMicSel') {
        (window as any).toast?.('Mic device changed — calibrate?', { type: 'warn', actionLabel: 'Open', action: () => openSettingsToAsr(false) });
      }
    }, { capture: true });
  } catch {}
})();

// JIT prompt: first run (no active profile)
(function firstRunToast(){
  try {
    const s = getAsrState();
    if (!s.activeProfileId) {
      (window as any).toast?.('ASR not calibrated — open ASR settings', {
        type: 'warn',
        actionLabel: 'Open',
        action: () => openSettingsToAsr(false)
      });
    }
  } catch {}
})();
