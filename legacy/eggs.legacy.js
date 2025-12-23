// Easter eggs and related lightweight UX add-ons
// This module is safe to import in the browser. It references globals defensively.

// Minimal safe toast shim (avoid hard dependency on module exports)
function safeToast(msg) {
  try {
    const fn = (typeof window !== 'undefined' && window.toast) ? window.toast : (m => console.debug('[toast]', m));
    fn(String(msg || ''));
  } catch {}
}

export function installEasterEggs() {
  // restore theme from localStorage
  try {
    const savedTheme = localStorage.getItem('egg.theme');
    if (savedTheme) document.body.classList.add(savedTheme);
  } catch {}

  // Konami unlock -> toggles 'savanna' class
  const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
  let pos = 0;
  window.addEventListener('keydown', (e) => {
    const code = e.keyCode || e.which;
    pos = code === konami[pos] ? pos + 1 : 0;
    if (pos === konami.length) {
      pos = 0;
      document.body.classList.toggle('savanna');
      const on = document.body.classList.contains('savanna');
      try {
        localStorage.setItem('egg.theme', on ? 'savanna' : '');
      } catch {}
      try {
        (window.setStatus || (() => {}))(on ? 'Savanna unlocked 🦁' : 'Savanna off');
      } catch {}
    }
  });

  // dB meter party mode (5 clicks within 1.2s)
  // Use top-bar meter as the single source of truth; fall back to legacy if present
  const meter = document.getElementById('dbMeterTop') || document.getElementById('dbMeter');
  if (meter) {
    let clicks = 0,
      t0 = 0;
    meter.addEventListener('click', () => {
      const t = performance.now();
      if (t - t0 > 1200) clicks = 0;
      t0 = t;
      clicks++;
      if (clicks >= 5) {
        clicks = 0;
        meter.classList.toggle('party');
        try {
          (window.setStatus || (() => {}))(
            meter.classList.contains('party') ? 'Meter party 🎉' : 'Meter normal'
          );
        } catch {}
      }
    });
  }

  // Help title alt-click -> show hidden "Advanced" tools
  const helpTitle = document.getElementById('shortcutsTitle');
  const advanced = document.getElementById('helpAdvanced');
  if (helpTitle && advanced) {
    helpTitle.addEventListener('click', (e) => {
      if (e.altKey) advanced.classList.toggle('hidden');
    });
  }

  // :roar in editor -> quick emoji confetti
  const ed = document.getElementById('editor');
  if (ed) {
    ed.addEventListener('input', () => {
      const v = ed.value.slice(-5).toLowerCase();
      if (v === ':roar') {
        ed.value = ed.value.slice(0, -5);
        roarOverlay();
        ed.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }
}

export function roarOverlay() {
  const o = document.createElement('div');
  o.style.cssText =
    'position:fixed;inset:0;display:grid;place-items:center;z-index:99999;pointer-events:none';
  o.innerText = '🦁';
  o.style.fontSize = '14vw';
  o.style.opacity = '0';
  document.body.appendChild(o);
  requestAnimationFrame(() => {
    o.style.transition = 'transform .5s ease, opacity .5s ease';
    o.style.transform = 'scale(1.1)';
    o.style.opacity = '0.9';
    setTimeout(() => {
      o.style.opacity = '0';
      o.style.transform = 'scale(0.9)';
    }, 700);
    setTimeout(() => o.remove(), 1200);
  });
}


export function installCKEgg() {
  const enable = (silent = false) => {
    document.body.classList.add('ck');
    localStorage.setItem('egg.ck', '1');
    try {
      if (window.sendToDisplay) window.sendToDisplay({ type: 'toggle-ck', on: true });
    } catch {}
    if (!silent)
      try {
        safeToast('CK on');
      } catch {}
  };
  const disable = (silent = false) => {
    document.body.classList.remove('ck');
    localStorage.removeItem('egg.ck');
    try {
      if (window.sendToDisplay) window.sendToDisplay({ type: 'toggle-ck', on: false });
    } catch {}
    if (!silent)
      try {
        safeToast('CK off');
      } catch {}
  };
  // restore
  if (localStorage.getItem('egg.ck')) enable(true);
  // URL opt-in
  const q = new URLSearchParams(location.search);
  if (q.has('ck')) (q.get('ck') === '1' ? enable : disable)(true);
  // Secret keys: Ctrl+Alt+C toggles
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      document.body.classList.contains('ck') ? disable() : enable();
    }
  });
  // Editor trigger: type ":ck" to enable
  const ed = document.getElementById('editor');
  if (ed) {
    ed.addEventListener('input', () => {
      const tail = ed.value.slice(-3).toLowerCase();
      if (tail === ':ck') {
        ed.value = ed.value.slice(0, -3);
        ed.dispatchEvent(new Event('input', { bubbles: true }));
        enable();
      }
    });
  }
}

export function installAboutPopover() {
  let about;
  function showAbout() {
    if (!about) {
      about = document.createElement('div');
      about.className = 'overlay';
      const built = new Date().toLocaleString();
      const ver = window.APP_VERSION || 'local';
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
      about.addEventListener('click', (e) => {
        if (e.target === about) about.classList.add('hidden');
      });
      about.querySelector('#aboutClose').onclick = () => about.classList.add('hidden');
    }
    about.classList.remove('hidden');
  }
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.key?.toLowerCase?.() === 'k') {
      e.preventDefault();
      showAbout();
    }
  });
}
