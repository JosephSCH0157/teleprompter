#!/usr/bin/env node
const puppeteer = require('puppeteer');
const fs = require('fs');
(async function main(){
  const out = { clicked: [], errors: [], console: [], notes: [] };
  try{
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    page.on('console', msg => {
      try {
        const loc = msg.location ? msg.location() : {};
        out.console.push({ type: msg.type(), text: msg.text(), location: loc });
      } catch (err) {
        out.console.push({ type: 'console', text: msg.text() });
      }
    });
  page.on('pageerror', err => { out.errors.push({ type: 'pageerror', message: String(err), stack: err && err.stack ? err.stack : null }); });
    page.on('response', res => {
      if (res.status() >= 400) out.errors.push({ type: 'response', url: res.url(), status: res.status() });
    });
  // start static server in-process so the page is reachable
  try { require('./static_server.js'); } catch (e) { /* ignore */ }

    try { require('./static_server.js'); } catch (e) { /* ignore */ }

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
      }catch(e){}
    }, { url: 'ws://127.0.0.1:4455', password: '' });

    await page.goto('http://127.0.0.1:8080/teleprompter_pro.html', { waitUntil: 'networkidle2', timeout: 30000 });
    // wait a little for UI to settle
    await page.waitForTimeout(1000);

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

    // attempt to toggle a few checkboxes
    try {
      const boxes = await page.$$('[type=checkbox]');
      for (let i=0;i<boxes.length && i<6;i++){
        try { await boxes[i].click({ delay: 40 }); out.clicked.push({ checkboxIndex: i }); await page.waitForTimeout(120); } catch(err){ out.errors.push({ type:'checkbox', i, err:String(err) }); }
      }
    } catch(err){ out.errors.push({ type:'checkbox-scan', err:String(err) }); }

    await page.waitForTimeout(500);
    await browser.close();
  }catch(e){ out.errors.push({ type:'fatal', message: String(e) }); }
  const p = 'tools/ui_crawl_report.json'; fs.writeFileSync(p, JSON.stringify(out,null,2));
  console.log('[UI-CRAWL] Wrote', p);
  if (out.errors.length) process.exit(2);
  process.exit(0);
})();
