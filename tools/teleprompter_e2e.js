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
  // Inject OBS config and a robust WebSocket proxy before any page scripts run.
  await page.evaluateOnNewDocument((cfg) => {
    try { globalThis.__OBS_CFG__ = { host: cfg.host, port: cfg.port, password: cfg.pass }; } catch (e) { /* ignore */ }
    try {
      if (cfg.stub) {
        (function () {
          try {
            const SENT = (globalThis.__WS_SENT__ = globalThis.__WS_SENT__ || []);
            const OPENED = (globalThis.__WS_OPENED__ = globalThis.__WS_OPENED__ || []);
            const RealWS = globalThis.WebSocket;
            if (!RealWS || RealWS.__patched_for_smoke__) return;

            class WSProxy extends RealWS {
              constructor(url, protocols) {
                super(url, protocols);
                try {
                  this.addEventListener('open', () => {
                    try { OPENED.push({ t: Date.now(), url }); } catch (e) {}
                    try {
                      // simulate server HELLO so clients IDENTIFY
                      this.onmessage && this.onmessage({ data: JSON.stringify({ op: 0, d: { authentication: { salt: 'stub-salt', challenge: 'stub-chal' } } }) });
                    } catch (e) {}
                  });
                } catch (e) {}
              }
              send(data) {
                try { SENT.push(typeof data === 'string' ? data : String(data)); } catch (e) {}
                try { return super.send(data); } catch (e) { return; }
              }
            }
            WSProxy.__patched_for_smoke__ = true;
            globalThis.WebSocket = WSProxy;
          } catch (e) { /* ignore */ }
        })();
      }
    } catch (e) { /* ignore */ }
  }, { host: OBS_HOST, port: OBS_PORT, pass: OBS_PASS, stub: STUB_OBS });

  console.log('[e2e] navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch((e) => {
    console.error('[e2e] page.goto error', e);
  });

  if (RUN_SMOKE) {
    console.log('[e2e] running non-interactive smoke test...');

    // drive init -> connect -> test -> report inside the page to keep adapter context local
    const smoke = await page.evaluate(async () => {
      const T0 = Date.now();
      const report = {
        ok: false,
        tBootMs: 0,
        recorderReady: false,
        adapterReady: false,
        testRan: false,
        wsSentCount: 0,
        wsOps: [],
        notes: [],
      };

      const now = () => Date.now();
      const backoffWait = async (cond, { start = 50, max = 800, limit = 10 } = {}) => {
        let d = start;
        for (let i = 0; i < limit; i++) {
          try {
            if (await cond()) return true;
          } catch (e) {
            // ignore
          }
          await new Promise((r) => setTimeout(r, d));
          d = Math.min(max, d * 2);
        }
        return false;
      };

      const OBS_CFG = globalThis.__OBS_CFG__ ?? null;

      const okBoot = await backoffWait(async () => {
        return !!(globalThis.__recorder || globalThis.App?.recorder);
      }, { start: 50, max: 500, limit: 12 });

      report.tBootMs = now() - T0;
      if (!okBoot) {
        report.notes.push('Recorder not found after backoff.');
        return report;
      }

      const rec = globalThis.__recorder || globalThis.App?.recorder;
      report.recorderReady = !!rec;

      try {
        if (rec?.initBuiltIns) {
          await rec.initBuiltIns();
          report.notes.push('initBuiltIns() ok');
        }
      } catch (e) {
        report.notes.push('initBuiltIns err: ' + String(e));
      }

      const obs = rec?.getAdapter?.('obs') || rec?.adapters?.obs || globalThis.obs || globalThis.App?.obs || null;
      report.adapterReady = !!obs;
      if (!obs) {
        report.notes.push('OBS adapter not found.');
        return report;
      }

      try {
        if (OBS_CFG && typeof obs.configure === 'function') {
          await obs.configure(OBS_CFG);
          report.notes.push('obs.configure() applied');
        }
      } catch (e) {
        report.notes.push('configure err: ' + String(e));
      }

      const sent = (globalThis.__WS_SENT__ ||= []);
      const hlog = (globalThis.__obsHandshakeLog ||= []);
      const beforeCount = sent.length;

      try {
        if (typeof obs.connect === 'function') {
          await obs.connect();
          report.notes.push('obs.connect() ok');
        }
      } catch (e) {
        report.notes.push('connect err: ' + String(e));
      }

      try {
        if (typeof obs.test === 'function') {
          await obs.test();
          report.testRan = true;
          report.notes.push('obs.test() ok');
        } else {
          report.notes.push('obs.test() not present');
        }
      } catch (e) {
        report.notes.push('test err: ' + String(e));
      }

      const afterCount = sent.length;
      report.wsSentCount = Math.max(0, afterCount - beforeCount);
      report.wsOps = sent.slice(-report.wsSentCount).map((m) => {
        try {
          const j = typeof m === 'string' ? JSON.parse(m) : m;
          return j?.op ?? j?.opcode ?? 'unknown';
        } catch {
          return 'raw';
        }
      });

      report.ok = report.recorderReady && report.adapterReady && (report.testRan || report.wsSentCount > 0);
      if (Array.isArray(hlog) && hlog.length) report.notes.push(`handshakeLog[${hlog.length}]`);
      return report;
    });

    console.log('[SMOKE-REPORT] ' + JSON.stringify(smoke));
    try { await browser.close(); } catch (e) { void e; }
    try { server.close(); } catch (e) { void e; }
    process.exit(smoke.ok ? 0 : 2);
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
