#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const port = process.env.PORT || 8080;

  const argv = process.argv.slice(2);
  const flags = new Map(argv.flatMap((a, i) =>
    a.startsWith('--') ? [[a.toLowerCase(), argv[i + 1] && !String(argv[i + 1]).startsWith('--') ? argv[i + 1] : true]] : []
  ));
  const HEADLESS = flags.has('--headless') || process.env.HEADLESS === '1';
  const RUN_SMOKE = flags.has('--runsmoke') || process.env.RUN_SMOKE === '1';

  const OBS_HOST = flags.get('--obshost') || process.env.OBS_HOST || '127.0.0.1';
  const OBS_PORT = Number(flags.get('--obsport') || process.env.OBS_PORT || 4455);
  const OBS_PASS = flags.get('--obspass') || process.env.OBS_PASS || '';
  const STUB_OBS = flags.has('--stubobs') || process.env.STUB_OBS === '1';

  // Start the static server in-process
  console.log('[e2e] starting static server...');
  const server = require('./static_server.js');

  // Wait briefly for server to be ready (it's synchronous listen)
  const puppeteer = require('puppeteer');
  console.log('[e2e] launching browser...');
  const isHeadless = HEADLESS === true || HEADLESS === '1' || HEADLESS === 1 || HEADLESS === undefined || HEADLESS === null ? true : Boolean(HEADLESS);
  const browser = await puppeteer.launch({ headless: isHeadless, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    try {
      const args = msg.args && msg.args().length ? ' ' + msg.args().map((a) => String(a)).join(' ') : '';
      console.log(`[page:${msg.type()}] ${msg.text()}${args}`);
    } catch (e) {
      try { console.log('[page] (console) ', msg.text()); } catch (e2) { /* ignore */ }
    }
  });

  const url = `http://127.0.0.1:${port}/teleprompter_pro.html`;
  // Prepare injection of config and optional stub before the page runs any scripts
  await page.evaluateOnNewDocument((cfg) => {
    try {
      window.__OBS_CFG__ = { host: cfg.host, port: cfg.port, password: cfg.pass };
      if (cfg.stub) {
        const RealWS = window.WebSocket;
        const sent = [];
        class StubWS {
          constructor(url) {
            this.url = url;
            this.readyState = 1;
            this._sent = sent;
            // fire open, then simulate a server HELLO (op:0) so the adapter will attempt IDENTIFY
            setTimeout(() => {
              try { this.onopen && this.onopen({}); } catch (e) { /* ignore */ }
              try {
                // small delay before sending HELLO
                setTimeout(() => {
                  try {
                    const hello = JSON.stringify({ op: 0, d: { authentication: { salt: 'stub-salt', challenge: 'stub-chal' } } });
                    this.onmessage && this.onmessage({ data: hello });
                  } catch (e2) { /* ignore */ }
                }, 20);
              } catch (e3) { /* ignore */ }
            }, 10);
          }
          send(data) {
            try { sent.push(data); } catch (e) { /* ignore */ }
            try { this.onmessage && this.onmessage({ data: JSON.stringify({ op: 'echo', d: data }) }); } catch (e) { /* ignore */ }
          }
          close() { this.readyState = 3; this.onclose && this.onclose({}); }
          addEventListener(type, cb) { this['on' + type] = cb; }
          removeEventListener(type) { this['on' + type] = null; }
        }
        window.WebSocket = StubWS;
        window.__WS_SENT__ = sent;
        window.__WS_RESTORE__ = () => { window.WebSocket = RealWS; };
      }
    } catch (e) {
      // ignore injection errors
    }
  }, { host: OBS_HOST, port: OBS_PORT, pass: OBS_PASS, stub: STUB_OBS });

  console.log('[e2e] navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch((e) => {
    console.error('[e2e] page.goto error', e);
  });

  if (RUN_SMOKE) {
    console.log('[e2e] running non-interactive smoke test...');

    // generic waitFor with exponential backoff
    async function waitFor(fn, opts = {}) {
      const timeout = opts.timeout || 25000;
      let delay = opts.startDelay || 100;
      const factor = opts.factor || 1.4;
      const maxDelay = opts.max || 1200;
      const start = Date.now();
      let lastErr = null;
      while (Date.now() - start < timeout) {
        try {
          const v = await fn();
          if (v) return v;
        } catch (e) {
          lastErr = e;
        }
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(maxDelay, Math.floor(delay * factor));
      }
      throw lastErr || new Error('waitFor timeout');
    }

    // 1) Wait for app boot
    await waitFor(() => page.evaluate(() => !!(window.Teleprompter || window.App || window.__tpBootFinished || window.__recorder)), { timeout: 15000 }).catch(() => null);

    // 2) Wait for recorder/adapter registered (or handshake logs)
    const recorderReady = await waitFor(() => page.evaluate(() => {
      try {
        const r = window.__recorder || (window.App && window.App.recorder);
        if (r && (r.isReady || r.ready)) return true;
        if (Array.isArray(window.__obsHandshakeLog) && window.__obsHandshakeLog.length) return true;
        return false;
      } catch (e) { return false; }
    }), { timeout: 15000 }).catch(() => false);

    // 3) run in-page helper if present and gather logs
    const result = await page.evaluate(async () => {
      try {
        const run = window.__tpRunObsTest || (window.tp && window.tp.runObsTest) || (window.App && window.App.tests && window.App.tests.runObsTest);
        let ok = false;
        let detail = 'no helper present';
        if (typeof run === 'function') {
          try {
            const r = await run();
            // If helper returns nothing (void), treat execution without exception as success.
            if (typeof r === 'undefined') {
              ok = true;
              detail = 'helper-executed-no-return';
            } else {
              ok = !!(r?.ok ?? r === true);
              detail = r?.detail || (r?.result ? 'helper-return' : (ok ? 'ok' : 'failed'));
            }
          } catch (e) {
            ok = false;
            detail = 'helper-throw: ' + (e?.message || String(e));
          }
        }
        return {
          ok,
          detail,
          handshakeLog: window.__obsHandshakeLog || [],
          obsLog: window.__obsLog || [],
          wsSent: window.__WS_SENT__ || [],
          recorderPresent: !!window.__recorder
        };
      } catch (e) {
        return { ok: false, detail: 'evaluate error: ' + String(e), handshakeLog: [], obsLog: [], wsSent: [], recorderPresent: false };
      }
    });

    const report = {
      ok: !!result.ok,
      recorderReady: !!recorderReady || !!result.recorderPresent,
      detail: result.detail,
      handshakeLogCount: (result.handshakeLog && result.handshakeLog.length) || 0,
      obsLogTail: (result.obsLog && result.obsLog.slice(-10)) || [],
      wsSentCount: (result.wsSent && result.wsSent.length) || 0
    };

    console.log('[SMOKE-REPORT]', JSON.stringify(report));

    try { await browser.close(); } catch (e) { void e; }
    try { server.close(); } catch (e) { void e; }

    process.exit(report.ok ? 0 : 2);
  }

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
