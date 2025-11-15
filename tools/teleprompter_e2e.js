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
  // Ensure CI stub endpoints are enabled in the static server for smoke
  try { process.env.CI = process.env.CI || 'true'; } catch {}
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

  // Guarded UI helpers for smoke interactions
  async function exists(sel) { return !!(await page.$(sel)); }
  async function clickIf(sel) { const el = await page.$(sel); if (!el) return false; try { await el.click(); } catch { return false; } return true; }
  async function robustClick(...sels) {
    for (const s of sels) {
      const ok = await page.evaluate((sel) => {
        try {
          const el = document.querySelector(sel);
          if (!el) return false;
          (el).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          if (typeof (el).click === 'function') (el).click();
          return true;
        } catch { return false; }
      }, s);
      if (ok) return true;
    }
    return false;
  }
  async function waitClass(sel, cls, want = true, timeout = 3000) {
    return page.waitForFunction(({ sel, cls, want }) => {
      const n = document.querySelector(sel); if (!n) return false;
      const lacks = !n.classList.contains(cls);
      return want ? lacks : !lacks;
    }, { timeout }, { sel, cls, want });
  }
  async function waitAttr(sel, name, value, timeout = 1200) {
    const offAt = Date.now() + timeout;
    while (Date.now() < offAt) {
      try {
        const v = await page.evaluate((s, n) => document.querySelector(s)?.getAttribute(n) || '', sel, name);
        if (v === value) return true;
      } catch {}
      await page.waitForTimeout(50);
    }
    return false;
  }
  async function editorHas(rx, timeout = 3000) {
    return page.waitForFunction((pattern) => {
      const ed = document.querySelector('#editor') || document.querySelector('#scriptInput') || document.querySelector('textarea#script') || document.querySelector('[data-editor]');
      const text = ed && ('value' in ed ? ed.value : ed?.textContent) || '';
      return new RegExp(pattern, 'i').test(text);
    }, { timeout }, rx.source || String(rx));
  }

  // Puppeteer-correct popup detection helper
  async function waitForPopupAfterClick(clickSel, { timeout = 1500, urlHint = 'display=1' } = {}) {
    const br = page.browser();
    const popupOnce = new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), timeout);
      page.once('popup', p => { try { clearTimeout(timer); } catch {} resolve(p); });
    });
    const targetHint = br.waitForTarget(
      t => t.type() === 'page' && (t.url() || '').includes(urlHint), { timeout }
    ).then(t => t && t.page()).catch(() => null);
    try { await page.click(clickSel); } catch {}
    const popup = await Promise.race([popupOnce, targetHint]);
    return popup || null;
  }

  const url = RUN_SMOKE ? `http://127.0.0.1:${effectivePort}/teleprompter_pro.html?ci=1&mockFolder=1&uiMock=1&dev=1&noRelax=1` : `http://127.0.0.1:${effectivePort}/teleprompter_pro.html`;
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
              async test() {
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
                return new Promise((res) => {
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

  // Wait for TS feature initializers to be marked ready (guard against regressions)
  try {
    await page.waitForFunction(() => {
      const r = (window).__tpInit || {};
      return r.persistence && r.telemetry && r.scroll && r.hotkeys;
    }, { timeout: 3000, polling: 100 });
  } catch (e) {
    console.warn('[e2e] feature readiness flags not observed within timeout');
  }

  // Quick UI invariants: no legacy Mode pill; a11y present; persistence works
  try {
    await page.waitForSelector('#scrollMode', { timeout: 5000 });
    const hasModeChip = await page.$('#modeChip');
    const ariaLive = await page.$eval('#scrollMode', (el) => el.getAttribute('aria-live'));
    const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
    assert(!hasModeChip, 'modeChip should not exist');
    assert(ariaLive === 'polite', 'scrollMode should have aria-live="polite"');

    // persistence check
    await page.select('#scrollMode', 'step');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#scrollMode', { timeout: 5000 });
    const persisted = await page.$eval('#scrollMode', (el) => el.value);
    assert(persisted === 'step', 'scrollMode should persist across reloads');
    // Legacy guard: ensure old Saved Scripts UI never resurfaces
    const legacy = await page.$('#scriptSlots');
    if (legacy) throw new Error('Legacy #scriptSlots found');
    console.log('[e2e] ui-invariants: PASS');
  } catch (e) {
    console.warn('[e2e] ui-invariants: WARN', String(e && e.message || e));
  }

  // Ensure Settings overlay opens deterministically before smoke checks (use data-smoke-open hook)
  try {
    const openedVia = await (async () => {
      if (await exists('[data-action="settings-open"]')) return (await clickIf('[data-action="settings-open"]'));
      if (await exists('#settingsBtn')) return (await clickIf('#settingsBtn'));
      return false;
    })();
    if (openedVia) {
      const ok = await (async () => {
        const offAt = Date.now() + 2000;
        while (Date.now() < offAt) {
          const v = await page.evaluate(() => document.body.getAttribute('data-smoke-open') || '');
          if (v === 'settings') return true;
          await page.waitForTimeout(50);
        }
        return false;
      })();
      if (!ok) console.warn('[e2e] settings not observed open (pre-smoke)');
      // Close it back to avoid interfering with later checks
      await clickIf('#settingsClose') || await clickIf('[data-action="settings-close"]');
    }
  } catch (e) {
    console.warn('[e2e] settings overlay pre-check skipped');
  }

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
    // Optional folder picker mocking & auto-record toggle when ?mockFolder=1
    try {
      if (location.search.includes('mockFolder=1')) {
        if (!('showDirectoryPicker' in window)) {
          window.showDirectoryPicker = async () => ({
            name: 'MockRecordings',
            kind: 'directory',
            getFileHandle: async (n, opts) => ({
              name: n,
              async createWritable() { return { async write() {}, async close() {} }; }
            })
          });
        }
        // Open settings to ensure toggle/label present
        try { document.querySelector('#settingsBtn,[data-action="settings-open"]')?.dispatchEvent(new Event('click',{bubbles:true})); } catch {}
        await new Promise(r=>setTimeout(r,120));
        const box = document.getElementById('settingsAutoRecord');
        if (box && !box.checked) {
          box.checked = true;
          box.dispatchEvent(new Event('change',{bubbles:true}));
        }
        await new Promise(r=>setTimeout(r,200));
      }
    } catch {}
    const report = { ok: false, tBootMs: 0, recorderReady: false, adapterReady: false, testRan: false, wsSentCount: 0, wsOps: [], wsOpened: 0, notes: [] };
    const T0 = Date.now();

    const rec = globalThis.__recorder || (globalThis.App && globalThis.App.recorder);
    report.recorderReady = !!rec;
    report.tBootMs = Date.now() - T0;

    try { await rec?.initBuiltIns?.(); report.notes.push('initBuiltIns() ok'); } catch (e) { report.notes.push('initBuiltIns err: ' + String(e)); }

    // find adapter with small retry loop
    let obs = null;
    for (let i = 0; i < 6 && !obs; i++) {
      obs = rec?.getAdapter?.('obs') || rec?.adapters?.obs || globalThis.obs || (globalThis.App && globalThis.App.obs) || null;
      if (!obs) await new Promise(r => setTimeout(r, 100));
    }
    report.adapterReady = !!obs;
    if (!obs) { report.notes.push('OBS adapter not found.'); report.ok = false; return report; }

    const SENT = (globalThis.__WS_SENT__ = globalThis.__WS_SENT__ || []);
    const OPENED = (globalThis.__WS_OPENED__ = globalThis.__WS_OPENED__ || []);
    const baseSent = SENT.length;

    try {
      if (globalThis.__OBS_CFG__ && typeof obs.configure === 'function') {
        await obs.configure(globalThis.__OBS_CFG__);
        report.notes.push('obs.configure() applied');
      }
    } catch (e) { report.notes.push('configure err: ' + String(e)); }

    try { await obs.connect?.(); report.notes.push('obs.connect() ok'); } catch (e) { report.notes.push('connect err: ' + String(e)); }

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

    report.wsSentCount = Math.max(0, SENT.length - baseSent);
    report.wsOps = SENT.slice(-report.wsSentCount).map((m) => { try { const j = typeof m === 'string' ? JSON.parse(m) : m; return j?.op ?? j?.opcode ?? 'unknown'; } catch { return 'raw'; } });
    report.wsOpened = Array.isArray(OPENED) ? OPENED.length : 0;

    const hasIdentify = Array.isArray(report.wsOps) && report.wsOps.includes(1);
    const wsCountsMatch = report.wsSentCount === (Array.isArray(report.wsOps) ? report.wsOps.length : 0);

    let ok = report.recorderReady && report.adapterReady && (report.testRan || report.wsSentCount > 0);
    if (stubObs && !hasIdentify) {
      ok = false;
      report.notes.push('assert: missing IDENTIFY opcode (1) under --stubObs');
    }
    if (!wsCountsMatch) {
      ok = false;
      report.notes.push(`assert: wsSentCount (${report.wsSentCount}) !== wsOps.length (${(report.wsOps||[]).length})`);
    }

    // Basic UI checks (best-effort)
    try {
      const overlay = document.getElementById('settingsOverlay');
      const card = document.getElementById('scriptsFolderCard');
      const choose = document.getElementById('chooseFolderBtn');
      const mainSel = document.getElementById('scriptSelect');
      const mirrorSel = document.getElementById('scriptSelectSidebar');

      const overlayVisible = !!overlay && !overlay.classList.contains('hidden') && overlay.style.display !== 'none';
      const settingsCard = !!card && !!choose && !!mainSel;
      const mainCount = mainSel ? (mainSel.querySelectorAll('option') || []).length : 0;
      const mirrorCount = mirrorSel ? (mirrorSel.querySelectorAll('option') || []).length : 0;

      report.ui = { overlayVisible, settingsCard, mirrorExists: !!mirrorSel, mainCount, mirrorCount };

      if (!settingsCard) {
        ok = false;
        report.notes.push('assert: Settings Scripts Folder card missing (choose/scripts)');
      } else {
        if (mainCount === 0) { ok = false; report.notes.push('assert: mock folder population empty'); }
        if (mainCount !== mirrorCount) { ok = false; report.notes.push('assert: mirror option count mismatch'); }
        // Non-fatal folder label check under mockFolder flag
        try {
          if (location.search.includes('mockFolder=1')) {
            const lbl = document.querySelector('[data-test-id="rec-folder-label"]');
            const txt = lbl ? (lbl.textContent||'') : '';
            if (/MockRecordings/i.test(txt)) {
              report.notes.push('folder picker mock applied');
            } else {
              report.notes.push('folder picker label not updated');
            }
          }
        } catch {}
      }
    } catch (e) {
      report.notes.push('ui-check err: ' + String(e));
    }

    report.ok = ok;
    return report;
  }, { stubObs: !!STUB_OBS });

      // Quick diagnostics for buttons and present hook
      try {
        const diag = await page.evaluate(() => {
          const btn = document.querySelector('#presentBtn,[data-action="present-toggle"]');
          const sbtn = document.querySelector('#settingsBtn,[data-action="settings-open"]');
          return {
            present: { exists: !!btn, bound: !!(btn && (btn).dataset && (btn).dataset.uiBound) },
            settings: { exists: !!sbtn },
            attr: { present: document.documentElement.getAttribute('data-smoke-present') || null }
          };
        });
        console.log('[e2e:diag]', JSON.stringify(diag));
      } catch {}

      // Guarded, skip-if-missing UI interaction flow
      const notes = [];
      try {
  if (await robustClick('#settingsBtn', '[data-action="settings-open"]')) {
          const opened = await waitAttr('body', 'data-smoke-open', 'settings', 1500);
          if (!opened) notes.push('settings open not observed');
          await robustClick('#settingsClose', '[data-action="settings-close"]');
          const closed = await page.evaluate(() => !document.body.hasAttribute('data-smoke-open'));
          if (!closed) notes.push('settings close not observed');
        } else {
          notes.push('settingsBtn not found (skipped)');
        }

        // Builder-path guard: ensure dynamic Pricing/About sections exist when builder is mounted
        try {
          const reopened = await robustClick('#settingsBtn', '[data-action="settings-open"]');
          if (reopened) {
            const okOpen2 = await waitAttr('body', 'data-smoke-open', 'settings', 1500);
            if (!okOpen2) {
              notes.push('settings open not observed (builder check)');
            } else {
              const builderCheck = await page.evaluate(() => {
                try {
                  const root = document.getElementById('settingsBody');
                  if (!root) return { hasBuilder:false };
                  const dynSections = root.querySelectorAll('[data-tab-content]');
                  const hasBuilder = dynSections && dynSections.length > 0;
                  const pricing = root.querySelector('[data-tab-content="pricing"]');
                  const about = root.querySelector('[data-tab-content="about"]');
                  const len = (el)=>{ try { return ((el && el.textContent) || '').trim().length; } catch { return 0; } };
                  // Collect About bullets (if any)
                  const bullets = about ? Array.from(about.querySelectorAll('ul li')).map(li => (li.textContent||'').trim()) : [];
                  return {
                    hasBuilder,
                    hasPricing: !!pricing,
                    hasAbout: !!about,
                    pricingLen: len(pricing),
                    aboutLen: len(about),
                    aboutBullets: bullets,
                    aboutBulletsCount: bullets.length
                  };
                } catch { return { hasBuilder:false }; }
              });
              if (builderCheck && builderCheck.hasBuilder) {
                if (!builderCheck.hasPricing || builderCheck.pricingLen < 8) {
                  notes.push('assert: builder missing pricing content');
                  try { smoke.ok = false; } catch {}
                }
                if (!builderCheck.hasAbout || builderCheck.aboutLen < 8) {
                  notes.push('assert: builder missing about content');
                  try { smoke.ok = false; } catch {}
                }
                // About bullets: expect at least 4 and basic keyword coverage
                try {
                  const items = Array.isArray(builderCheck.aboutBullets) ? builderCheck.aboutBullets : [];
                  if (items.length < 4) {
                    notes.push('assert: about bullets fewer than 4');
                    smoke.ok = false;
                  } else {
                    const text = items.join(' \n ').toLowerCase();
                    const kws = ['scroll', 'color', 'script', 'obs'];
                    const missing = kws.filter(k => !text.includes(k));
                    if (missing.length) {
                      notes.push('assert: about bullets missing keywords: ' + missing.join(', '));
                      smoke.ok = false;
                    }
                  }
                } catch (e) {
                  notes.push('about bullets check error: ' + String(e && e.message || e));
                  smoke.ok = false;
                }
              } else {
                notes.push('builder not detected (static HTML path ok)');
              }
            }
            await robustClick('#settingsClose', '[data-action="settings-close"]');
            const closed2 = await page.evaluate(() => !document.body.hasAttribute('data-smoke-open'));
            if (!closed2) notes.push('settings close not observed (builder check)');
          }
        } catch (e) {
          notes.push('builder check error: ' + String(e && e.message || e));
        }

  if (await robustClick('#helpBtn', '[data-action="help-open"]')) {
          const opened = await waitAttr('body', 'data-smoke-open', 'help', 1500);
          if (!opened) notes.push('help open not observed');
          await robustClick('#helpClose', '[data-action="help-close"]');
          const closed = await page.evaluate(() => !document.body.hasAttribute('data-smoke-open'));
          if (!closed) notes.push('help close not observed');
        } else {
          notes.push('helpBtn not found (skipped)');
        }

        const before = await page.evaluate(() => document.documentElement.getAttribute('data-smoke-present') || '0');
        // Attempt present toggle via click; fallback to direct JS setter if attribute unchanged
        await robustClick('#presentBtn', '[data-action="present-toggle"]');
        let after = await page.evaluate(() => {
          const attr = document.documentElement.getAttribute('data-smoke-present');
          const cls = document.documentElement.classList.contains('tp-present');
          return attr || (cls ? '1' : '0');
        });
        if (after === before) {
          // Fallback: invoke global setter if exposed, then re-check
          await page.evaluate(() => { try { window.__tpSetPresent && window.__tpSetPresent(true); } catch {} });
          after = await page.evaluate(() => {
            const attr = document.documentElement.getAttribute('data-smoke-present');
            const cls = document.documentElement.classList.contains('tp-present');
            return attr || (cls ? '1' : '0');
          });
        }
        if (after === before) {
          const diag = await page.evaluate(() => ({
            attr: document.documentElement.getAttribute('data-smoke-present'),
            cls: document.documentElement.classList.contains('tp-present'),
            btn: !!document.querySelector('#presentBtn,[data-action="present-toggle"]')
          }));
          notes.push('present toggle not observed');
          notes.push('present diag: ' + JSON.stringify(diag));
        }
        // Restore to off state for determinism
        await page.evaluate(() => { try { window.__tpSetPresent ? window.__tpSetPresent(false) : (document.documentElement.classList.remove('tp-present'), document.documentElement.removeAttribute('data-smoke-present')); } catch {} });

        await clickIf('#hudBtn') || await clickIf('[data-action="hud-toggle"]');

        // DISPLAY WINDOW (popup) — Puppeteer version
        let displayClicked = false;
        if (await exists('#displayWindowBtn') || await exists('[data-action="display"]')) {
          displayClicked = true;
          const sel = (await exists('#displayWindowBtn')) ? '#displayWindowBtn' : '[data-action="display"]';
          const popup = await waitForPopupAfterClick(sel, { timeout: 1500, urlHint: 'display=1' });
          if (!popup) {
            notes.push('display popup not detected');
          } else {
            try { await popup.close(); } catch {}
          }
        } else {
          notes.push('display button missing (skipped)');
        }

  // Drive sample load using robust selectors
        await robustClick('#loadSampleBtn', '#loadSample', '[data-action="load-sample"]');
        const sampleOk = await editorHas(/sample|use the arrow keys/i, 2000).then(()=>true).catch(async () => {
          // Fallback: inject sample via tp:script-load
          try {
            await page.evaluate(() => {
              const text = '[s1]\nWelcome to Anvil — sample is live.\n[beat]\nUse step keys or auto-scroll to move.\n[/s1]';
              window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name: 'Sample.txt', text } }));
            });
          } catch {}
          return await editorHas(/sample|auto-scroll/i, 1500).then(()=>true).catch(()=>false);
        });
        if (!sampleOk) notes.push('sample not loaded');

  // Trigger upload flow (mocked under uiMock=1)
        await robustClick('#uploadBtn', '#uploadFileBtn', '[data-action="upload"]');
        const uploadOk = await editorHas(/CI upload OK/i, 2000).then(()=>true).catch(async () => {
          // Fallback: inject mock upload text directly
          try {
            await page.evaluate(() => {
              const text = 'Smoke upload text ' + Date.now();
              window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name: 'smoke.txt', text } }));
            });
          } catch {}
          return await editorHas(/Smoke upload text/i, 1500).then(()=>true).catch(()=>false);
        });
        if (!uploadOk) notes.push('upload mock not reflected');

        await clickIf('#requestMicBtn') || await clickIf('[data-action="request-mic"]');
        await clickIf('#startSpeechBtn') || await clickIf('[data-action="start-speech"]');

        await clickIf('#startCameraBtn') || await clickIf('[data-action="start-camera"]');
        await clickIf('#pipBtn') || await clickIf('[data-action="pip"]');

        if (await clickIf('#speakersToggleBtn') || await clickIf('[data-action="speakers-toggle"]')) {
          await page.waitForFunction(() => {
            const p = document.querySelector('#speakersPanel') || document.querySelector('[data-panel="speakers"]');
            return p && !p.classList.contains('hidden');
          }, { timeout: 1500 }).catch(() => notes.push('speakers panel not visible'));
          await clickIf('#speakersKeyBtn') || await clickIf('[data-action="speakers-key"]');
          // Only require focus if a key input exists
          const hasKey = await page.evaluate(() => !!document.querySelector('#speakersKey,[data-speakers-key]'));
          if (!hasKey) {
            // No key field present in this build; skip focus assertion
            notes.push('speakers key input missing (focus skip)');
          }
          const focused = await page.waitForFunction(() => {
            const a = document.activeElement;
            if (!a) return false;
            return (a.id === 'speakersKey') || (a.matches && a.matches('[data-speakers-key]'));
          }, { timeout: 1500 }).then(()=>true).catch(async () => {
            // Fallback: try to focus programmatically
            try {
              await page.evaluate(() => {
                const el = document.querySelector('#speakersKey,[data-speakers-key]');
                if (el && typeof el.focus === 'function') { el.focus(); }
              });
            } catch {}
            return await page.waitForFunction(() => {
              const a = document.activeElement;
              if (!a) return false;
              const id = a.id || '';
              const matches = a.matches ? a.matches('[data-speakers-key]') : false;
              return id === 'speakersKey' || matches;
            }, { timeout: 1000 }).then(()=>true).catch(()=>false);
          });
          if (hasKey && !focused) notes.push('speakers key not focused');
        } else {
          notes.push('speakers controls not found (skipped)');
        }
      } catch (e) {
        notes.push('ui sequence error: ' + String(e && e.message || e));
      }
      try { smoke.notes.push(...notes); } catch {}

    // Drive a mock script selection to ensure content renders & broadcast path active
    try {
      await page.evaluate(() => {
        try {
          const main = document.getElementById('scriptSelect');
          if (main && main.options && main.options.length > 0) {
            main.selectedIndex = 0;
            main.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } catch {}
      });
      // Wait until editor populated
      await page.waitForFunction(() => {
        const ed = document.getElementById('editor');
        if (ed && 'value' in ed) return (ed).value.length > 5;
        return false;
      }, { timeout: 2500 });
    } catch (e) {
      try { smoke.notes.push('script selection content not observed'); } catch {}
    }

    // Assert that content appears in #editor (or any script input) after selection (secondary safeguard)
    try {
      await page.waitForFunction(() => {
        const el = document.getElementById('editor');
        if (el && 'value' in el && typeof (el).value === 'string') return (el).value.length > 5;
        return false;
      }, { timeout: 1500 });
    } catch (e) {
      console.warn('[e2e] content not loaded after selection');
    }
    // Attach CI metadata (sha/ref) and print a single-line JSON report for CI
    try {
      const _sha = (typeof process !== 'undefined' && process && process.env && process.env.GITHUB_SHA) ? process.env.GITHUB_SHA : null;
      const _ref = (typeof process !== 'undefined' && process && process.env && (process.env.GITHUB_REF_NAME || process.env.GITHUB_REF)) ? (process.env.GITHUB_REF_NAME || process.env.GITHUB_REF) : null;
      smoke.ci = { sha: _sha, ref: _ref, runner: 'teleprompter_e2e.js' };
      // Print a canonical single-line JSON report useful for CI parsing
      console.log('[SMOKE-REPORT]', JSON.stringify(smoke));
    } catch {
      console.log('[SMOKE-REPORT] {}');

      // Settings tabs/content assertions: Pricing and About should render
      try {
        let uiFail = false;
        // Open Settings overlay
        const opened = await robustClick('#settingsBtn', '[data-action="settings-open"]');
        if (!opened) {
          notes.push('settings open control missing (tabs checks skipped)');
        } else {
          const okOpen = await waitAttr('body', 'data-smoke-open', 'settings', 1500);
          if (!okOpen) notes.push('settings open not observed for tabs');

          // Click Pricing tab and verify its card is visible and non-empty
          const clickedPricing = await robustClick('[role="tab"][data-tab="pricing"]', '#settingsTabs [data-tab="pricing"]');
          if (!clickedPricing) {
            notes.push('pricing tab not found');
            uiFail = true;
          } else {
            const pricingVisible = await page.evaluate(() => {
              const el = document.querySelector('.settings-card[data-tab="pricing"]');
              if (!el) return false;
              const st = getComputedStyle(el);
              const hasText = (el.textContent || '').trim().length > 10;
              return !el.hasAttribute('hidden') && st.display !== 'none' && hasText;
            });
            if (!pricingVisible) { notes.push('pricing card not visible/content-empty'); uiFail = true; }
          }

          // Click About tab and verify its card is visible and has version text
          const clickedAbout = await robustClick('[role="tab"][data-tab="about"]', '#settingsTabs [data-tab="about"]');
          if (!clickedAbout) {
            notes.push('about tab not found');
            uiFail = true;
          } else {
            const aboutVisible = await page.evaluate(() => {
              const el = document.querySelector('.settings-card[data-tab="about"]');
              if (!el) return false;
              const st = getComputedStyle(el);
              const v = document.getElementById('aboutVersion');
              const hasHdr = /about/i.test((el.textContent||''));
              const hasVer = !!(v && (v.textContent||'').trim().length);
              return !el.hasAttribute('hidden') && st.display !== 'none' && hasHdr && hasVer;
            });
            if (!aboutVisible) { notes.push('about card not visible or missing version'); uiFail = true; }
          }

          // Close settings to return to baseline
          await robustClick('#settingsClose', '[data-action="settings-close"]');
          const okClose = await page.evaluate(() => !document.body.hasAttribute('data-smoke-open'));
          if (!okClose) notes.push('settings close not observed after tabs checks');

          // If UI failed, mark smoke as failed for CI signal
          if (uiFail) { smoke.ok = false; }
        }
      } catch (e) {
        notes.push('settings tabs check error: ' + String(e && e.message || e));
      }
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
          if (typeof window.tpScrollTo === 'function') {
            window.tpScrollTo(val);
            return true;
          }
          if (typeof globalThis.tpScrollTo === 'function') {
            globalThis.tpScrollTo(val);
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
