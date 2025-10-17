#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const port = process.env.PORT || 8080;

  // Start the static server in-process
  console.log('[e2e] starting static server...');
  const server = require('./static_server.js');

  // Wait briefly for server to be ready (it's synchronous listen)
  const puppeteer = require('puppeteer');
  console.log('[e2e] launching browser...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    try {
      const text = msg.text();
      console.log('[PAGE]', text);
    } catch (e) {
      void e;
    }
  });

  const url = `http://127.0.0.1:${port}/teleprompter_pro.html`;
  console.log('[e2e] navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch((e) => {
    console.error('[e2e] page.goto error', e);
  });

  // Expose helper to call the TP scroll API
  async function scrollTo(y) {
    try {
      const v = Number(y) || 0;
      const ok = await page.evaluate((val) => {
        try {
          if (typeof tpScrollTo === 'function') {
            tpScrollTo(val);
            return true;
          }
          if (typeof window.tpScrollTo === 'function') {
            window.tpScrollTo(val);
            return true;
          }
          // fallback: set scrollTop directly on the main wrapper
          const sc =
            window.__TP_SCROLLER ||
            document.getElementById('viewer') ||
            document.scrollingElement ||
            document.documentElement ||
            document.body;
          if (sc) {
            sc.scrollTop = val | 0;
            return true;
          }
          return false;
        } catch (e) {
          return String(e);
        }
      }, v);
      console.log('[e2e] scrollTo ->', ok);
    } catch (e) {
      console.error('[e2e] scrollTo error', e);
    }
  }

  // Interactive CLI
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('[e2e] ready. Commands: scroll <y>, eval <js>, exit');
  rl.on('line', async (line) => {
    const t = (line || '').trim();
    if (!t) return;
    if (t === 'exit' || t === 'quit') {
      try {
        await browser.close();
      } catch (e) {
        void e;
      }
      try {
        server.close();
      } catch (e) {
        void e;
      }
      rl.close();
      process.exit(0);
      return;
    }
    if (t.startsWith('scroll ')) {
      const arg = t.slice(7).trim();
      await scrollTo(arg);
      return;
    }
    if (t.startsWith('eval ')) {
      const code = t.slice(5);
      try {
        const res = await page.evaluate(new Function(code));
        console.log('[eval]', res);
      } catch (e) {
        console.error('[eval error]', e);
      }
      return;
    }
    console.log('unknown command');
  });
}

main().catch((e) => {
  console.error('e2e runner error', e);
  process.exit(1);
});
