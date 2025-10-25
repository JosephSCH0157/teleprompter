#!/usr/bin/env node
const puppeteer = require('puppeteer');
const fs = require('fs');
(async function main(){
  const out = { ok: false, errors: [], console: [], saved: null };
  try{
    // start local static server if present
    try { require('./static_server.js'); } catch {}

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    page.on('console', msg => {
      try {
        const loc = msg.location ? msg.location() : {};
        out.console.push({ type: msg.type(), text: msg.text(), location: loc });
      } catch (e) {
        out.console.push({ type: 'console', text: msg.text() });
      }
    });
    page.on('pageerror', err => { out.errors.push({ type: 'pageerror', message: String(err), stack: err && err.stack ? err.stack : null }); });

    await page.goto('http://127.0.0.1:8080/teleprompter_pro.html', { waitUntil: 'networkidle2', timeout: 30000 });
    // wait a little for UI to settle
    await page.waitForTimeout(800);

    // ensure required elements exist
    const ids = ['editor','scriptTitle','scriptSaveAsBtn','scriptSaveBtn','scriptSlots'];
    const missing = await page.evaluate((ids) => ids.filter(id => !document.getElementById(id)).map(id=>id), ids);
    if (missing.length) throw new Error('Missing required UI elements: ' + missing.join(','));

    // create unique title and content
    const title = 'CI-test-' + Date.now().toString(36);
    const content = 'Test script content ' + Math.random().toString(36).slice(2);

    // populate editor and title
    await page.evaluate(({title,content}) => {
      const e = document.getElementById('editor');
      const t = document.getElementById('scriptTitle');
      if (e) e.value = content;
      if (t) t.value = title;
      // trigger input event handlers
      try { if (e) e.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    }, { title, content });

    // click Save As
    await page.click('#scriptSaveAsBtn');
    await page.waitForTimeout(600);

    // read localStorage key
    const saved = await page.evaluate(() => {
      try { return localStorage.getItem('tp_scripts_v1'); } catch (e) { return { __err: String(e) }; }
    });
    out.saved = saved;

    // basic checks
    if (!saved) throw new Error('tp_scripts_v1 not present in localStorage after save');
    let parsed = null;
    try { parsed = JSON.parse(saved); } catch (e) { throw new Error('tp_scripts_v1 parse failed: ' + String(e)); }
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('tp_scripts_v1 does not contain saved scripts');
    const found = parsed.find(s => s.title === title || (s && s.content && s.content.indexOf('Test script content') >= 0));
    if (!found) throw new Error('Saved script not found in storage');

    // ensure no error-level console messages
    const errors = out.console.filter(c => c.type === 'error' || c.type === 'warning');
    if (errors.length) {
      out.errors.push({ type: 'console', items: errors });
    }

    out.ok = out.errors.length === 0;
    await browser.close();
  }catch(e){ out.errors.push({ type:'fatal', message: String(e), stack: e && e.stack ? e.stack : null }); }
  const p = 'tools/test_save_ci_report.json'; fs.writeFileSync(p, JSON.stringify(out,null,2));
  console.log('[SAVE-CI] Wrote', p);
  if (out.ok) process.exit(0); process.exit(2);
})();
