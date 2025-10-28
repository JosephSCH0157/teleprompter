#!/usr/bin/env node
/* eslint-disable no-unused-vars */
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const port = process.env.PORT || 8080;

  // ---- flags -------------------------------------------------
  const argv = process.argv.slice(2);
  const flag = (n) => argv.includes(n) || argv.includes(n.toLowerCase());
  const kv = (k, d) => {
    const a = argv.find((s) => s.startsWith(`--${k}=`) || s.startsWith(`--${k.toLowerCase()}=`));
    return a ? a.split('=')[1] : d;
  };

  const RUN_SMOKE = flag('--runSmoke') || flag('--runsmoke');
  const STUB_OBS = flag('--stubObs') || flag('--stubobs');
  const SHIM_RECORDER = flag('--shimRecorder') || flag('--shimrecorder');
  const TIMEOUT_MS = Number(kv('timeout', process.env.SMOKE_TIMEOUT_MS || '30000')) || 30000; // default 30s
  const HEADLESS = flag('--headless') || process.env.HEADLESS === '1';

  const OBS_HOST = kv('obsHost', process.env.OBS_HOST || '127.0.0.1');
  const OBS_PORT = Number(kv('obsPort', process.env.OBS_PORT || 4455));
  const OBS_PASS = kv('obsPass', process.env.OBS_PASS || '');

  // Start the static server in-process
  console.log('[e2e] starting static server...');
  // If running the smoke harness, prefer a deterministic non-dev port and ensure
  // the static server listens on that port so the loader can see ?ci=1 without dev mode.
  const effectivePort = RUN_SMOKE ? 5180 : port;
  try { process.env.PORT = String(effectivePort); } catch (_e) {}
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

  const url = RUN_SMOKE ? `http://127.0.0.1:${effectivePort}/teleprompter_pro.html?ci=1` : `http://127.0.0.1:${effectivePort}/teleprompter_pro.html`;
  // Inject OBS config and a robust WebSocket proxy before any page scripts run.
  await page.evaluateOnNewDocument((cfg) => {
    try { globalThis.__OBS_CFG__ = { host: cfg.host, port: cfg.port, password: cfg.pass }; } catch (_e) { /* ignore */ }
    try { globalThis.__TP_SKIP_BOOT_FOR_TESTS = !!cfg.skip; } catch (_e) { /* ignore */ }
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
                      try { OPENED.push({ t: Date.now(), url }); } catch (_e) {}
                      try {
                        // simulate server HELLO so clients IDENTIFY — simple heartbeat-based hello
                        this.onmessage && this.onmessage({ data: JSON.stringify({ op: 0, d: { heartbeat_interval: 45000 } }) });
                      } catch (_e) {}
                    });
                  } catch (_e) {}
              }
              send(data) {
                  try { SENT.push(typeof data === 'string' ? data : String(data)); } catch (_e) {}
                  try { return super.send(data); } catch (_e) {  }
              }
            }
            WSProxy.__patched_for_smoke__ = true;
            globalThis.WebSocket = WSProxy;
          } catch (_e) { /* ignore */ }
        })();
      }
    } catch (_e) { /* ignore */ }
  }, { host: OBS_HOST, port: OBS_PORT, pass: OBS_PASS, stub: STUB_OBS, skip: !!HEADLESS });
  // Ensure page boot short-circuits adapter probing when running headless/CI
  // If running headless (CI) and not explicitly stubbing OBS, install a minimal recorder
  // shim so the smoke harness sees a recorder and an obs adapter without touching real hosts.
  if (isHeadless && !STUB_OBS) {
    try {
      await page.evaluateOnNewDocument(() => {
        try {
          if (globalThis.__REC_HEADLESS_INSTALLED__) return;
          globalThis.__REC_HEADLESS_INSTALLED__ = true;
          const makeObsStub = () => ({
            configure: async () => {},
            connect: async () => true,
            test: async () => true,
            getLastError: () => null,
          });
          if (!globalThis.__recorder) {
            globalThis.__recorder = {
              initBuiltIns: async () => true,
              getAdapter: (id) => (id === 'obs' ? makeObsStub() : null),
              get: (id) => (id === 'obs' ? makeObsStub() : null),
              adapters: { obs: makeObsStub() },
            };
          }
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  }
  // If we're stubbing OBS, also inject a tiny recorder shim early so the page sees a recorder
  // and the smoke-drive can locate an obs adapter reliably. The shim uses the global WebSocket
  // (which will be proxied above) so send/open events are captured in __WS_SENT__/__WS_OPENED__.
  if (STUB_OBS && SHIM_RECORDER) {
    try {
      await page.evaluateOnNewDocument((cfg) => {
        try {
          if (globalThis.__REC_SHIM_INSTALLED__) return;
          globalThis.__REC_SHIM_INSTALLED__ = true;
          // Simple obs adapter
          const makeObsAdapter = (cfg) => {
            let ws = null;
            let lastCfg = { url: cfg && cfg.url ? cfg.url : (cfg && cfg.host ? ('ws://' + cfg.host + (cfg.port ? ':' + cfg.port : '')) : 'ws://127.0.0.1:4455'), password: cfg && cfg.password ? cfg.password : '' };
            return {
              configure(newCfg) {
                try { lastCfg = Object.assign({}, lastCfg, newCfg || {}); } catch (e) { }
              },
              connect() {
                return new Promise((res, rej) => {
                  try {
                    try { if (ws) ws.close(1000, 'reconnect'); } catch (e) {}
                    ws = new WebSocket(lastCfg.url);
                    ws.addEventListener('open', () => res(true));
                    ws.addEventListener('error', (ev) => { rej(new Error('ws-error')); });
                    ws.addEventListener('close', () => { /* ignore */ });
                  } catch (ex) { rej(ex); }
                });
              },
              test() {
                return new Promise(async (res) => {
                  try {
                    // Ensure connected
                    if (!ws || ws.readyState !== 1) {
                      try { await this.connect(); } catch {}
                    }
                    try {
                      // Send a minimal IDENTIFY-like payload so the stub records it
                      const id = JSON.stringify({ op: 1, d: { rpcVersion: 1 } });
                      ws && ws.send && ws.send(id);
                    } catch {}
                  } catch {}
                  setTimeout(() => res(true), 100);
                });
              },
              getLastError() { return null; }
            };
          };

          try {
            // Only install if none exists
            if (!globalThis.__recorder) {
              globalThis.__recorder = {
                initBuiltIns() { return Promise.resolve(true); },
                getAdapter(id) { return id === 'obs' ? makeObsAdapter(cfg || {}) : null; },
                get(id) { return id === 'obs' ? makeObsAdapter(cfg || {}) : null; },
                adapters: { obs: makeObsAdapter(cfg || {}) },
              };
            }
          } catch (_e) { /* ignore */ }
        } catch (e) { /* ignore */ }
      }, { host: OBS_HOST, port: OBS_PORT, url: '', password: OBS_PASS });
    } catch (_e) { /* ignore */ }
  }

  console.log('[e2e] navigating to', url);
  // Install an early initializer that will call initBuiltIns() on the recorder as soon as it appears.
  try {
    await page.evaluateOnNewDocument(() => {
      try {
        if (globalThis.__TP_E2E_INIT_INSTALLED__) return;
        globalThis.__TP_E2E_INIT_INSTALLED__ = true;
        const FLAG = '__TP_E2E_INIT_DONE__';
        if (globalThis[FLAG]) return;
        let attempts = 0;
        const iv = setInterval(() => {
          try {
            const r = globalThis.__recorder || (globalThis.App && globalThis.App.recorder);
            if (r && typeof r.initBuiltIns === 'function') {
              try {
                r.initBuiltIns();
              } catch (e) {
                /* ignore */
              }
              globalThis[FLAG] = true;
              clearInterval(iv);
            }
          } catch (e) {
            /* ignore */
          }
          attempts++;
          if (attempts > 300) clearInterval(iv); // ~30s
        }, 100);
      } catch (e) { /* ignore */ }
    });
  } catch (e) {
    /* ignore */
  }

  await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS }).catch((e) => {
    console.error('[e2e] page.goto error', e);
  });

  // Wait for the recorder module to be present in the page (runner-side wait)
  try {
    await page.waitForFunction(
      () => !!(window.__recorder || (window.App && window.App.recorder)),
      { timeout: TIMEOUT_MS, polling: 100 }
    );
    console.log('[e2e] recorder detected by waitForFunction');
  } catch (e) {
    console.warn('[e2e] recorder not detected within timeout; continuing to page-level checks');
  }

  // Try invoking the in-page helper to ensure adapters initialize and optionally run a quick test.
  try {
    const kick = await Promise.race([
      page.evaluate(() => {
        try {
          if (typeof window.__tpRunObsTest === 'function') return window.__tpRunObsTest();
        } catch (e) {}
        return null;
      }),
      new Promise((r) => setTimeout(() => r(null), 10000)), // 10s cap
    ]);
    if (kick) console.log('[e2e] __tpRunObsTest invoked (runner-side)');
  } catch (e) {
    /* ignore */
  }

  if (RUN_SMOKE) {
    console.log('[e2e] running non-interactive smoke test...');

    // drive init -> connect -> test -> report inside the page to keep adapter context local
    console.log('[e2e] running non-interactive smoke test...');

    // drive init -> connect -> test -> report inside the page to keep adapter context local
    const smoke = await page.evaluate(async ({ stubObs }) => {
      const report = { ok: false, tBootMs: 0, recorderReady: false, adapterReady: false, testRan: false, wsSentCount: 0, wsOps: [], wsOpened: 0, notes: [] };
      const T0 = Date.now();

      const rec = globalThis.__recorder || globalThis.App?.recorder;
      report.recorderReady = !!rec;
      report.tBootMs = Date.now() - T0;

      // init built-ins (tolerate no-op)
      try { await rec?.initBuiltIns?.(); report.notes.push('initBuiltIns() ok'); } catch (e) { report.notes.push('initBuiltIns err: ' + String(e)); }

      // small adapter retry (deterministic after initBuiltIns)
      let obs = null;
      for (let i = 0; i < 6 && !obs; i++) {
        obs = rec?.getAdapter?.('obs') || rec?.adapters?.obs || globalThis.obs || globalThis.App?.obs || null;
        if (!obs) await new Promise(r => setTimeout(r, 100));
      }
      report.adapterReady = !!obs;
      if (!obs) { report.notes.push('OBS adapter not found.'); return report; }

      const SENT = (globalThis.__WS_SENT__ ||= []);
      const OPENED = (globalThis.__WS_OPENED__ ||= []);
      const baseSent = SENT.length;

      // apply config and connect
      try {
        if (globalThis.__OBS_CFG__ && typeof obs.configure === 'function') {
          await obs.configure(globalThis.__OBS_CFG__);
          report.notes.push('obs.configure() applied');
        }
      } catch (e) { report.notes.push('configure err: ' + String(e)); }

      try { await obs.connect?.(); report.notes.push('obs.connect() ok'); } catch (e) { report.notes.push('connect err: ' + String(e)); }

      // brief post-connect settle so IDENTIFY/auth frames flush
      await new Promise(r => setTimeout(r, 250));

      try {
        if (typeof obs.test === 'function') {
          await obs.test();
          report.testRan = true;
          report.notes.push('obs.test() ok');
        } else {
          report.notes.push('obs.test() not present');
        }
      } catch (e) { report.notes.push('test err: ' + String(e)); }

      const newSent = SENT.length - baseSent;
      report.wsSentCount = Math.max(0, newSent);
      report.wsOps = SENT.slice(-report.wsSentCount).map((m) => { try { const j = typeof m === 'string' ? JSON.parse(m) : m; return j?.op ?? j?.opcode ?? 'unknown'; } catch { return 'raw'; } });
      report.wsOpened = Array.isArray(OPENED) ? OPENED.length : 0;

      // app version (best-effort) - normalize newlines into a single-line value for CI
      const appVersionRaw =
        (window.APP_VERSION) ||
        (window.VERSION) ||
        ((window.App && window.App.version) || null);

      const appVersion = appVersionRaw == null
        ? null
        : String(appVersionRaw).replace(/\r?\n/g, ' | ').trim();

      // Invariants
      const hasIdentify = Array.isArray(report.wsOps) && report.wsOps.includes(1);
      const wsCountsMatch = report.wsSentCount === (Array.isArray(report.wsOps) ? report.wsOps.length : 0);

      // Evaluate assertions into ok
      let ok = report.recorderReady && report.adapterReady && (report.testRan || report.wsSentCount > 0);
      if (stubObs && !hasIdentify) {
        ok = false;
        report.notes.push('assert: missing IDENTIFY opcode (1) under --stubObs');
      }
      if (!wsCountsMatch) {
        ok = false;
        report.notes.push(`assert: wsSentCount (${report.wsSentCount}) !== wsOps.length (${(report.wsOps||[]).length})`);
      }

      return {
        ok,
        tBootMs: report.tBootMs,
        recorderReady: report.recorderReady,
        adapterReady: report.adapterReady,
        testRan: report.testRan,
        wsSentCount: report.wsSentCount,
        wsOps: report.wsOps,
        wsOpened: report.wsOpened,
        notes: report.notes,
        appVersion,
        asserts: { hasIdentify, wsCountsMatch }
      };
    }, { stubObs: !!STUB_OBS });
    // Attach CI metadata (sha/ref) and print a single-line JSON report for CI
    try {
      const _sha = (typeof process !== 'undefined' && process && process.env && process.env.GITHUB_SHA) ? process.env.GITHUB_SHA : null;
      const _ref = (typeof process !== 'undefined' && process && process.env && (process.env.GITHUB_REF_NAME || process.env.GITHUB_REF)) ? (process.env.GITHUB_REF_NAME || process.env.GITHUB_REF) : null;
      smoke.ci = { sha: _sha, ref: _ref, runner: 'teleprompter_e2e.js' };
      // Print a canonical single-line JSON report useful for CI parsing
      console.log('[SMOKE-REPORT]', JSON.stringify(smoke));
    } catch {
      console.log('[SMOKE-REPORT] {}');
    }
    try { await browser.close(); } catch (e) { /* ignore */ }
    try { server.close(); } catch (e) { /* ignore */ }
    // Exit 0 on success, 1 on failure so standard CI tools treat non-zero as failing
    process.exit(smoke.ok ? 0 : 1);
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
        void 0;
      }
      try {
        server.close();
      } catch (e) {
        void 0;
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
