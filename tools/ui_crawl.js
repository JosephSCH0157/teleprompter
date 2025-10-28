#!/usr/bin/env node
const puppeteer = require('puppeteer');
const fs = require('fs');
(async function main(){
  const out = { clicked: [], errors: [], console: [], notes: [] };
  try{
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    page.on('console', msg => {
      try {
        const loc = msg.location ? msg.location() : {};
        out.console.push({ type: msg.type(), text: msg.text(), location: loc });
      } catch {
        out.console.push({ type: 'console', text: msg.text() });
      }
    });
  page.on('pageerror', err => { out.errors.push({ type: 'pageerror', message: String(err), stack: err && err.stack ? err.stack : null }); });
    page.on('response', res => {
      if (res.status() >= 400) out.errors.push({ type: 'response', url: res.url(), status: res.status() });
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
    };
    let ok = false;
    try {
      await attempt(HOST, PORT);
      ok = true;
    } catch {}
    if (!ok) {
      try {
        PORT = '8080';
        await attempt(HOST, PORT);
        ok = true;
      } catch {}
    }
    if (!ok) {
      // last resort: networkidle2 on default
      await page.goto(`http://${HOST}:5180/teleprompter_pro.html?ci=1`, { waitUntil: 'networkidle2', timeout: 20000 });
      try { out.url = `http://${HOST}:5180/teleprompter_pro.html?ci=1`; out.ci = true; } catch {}
    }
  }
  await navigateWithFallback(page);
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
        out.clicked.push({ id: c.id, text: c.text });
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
    
    // Legend and render probes
    try {
      // Ensure core elements exist before probing
      try { await page.waitForSelector('#script', { timeout: 5000 }); } catch {}
      try { await page.waitForSelector('#legend', { timeout: 5000 }); } catch {}
      await page.waitForTimeout(200);
      const probes = await page.evaluate(async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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
        return { legendProbe, renderProbe };
      });
      out.legendProbe = probes.legendProbe;
      out.renderProbe = probes.renderProbe;
    } catch (e) {
      out.notes.push('probes failed: ' + String(e && e.message || e));
    }
    await browser.close();
  }catch(_e){ out.errors.push({ type:'fatal', message: String(_e) }); }
  const p = 'tools/ui_crawl_report.json';
  try { fs.writeFileSync(p, JSON.stringify(out,null,2)); } catch(e) { console.error('[UI-CRAWL] failed to write report:', String(e && e.message || e)); }
  console.log('[UI-CRAWL] Wrote', p);
  if (out.errors.length) process.exit(2);
  process.exit(0);
})();
