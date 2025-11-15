#!/usr/bin/env node
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  try {
    // Start static server on a deterministic port
    process.env.PORT = process.env.PORT || '5181';
    const server = require('./static_server.js');

    const url = `http://127.0.0.1:${process.env.PORT}/teleprompter_pro.html?uiMock=1&ci=1`;
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // Capture page console for debugging
    page.on('console', (msg) => {
      try { console.log('[page]', msg.type(), msg.text()); } catch {}
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Force-load the production bundle to avoid dev TS import issues under static server
    try {
      await page.addScriptTag({ type: 'module', content: "import('/dist/index.js')" });
    } catch {}

    // Wait for editor to exist
    await page.waitForSelector('#editor', { timeout: 10000 });

    // Wait for core UI binder to attach capture-phase listeners
    await page.waitForFunction(() => {
      try { return !!(window).__tpCoreUiBound; } catch { return false; }
    }, { timeout: 5000 }).catch(() => {});

    // Trigger Ctrl/Cmd+O via a synthetic keydown on window (capture-phase listener)
    await page.evaluate(() => {
      try {
        const ev = new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true });
        window.dispatchEvent(ev);
      } catch {}
    });

    // Expect mock upload text to appear (DEV uiMock path)
    const ok = await page.waitForFunction(() => {
      const ed = document.querySelector('#editor');
      if (!ed) return false;
      const text = 'value' in ed ? ed.value : (ed.textContent || '');
      return /CI upload OK/i.test(String(text));
    }, { timeout: 5000 }).then(() => true).catch(() => false);

    await browser.close().catch(() => {});
    try { server.close(); } catch {}

    if (!ok) {
      console.error('[hotkey-load] FAIL: expected editor to contain "CI upload OK" after Ctrl+O');
      process.exit(1);
    }
    console.log('[hotkey-load] PASS: Ctrl+O triggered resilient load (mock upload)');
    process.exit(0);
  } catch (e) {
    console.error('[hotkey-load] ERROR', e);
    process.exit(1);
  }
})();
