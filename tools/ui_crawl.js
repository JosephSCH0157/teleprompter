#!/usr/bin/env node
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
(async function main(){
  const out = { clicked: [], errors: [], console: [], notes: [], meta: {} };
  try{
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    // Freeze viewport and DPR for deterministic layout
    try { await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 }); } catch {}
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    // Freeze world: time/random + disable animations
    const FIXED_NOW = 1700000000000;
    await page.evaluateOnNewDocument((fixedNow) => {
      try {
        const _Date = Date;
        class FixedDate extends _Date {
          constructor(...args) { super(args.length ? args[0] : fixedNow); }
        }
        FixedDate.now = () => fixedNow;
        FixedDate.UTC = _Date.UTC.bind(_Date);
        FixedDate.parse = _Date.parse.bind(_Date);
        // @ts-ignore
        window.Date = FixedDate;
      } catch {}
      try {
        let seed = 123456789;
        Math.random = () => { seed = (1103515245 * seed + 12345) & 0x7fffffff; return (seed >>> 0) / 0x80000000; };
      } catch {}
      try {
        const style = document.createElement('style');
        style.id = 'ci-freeze-style';
        style.textContent = '*{animation:none!important;transition:none!important}';
        (document.head || document.documentElement).appendChild(style);
      } catch {}
    }, FIXED_NOW);
    page.on('console', msg => {
      try {
        const loc = msg.location ? msg.location() : {};
        out.console.push({ type: msg.type(), text: maskText(msg.text()), location: loc });
      } catch {
        out.console.push({ type: 'console', text: maskText(msg.text()) });
      }
    });
    page.on('pageerror', err => { out.errors.push({ type: 'pageerror', message: String(err), stack: err && err.stack ? err.stack : null }); });
    let CURRENT_HOST = '127.0.0.1';
    page.on('response', res => {
      try {
        if (res.status() < 400) return;
        const u = new URL(res.url());
        const isMap = u.pathname.endsWith('.map');
        if (isMap) return;
        const isFirstParty = (u.hostname === CURRENT_HOST);
        if (isFirstParty) out.errors.push({ type: 'response', url: res.url(), status: res.status() });
      } catch {}
    });
  // Choose host/port (CI-aware). Default to 127.0.0.1:5180 to match CI/static_server defaults.
  const HOST = process.env.CI_HOST || '127.0.0.1';
  // Prefer CI_PORT/PORT if explicitly set, else try 5180, else fall back to 8080 if 5180 busy
  let PORT = String(process.env.CI_PORT || process.env.PORT || '5180');
  try { process.env.PORT = PORT; } catch {}
  // Optional: start static server in-process only when explicitly requested
  if (String(process.env.START_STATIC_SERVER || '') === '1') {
    try { require('./static_server.js'); } catch { /* ignore */ }
  }

    await page.evaluateOnNewDocument((cfg) => {
      try { globalThis.__OBS_CFG__ = cfg; } catch {}
      try {
        // lightweight stub recorder if none exists
        if (!globalThis.__REC_SHIM__) {
          globalThis.__REC_SHIM__ = true;
          const makeObs = () => ({ id:'obs', isAvailable: async ()=>true, test: async ()=>true });
          globalThis.__recorder = globalThis.__recorder || {
            getSettings: ()=>({ selected:['obs'], configs: { obs: { url: cfg.url, password: cfg.password } } }),
            setSettings: ()=>{},
            get: (id)=> id === 'obs' ? makeObs() : null,
            adapters: { obs: makeObs() }
          };
        }
  }catch{}
  }, { url: 'ws://127.0.0.1:4455', password: '' });

  // Build crawl URL and append ?ci=1 to enable CI profile in the app
  async function navigateWithFallback(page) {
    const attempt = async (host, port) => {
      const base = `http://${host}:${port}/teleprompter_pro.html`;
      const u = base.includes('?') ? `${base}&ci=1` : `${base}?ci=1`;
      try { out.url = u; out.ci = true; } catch {}
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 15000 });
      out.meta.target = { host, port, url: u };
      return u;
    };
    let ok = false;
    try {
      const u = await attempt(HOST, PORT);
      out.notes.push(`Navigated to ${u}`);
      ok = true;
    } catch {}
    if (!ok) {
      try {
        PORT = '8080';
        const u = await attempt(HOST, PORT);
        out.notes.push(`Navigated (fallback) to ${u}`);
        ok = true;
      } catch {}
    }
    if (!ok) {
      // last resort: networkidle2 on default
      await page.goto(`http://${HOST}:5180/teleprompter_pro.html?ci=1`, { waitUntil: 'networkidle2', timeout: 20000 });
      try { out.url = `http://${HOST}:5180/teleprompter_pro.html?ci=1`; out.ci = true; } catch {}
      out.meta.target = { host: HOST, port: '5180', url: out.url };
      out.notes.push(`Navigated (last-resort) to ${out.url}`);
    }
  }
  await navigateWithFallback(page);
    try { const u0 = new URL(out.url); CURRENT_HOST = u0.hostname; } catch {}
    // wait a little for UI to settle
    await page.waitForTimeout(500);
    // Wait for app readiness (either custom event or marker)
    try {
      await page.evaluate(() => new Promise((resolve) => {
        const done = () => resolve(true);
        if (window.__tp_init_done) return resolve(true);
        try { window.addEventListener('tp:init:done', done, { once: true }); } catch {}
        setTimeout(done, 1500);
      }));
    } catch {}

    // gather candidate interactive elements (avoid file inputs, download anchors, and known problematic IDs)
    const blacklist = ['wrap-bg','autoTagBtn','downloadFile','uploadFileBtn','scriptSaveBtn','scriptSaveAsBtn','scriptLoadBtn','scriptDeleteBtn','scriptRenameBtn','resetScriptBtn'];
    const candidates = await page.evaluate((blacklist) => {
      const sel = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="checkbox"], input[type="submit"]'));
      return sel
        .filter(el => {
          if (!el.getBoundingClientRect) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 6 || r.height < 6) return false;
          if (el.tagName === 'INPUT' && el.type === 'file') return false;
          if (el.tagName === 'A' && el.hasAttribute('download')) return false;
          if (el.id && blacklist.includes(el.id)) return false;
          return true;
        })
    .map((el) => ({ tag: el.tagName, id: el.id || null, text: el.textContent && el.textContent.trim().slice(0,80) || null }))
        .slice(0,300);
    }, blacklist);
    out.notes.push(`Found ${candidates.length} candidate controls`);

    // Click them by id where possible
    for (const c of candidates) {
      try {
        if (!c.id) continue;
        await page.evaluate(id => { const el = document.getElementById(id); if (el) el.scrollIntoView({behavior:'instant', block:'center'}); }, c.id);
        // Try a safe click: use the element handle and click with delay
        const handle = await page.$('#' + c.id);
        if (!handle) continue;
        await handle.click({ delay: 60 }).catch(() => {});
        out.clicked.push({ id: c.id, text: maskText(c.text) });
        await page.waitForTimeout(300);
      } catch (err) {
        out.errors.push({ type: 'click', id: c.id, err: String(err) });
      }
    }

    // attempt to toggle a few checkboxes (use evaluate to avoid 'not clickable' issues)
    try {
      const boxCount = await page.evaluate(() => document.querySelectorAll('[type=checkbox]').length);
      for (let i = 0; i < boxCount && i < 6; i++) {
        try {
          const ok = await page.evaluate((idx) => {
            try {
              const boxes = Array.from(document.querySelectorAll('[type=checkbox]'));
              const el = boxes[idx];
              if (!el) return false;
              // toggle and emit change
              el.checked = !el.checked;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            } catch (e) {
              return { err: String(e) };
            }
          }, i);
          if (ok && ok.err) {
            out.errors.push({ type: 'checkbox', i, err: ok.err });
          } else if (ok) {
            out.clicked.push({ checkboxIndex: i });
          } else {
            out.errors.push({ type: 'checkbox', i, err: 'not-found' });
          }
          await page.waitForTimeout(120);
        } catch (err) {
          out.errors.push({ type: 'checkbox', i, err: String(err) });
        }
      }
    } catch (err) {
      out.errors.push({ type: 'checkbox-scan', err: String(err) });
    }

    await page.waitForTimeout(500);
    // collect file input metadata (hidden state / size / aria-label)
    try {
      const fileInputs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('input[type=file]')).map((el) => {
          const r = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            id: el.id || null,
            hidden: el.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden' || r.width < 6 || r.height < 6,
            width: Math.round(r.width),
            height: Math.round(r.height),
            ariaLabel: el.getAttribute('aria-label') || null,
          };
        })
      );
      out.fileInputs = fileInputs;
    } catch {
      out.fileInputs = [];
    }
    
    // Legend and render + additional probes
    try {
      // Ensure core elements exist before probing
      try { await page.waitForSelector('#script', { timeout: 5000 }); } catch {}
      try { await page.waitForSelector('#legend', { timeout: 5000 }); } catch {}
      await page.waitForTimeout(200);
      // Ensure long content for stability: load sample twice or inject if needed
      try {
        const el = await page.$('#loadSample');
        if (el) { await el.click(); await page.waitForTimeout(100); await el.click(); }
      } catch {}
  const probes = await page.evaluate(async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        // If line count is short, inject repeated content to reach >= 60 lines
        try {
          const scriptEl = document.querySelector('#script');
          const lines = scriptEl ? scriptEl.querySelectorAll('.line').length : 0;
          if (lines < 60) {
            const parts = [];
            for (let i=0;i<30;i++) parts.push(`[s1]Line ${i} from S1[/s1]`, `[s2]Line ${i} from S2[/s2]`);
            const long = parts.join('\n');
            const ed = document.getElementById('editor');
            if (ed) {
              ed.value = long;
              ed.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (typeof window.renderScript === 'function') window.renderScript(long);
            await sleep(200);
          }
        } catch {}
        const legendProbe = (function() {
          try {
            const items = Array.from(document.querySelectorAll('#legend .tag'));
            return items.slice(0, 6).map(el => {
              const dot = el.querySelector('.dot');
              const color = dot ? getComputedStyle(dot).backgroundColor : null;
              const txt = (el.textContent||'').trim();
              return { text: txt, color };
            });
          } catch { return []; }
        })();
        // Inject sample and try both input-driven and explicit render if available
        const sample = '[s1]\nHello from S1\n[/s1]\n[s2]\nWorld from S2\n[/s2]\n';
        try {
          const ed = document.getElementById('editor');
          if (ed) {
            ed.value = sample;
            ed.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (typeof window.renderScript === 'function') window.renderScript(sample);
        } catch {}
        await sleep(250);
        const renderProbe = (function(){
          try {
            const lines = Array.from(document.querySelectorAll('#script .line'));
            const texts = lines.map(el => (el.textContent||'').trim());
            const iHello = texts.findIndex(t => /Hello from S1/.test(t));
            const iWorld = texts.findIndex(t => /World from S2/.test(t));
            const cHello = iHello >= 0 ? getComputedStyle(lines[iHello]).color : null;
            const cWorld = iWorld >= 0 ? getComputedStyle(lines[iWorld]).color : null;
            return { lineCount: lines.length, iHello, iWorld, cHello, cWorld };
          } catch { return { lineCount: 0 } }
        })();
        const hudProbe = (function(){
          try {
            const isDevClass = document.documentElement.classList.contains('tp-dev');
            const hud = document.getElementById('hud-root');
            const hasHudChildren = !!(hud && hud.children && hud.children.length > 0);
            return { isDevClass, hasHudChildren };
          } catch { return { isDevClass: false, hasHudChildren: false } }
        })();
        // hotkeysProbe will be measured outside via page.keyboard to ensure trusted events
        const lateProbe = await (async function(){
          try {
            const viewer = document.getElementById('viewer');
            const marker = document.querySelector('#viewer .marker');
            if (!viewer) return { supported: false };
            // Ensure auto-scroll is ON and speed is reasonable
            try {
              const btn = document.getElementById('autoToggle');
              if (btn) {
                const txt = (btn.textContent||'');
                if (/Off/i.test(txt)) { btn.click(); }
              }
              const sp = document.getElementById('autoSpeed');
              if (sp) { sp.value = '30'; sp.dispatchEvent(new Event('input', { bubbles: true })); }
            } catch {}
            // Jump near bottom and sample for ~1.5s
            viewer.scrollTop = Math.max(0, viewer.scrollHeight - viewer.clientHeight) * 0.88;
            const samples = [];
            const jitter = [];
            const start = performance.now();
            let frames = 0;
            while (performance.now() - start < 1500) {
              await new Promise(r => requestAnimationFrame(r));
              frames++;
              samples.push(viewer.scrollTop);
              if (marker) jitter.push((marker.getBoundingClientRect().top|0));
            }
            const moves = samples.slice(1).filter((v,i) => v !== samples[i]).length;
            const approxFps = Math.min(60, Math.round(frames / 1.5));
            const jstdev = (arr) => { if (!arr.length) return 0; const m = arr.reduce((a,b)=>a+b,0)/arr.length; const v = arr.reduce((a,b)=>a + (b-m)*(b-m),0)/arr.length; return Math.sqrt(v); };
            const jitterStd = jstdev(jitter);
            const moved = moves > 3;
            return { supported: true, approxFps, jitterStd, moved };
          } catch { return { supported: false } }
        })();
        // Settings probe: ensure overlay opens and Media tab content renders basics
        const settingsProbe = await (async function(){
          try {
            const btn = document.getElementById('settingsBtn');
            if (btn) btn.click();
            await sleep(150);
            const body = document.getElementById('settingsBody');
            const tabs = document.querySelectorAll('#settingsTabs .settings-tab');
            const mediaTab = Array.from(tabs).find(t=>t && t.textContent && /media/i.test(t.textContent));
            if (mediaTab) { mediaTab.click(); await sleep(60); }
            const micSel = document.getElementById('settingsMicSel');
            const micLevel = document.querySelector('#settingsMicLevel i');
            const asrBtn = document.getElementById('asrCalibBtn');
            return { hasBody: !!body, tabs: (tabs && tabs.length) || 0, hasMedia: !!mediaTab, hasMicSel: !!micSel, hasMicLevel: !!micLevel, hasAsrCalibBtn: !!asrBtn };
          } catch { return { hasBody:false, tabs:0, hasMedia:false, hasMicSel:false, hasMicLevel:false }; }
        })();
        // OBS Test probe: find button, confirm data-action, and ensure pill appears after click
        const obsTestProbe = await (async function(){
          try {
            const sel = '#settingsObsTest, #obsTest, [data-action="obs-test"]';
            const btn = document.querySelector(sel);
            const hadPillBefore = !!(document.getElementById('obsStatusText') || document.getElementById('obsStatus'));
            const hasBtn = !!btn;
            const hasDataAction = !!(btn && btn.getAttribute && btn.getAttribute('data-action'));
            if (btn && btn.click) {
              btn.click();
              await sleep(50);
            }
            const hasPillAfter = !!(document.getElementById('obsStatusText') || document.getElementById('obsStatus'));
            const btnId = btn && btn.id || null;
            return { hasBtn, hasDataAction, hadPillBefore, hasPillAfter, btnId };
          } catch { return { hasBtn:false, hasDataAction:false, hadPillBefore:false, hasPillAfter:false } }
        })();
        return { legendProbe, renderProbe, hudProbe, lateProbe, settingsProbe, obsTestProbe };
      });
      out.legendProbe = probes.legendProbe;
      out.renderProbe = probes.renderProbe;
      out.hudProbe = probes.hudProbe;
      out.lateProbe = probes.lateProbe;
      out.settingsProbe = probes.settingsProbe;
      out.obsTestProbe = probes.obsTestProbe;

      // Hotkeys probe using trusted key events
      try {
        await page.bringToFront();
        // Prefer data-testid selectors but fallback to ids/classes
        const viewportSel = '[data-testid="script-viewport"]';
        const markerSel = '[data-testid="marker"]';
        try {
          const vp = await page.$(viewportSel);
          if (vp) { await vp.click({ delay: 20 }); }
          else { await page.click('#viewer', { delay: 20 }); }
        } catch {}
        const snap = async () => await page.evaluate((vpSel, mkSel) => {
          const vp = document.querySelector(vpSel) || document.getElementById('viewer');
          const mk = document.querySelector(mkSel) || document.querySelector('#viewer .marker');
          return {
            idx: (window.tp && window.tp.state && typeof window.tp.state.markerIndex === 'number') ? window.tp.state.markerIndex : null,
            top: mk ? (mk.getBoundingClientRect().top|0) : 0,
            st: vp ? vp.scrollTop : 0,
          };
        }, viewportSel, markerSel);
        const before = await snap();
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(100);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(100);
        const after = await snap();
        const moved = (after.idx != null && before.idx != null && after.idx !== before.idx)
                   || Math.abs(after.top - before.top) >= 8
                   || (after.st - before.st) >= 1;
        out.hotkeysProbe = { supported: true, before, after, ok: !!moved };
      } catch { out.hotkeysProbe = { supported: false }; }

      // Before asserting auto-scroll UI, re-ensure long content so the toggle doesn't immediately flip Off at end-of-scroll
      try {
        await page.evaluate(async () => {
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          try {
            const scriptEl = document.querySelector('#script');
            const lines = scriptEl ? scriptEl.querySelectorAll('.line').length : 0;
            if (lines < 60) {
              const parts = [];
              for (let i=0;i<30;i++) parts.push(`[s1]Line ${i} from S1[/s1]`, `[s2]Line ${i} from S2[/s2]`);
              const long = parts.join('\n');
              const ed = document.getElementById('editor');
              if (ed) {
                ed.value = long;
                ed.dispatchEvent(new Event('input', { bubbles: true }));
              }
              if (typeof window.renderScript === 'function') window.renderScript(long);
              await sleep(200);
            }
            // Reset scroll position to top to avoid immediate end-stop flipping the toggle back to Off
            try { const viewer = document.getElementById('viewer'); if (viewer) viewer.scrollTop = 0; } catch {}
          } catch {}
        });
      } catch {}

      // Auto-scroll UI assertion: ensure toggle flips to "On" when enabled
      try {
        const getTxt = async () => {
          try { return await page.$eval('#autoToggle', el => (el.textContent||'').trim()); } catch { return ''; }
        };
        const getChip = async () => {
          try { return await page.$eval('#autoChip', el => (el.textContent||'').trim()); } catch { return ''; }
        };
        const was = await getTxt();
        const chipBefore = await getChip();
        try { await page.$eval('#autoToggle', el => el.scrollIntoView({behavior:'instant', block:'center'})); } catch {}
        let now = was;
        if (/Off/i.test(was)) {
          for (let i=0;i<2;i++) {
            try { await page.click('#autoToggle', { delay: 20 }); } catch {}
            await page.waitForTimeout(150);
            now = await getTxt();
            if (/On/i.test(now)) break;
          }
        }
        const chipAfter = await getChip();
        // As a semantic fallback, treat it as OK if the viewport starts moving after toggle
        let moved = false;
        try {
          moved = await page.evaluate(async () => {
            const vp = document.getElementById('viewer');
            if (!vp) return false;
            const before = vp.scrollTop|0;
            // sample a few frames
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => setTimeout(r, 80));
            const after = vp.scrollTop|0;
            return after > before;
          });
        } catch {}
        out.autoScrollUi = { was, now, chipBefore, chipAfter, chipChanged: chipBefore !== chipAfter, ok: (/On/i.test(now) || moved) };
      } catch {}
    } catch (e) {
      out.notes.push('probes failed: ' + String(e && e.message || e));
    }
    // Embed build metadata
    try {
      out.meta.build = {
        gitSha: safeExec('git rev-parse HEAD'),
        branch: safeExec('git rev-parse --abbrev-ref HEAD'),
        buildTime: new Date().toISOString(),
      };
    } catch {}
    // Screenshot artifact
    try {
      const shotPath = path.join(__dirname, 'ui_crawl_screenshot.png');
      await page.screenshot({ path: shotPath, fullPage: true });
      out.screenshot = path.relative(process.cwd(), shotPath);
    } catch {}
    await browser.close();
  }catch(_e){ out.errors.push({ type:'fatal', message: String(_e) }); }
  const p = 'tools/ui_crawl_report.json';
  try { fs.writeFileSync(p, JSON.stringify(out,null,2)); } catch(e) { console.error('[UI-CRAWL] failed to write report:', String(e && e.message || e)); }
  console.log('[UI-CRAWL] Wrote', p);
  if (out.errors.length) process.exit(2);
  process.exit(0);
})();

// Mask volatile text segments to reduce diff noise
function maskText(t) {
  try {
    if (!t || typeof t !== 'string') return t;
    let s = t;
    s = s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<DATE>');
    s = s.replace(/\b[a-f0-9]{7,40}\b/gi, '<HASH>');
    s = s.replace(/dev-\d{8}/gi, '<BUILD>');
    return s;
  } catch { return t }
}
function safeExec(cmd) {
  try { return cp.execSync(cmd, { stdio: ['ignore','pipe','ignore'] }).toString().trim(); } catch { return null }
}
