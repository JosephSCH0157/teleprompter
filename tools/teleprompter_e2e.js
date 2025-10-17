#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const port = process.env.PORT || 8080;

  const argv = process.argv.slice(2);
  const runSmoke = argv.find((a) => /^--runsmoke$/i.test(a));
  const stubObs = argv.find((a) => /^--stubObs$/i.test(a) || /^--stubobs$/i.test(a));

  // OBS connection overrides: env or CLI
  // env: OBS_HOST, OBS_PORT, OBS_PASS
  const cliGet = (long, short) => {
    const v = argv.find((a) => a.startsWith(`--${long}=`));
    if (v) return v.split('=')[1];
    if (short) {
      const s = argv.find((a) => a.startsWith(`-${short}=`));
      if (s) return s.split('=')[1];
    }
    return undefined;
  };
  const obsHost = cliGet('obsHost') || process.env.OBS_HOST || '127.0.0.1';
  const obsPort = cliGet('obsPort') || process.env.OBS_PORT || '4455';
  const obsPass = cliGet('obsPass') || process.env.OBS_PASS || process.env.OBS_PASSWORD || '';

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

  if (runSmoke) {
    // Non-interactive smoke path: wait for page init, gather OBS handshake logs,
    // call page test helper if available, and exit with status 0.
    console.log('[e2e] running non-interactive smoke test...');
    // Optional: inject stub WebSocket before any script runs
    if (stubObs) {
      console.log('[e2e] injecting WebSocket stub into page');
      await page.evaluateOnNewDocument(() => {
        // Basic shim that records messages sent to the server
        window.__wsStub = { sent: [], opened: true };
        class StubWebSocket {
          constructor(url) {
            this.url = url;
            this.readyState = 1; // OPEN
            window.__wsStub.opened = true;
            this.send = (data) => {
              try {
                window.__wsStub.sent.push(data);
              } catch (e) {
                // ignore
              }
            };
            this.close = () => { this.readyState = 3; };
            // minimal event handler support
            this.addEventListener = () => {};
            this.removeEventListener = () => {};
          }
        }
        window.WebSocket = StubWebSocket;
      });
    }

    // Wait for app boot and adapter registration using exponential backoff up to ~30s
    const maxWaitMs = 30000;
    const start = Date.now();
    let attempt = 0;
    let recorderPresent = false;
    while (Date.now() - start < maxWaitMs) {
      attempt += 1;
      // check for recorder or debug token
      recorderPresent = await page.evaluate(() => !!window.__recorder);
      if (recorderPresent) break;
      const waitMs = Math.min(1000 * Math.pow(2, Math.min(attempt, 5)), 5000);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    // Collect logs: handshake log, adapter log, and console buffer
    const handshakeLog = await page.evaluate(() => {
      try {
        return Array.isArray(window.__obsHandshakeLog) ? window.__obsHandshakeLog : (window.__obsHandshakeLog ? [window.__obsHandshakeLog] : []);
      } catch (e) {
        return [`err:${String(e)}`];
      }
    });

    const obsLog = await page.evaluate(() => {
      try { return window.__obsLog || []; } catch (e) { return [`err:${String(e)}`]; }
    });

    // Grab console messages captured by the runner (assumes page console logged earlier)
    // Note: we already log page console to stdout; retrieve any page-held console buffer if present
    const pageConsoleBuffer = await page.evaluate(() => window.__pageConsoleBuffer || []);

    console.log('[e2e] handshakeLog:', handshakeLog);
    console.log('[e2e] obsLog tail:', obsLog.slice(-20));
    console.log('[e2e] pageConsoleBuffer tail:', pageConsoleBuffer.slice(-20));

    // Set OBS config in-page if recorder exposes a configure API
    try {
      await page.evaluate((h, p, pass) => {
        try {
          if (window.__recorder && typeof window.__recorder.configure === 'function') {
            window.__recorder.configure({ host: h, port: Number(p), password: pass });
            return true;
          }
        } catch (e) {
          return String(e);
        }
        return false;
      }, obsHost, obsPort, obsPass);
    } catch (e) {
      // ignore
    }

    // If the page exposes the test helper, call it and capture return
    const hasHelper = await page.evaluate(() => typeof window.__tpRunObsTest === 'function');
    let helperRes = null;
    if (hasHelper) {
      console.log('[e2e] invoking window.__tpRunObsTest()...');
      helperRes = await page.evaluate(() => {
        try {
          const p = window.__tpRunObsTest();
          if (p && typeof p.then === 'function') return p.then((r) => ({ok: true, result: r})).catch((e) => ({ok: false, error: String(e)}));
          return {ok: true, result: p};
        } catch (e) {
          return {ok: false, error: String(e)};
        }
      });
      console.log('[e2e] __tpRunObsTest result:', helperRes);
    } else {
      console.log('[e2e] page test helper window.__tpRunObsTest() not present');
    }

    // If stub mode is active, capture WebSocket stub messages
    let wsStub = null;
    if (stubObs) {
      wsStub = await page.evaluate(() => {
        try { return window.__wsStub || null; } catch (e) { return { err: String(e) }; }
      });
      console.log('[e2e] wsStub:', wsStub && wsStub.sent ? wsStub.sent.slice(-50) : wsStub);
    }

    // Prepare JSON summary
    const summary = {
      timestamp: new Date().toISOString(),
      recorderPresent: !!recorderPresent,
      handshakeLog: handshakeLog,
      obsLogTail: obsLog.slice(-200),
      pageConsoleTail: pageConsoleBuffer.slice(-200),
      helperRes: helperRes,
      wsStub: wsStub,
      obsConfig: { host: obsHost, port: obsPort, passProvided: !!obsPass }
    };

    console.log('[e2e] JSON_SUMMARY:', JSON.stringify(summary));

    // Exit with code 0 if helper returned ok or if wsStub recorded activity in stub mode
    let exitCode = 1;
    if ((helperRes && helperRes.ok) || (stubObs && wsStub && Array.isArray(wsStub.sent) && wsStub.sent.length > 0)) exitCode = 0;

    try { await browser.close(); } catch (e) { void e; }
    try { server.close(); } catch (e) { void e; }
    process.exit(exitCode);
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
