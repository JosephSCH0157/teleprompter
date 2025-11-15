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

    // Wait for editor to exist
    await page.waitForSelector('#editor', { timeout: 10000 });

    // Give binder a brief moment to attach capture-phase listeners
    await page.waitForTimeout(300);

    // Press Ctrl+O to trigger our resilient load flow
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyO');
    await page.keyboard.up('Control');

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
