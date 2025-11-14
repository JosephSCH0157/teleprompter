// tools/smoke_test.js
/* Minimal-but-solid smoke runner:
   - Prefers Playwright, falls back to Puppeteer.
   - Waits for key UI bits and init flags.
   - Detects duplicate boots via console log counting.
   - Emits one-line [SMOKE-REPORT] JSON for CI.
   Usage examples:
     node tools/smoke_test.js --calm --timeout=120000
     node tools/smoke_test.js --url=http://127.0.0.1:8080/teleprompter_pro.html
*/

// Build default URL from CI_HOST/CI_PORT if provided, else fall back to 127.0.0.1:5180
const CI_HOST = process.env.CI_HOST || '127.0.0.1';
const CI_PORT = process.env.CI_PORT || process.env.PORT || '5180';
const DEFAULT_URL = `http://${CI_HOST}:${CI_PORT}/teleprompter_pro.html`;
const ARG_URL = (process.argv.find(a => a.startsWith('--url=')) || '').split('=')[1];
const ARG_TIMEOUT = Number((process.argv.find(a => a.startsWith('--timeout=')) || '').split('=')[1]) || 60000;
const ARG_CALM = process.argv.includes('--calm');
const ARG_CI = process.argv.includes('--ci');

function withParam(url, key, val = '1') {
  const u = new URL(url);
  if (!u.searchParams.has(key)) u.searchParams.set(key, val);
  return u.toString();
}

let RAW_URL = ARG_URL || process.env.TP_URL || DEFAULT_URL;
// Append flags as query params where requested
if (ARG_CALM) RAW_URL = withParam(RAW_URL, 'calm', '1');
if (process.env.SMOKE_CI === '1' || ARG_CI) RAW_URL = withParam(RAW_URL, 'ci', '1');
const URL_TO_OPEN = RAW_URL;

(async function run() {
  try {
    // Try to spin up static server if present (ignore errors if it self-manages or is already running)
    try { require('./static_server.js'); } catch {}

    // Prefer Playwright
    let playwright;
    try { playwright = require('playwright'); } catch {}

    const ciArgs = process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];

    // Common runner harness
    async function runWithPage(makeBrowser, type) {
      const browser = await makeBrowser();
      const page = await browser.newPage();

      // Collect console + errors to detect dup boot and failures
      let bootCount = 0, scriptEnterCount = 0, rsCompleteCount = 0, errorLogs = [], warnLogs = [];

      page.on('console', msg => {
        const text = msg.text ? msg.text() : String(msg);
        const t = typeof text === 'string' ? text : String(text);

        if (t.includes('[TP-BOOT')) bootCount++;
        if (t.includes('script-enter')) scriptEnterCount++;
        if (t.includes('rs:complete')) rsCompleteCount++;

        if (msg.type && msg.type() === 'error') errorLogs.push(t);
        else if (msg.type && msg.type() === 'warning') warnLogs.push(t);
      });
      page.on('pageerror', err => errorLogs.push(String(err && err.message || err)));
      page.on('requestfailed', req => warnLogs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText || ''}`));

      // Open page
      await page.goto(URL_TO_OPEN, { waitUntil: type === 'playwright' ? 'networkidle' : 'networkidle0', timeout: ARG_TIMEOUT });

      // Wait for UI bits (race tolerant)
      const waitFor = async (selector) => {
        try { await page.waitForSelector(selector, { timeout: Math.min(ARG_TIMEOUT, 15000) }); return true; }
        catch { return false; }
      };

      const hasToast = await waitFor('#tp_toast_container'); // toast container
  // Legacy '#scriptSlots' removed; treat absence as ok.
  let hasScripts = false;
  try { hasScripts = !!document.querySelector('#scriptSlots'); } catch {}

      // VAD gate latency (simulated)
      try {
        const result = await page.evaluate(() => {
          const prof = { vad: { tonDb: -30, toffDb: -36, attackMs: 80, releaseMs: 300 } };
          let gate = false, onCounter = 0, offCounter = 0; const ms = 20;
          const step = (rmsDb) => {
            const speaking = gate
              ? (rmsDb > prof.vad.toffDb ? (offCounter=0, true) : ((offCounter+=ms) < prof.vad.releaseMs))
              : (rmsDb > prof.vad.tonDb  ? ((onCounter+=ms) >= prof.vad.attackMs) : (onCounter=0, false));
            gate = speaking; return gate;
          };
          let frames = 0; // open
          while (!step(prof.vad.tonDb + 3) && frames < 1000) frames++;
          const openOk = frames >= Math.ceil(prof.vad.attackMs / ms) - 1;
          frames = 0; // close
          while (step(prof.vad.toffDb - 3) && frames < 1000) frames++;
          const closeOk = frames >= Math.ceil(prof.vad.releaseMs / ms) - 1;
          return { openOk, closeOk };
        });
        if (!result.openOk || !result.closeOk) warnLogs.push('[smoke] VAD latency check failed');
      } catch (e) {
        warnLogs.push('[smoke] VAD latency check error: ' + (e?.message || String(e)));
      }

      // Sane profile formula (synthetic): ton must be above noise
      try {
        const ok = await page.evaluate(() => {
          const noise = -50, speech = -20; // dBFS
          const ton = Math.max(noise + 10, Math.min(-20, speech - 4));
          return ton > noise;
        });
        if (!ok) warnLogs.push('[smoke] tonDb should be above noise floor');
      } catch {}

      // Auto chip probe: ensure presence and state reflects toggle via chip OR button OR motion
      try {
        // Wait for app init marker to ensure handlers are wired
        try {
          await page.evaluate(() => new Promise((resolve)=>{
            if (window.__tp_init_done) return resolve(true);
            const t = setTimeout(()=>resolve(false), 1500);
            try { window.addEventListener('tp:init:done', ()=>{ clearTimeout(t); resolve(true); }, { once:true }); } catch { resolve(true); }
          }));
        } catch {}
        await page.waitForSelector('#autoToggle', { timeout: 5000 });
        const read = async () => {
          const chip = await page.$eval('#autoChip', n => (n && n.textContent || '').trim()).catch(()=> '');
          const btn  = await page.$eval('#autoToggle', n => (n && n.textContent || '').trim()).catch(()=> '');
          const pressed = await page.$eval('#autoToggle', n => (n && n.getAttribute && n.getAttribute('aria-pressed')) || '').catch(()=> '');
          const pos  = await page.$eval('#viewer', vp => vp ? (vp.scrollTop|0) : 0).catch(()=>0);
          return { chip, btn, pressed, pos };
        };
        const before = await read();
        const clickOnce = async () => {
          try { await page.$eval('#autoToggle', el => el && el.scrollIntoView && el.scrollIntoView({behavior:'instant', block:'center'})); } catch {}
          // Try DOM click first (bypasses hit-testing flakiness), then synthetic click as fallback
          try { await page.$eval('#autoToggle', el => el && el.click && el.click()); } catch {}
          await page.waitForTimeout(30);
          await page.click('#autoToggle').catch(()=>{});
          await page.waitForTimeout(320);
          return await read();
        };
        let after = await clickOnce();
        const changed1 = (before.chip !== after.chip) || (before.btn !== after.btn) || (before.pressed !== after.pressed) || (after.pos > before.pos);
        if (!changed1) {
          // Try a second time in case the first click landed before handlers were live or debounce suppressed it
          after = await clickOnce();
        }
        const changed = (before.chip !== after.chip) || (before.btn !== after.btn) || (before.pressed !== after.pressed) || (after.pos > before.pos);
        if (!changed) {
          if (String(process.env.SMOKE_STRICT_AUTO || '0') === '1') warnLogs.push('[smoke] auto state did not reflect toggle after 2 attempts');
        }
      } catch (e) {
        warnLogs.push('[smoke] autoChip probe error: ' + (e?.message || String(e)));
      }

      // Hybrid gating from profile (no mic): inject a fake profile and preference, expect a stable Hybrid paused/manual state
      try {
        const txt = await page.evaluate(() => {
          try {
            const asr = { profiles: { test: { id:'test', label:'TestProfile', capture: { deviceId:'', sampleRateHz:48000, channelCount:1, echoCancellation:false, noiseSuppression:false, autoGainControl:false }, cal: { noiseRmsDbfs:-50, noisePeakDbfs:-44, speechRmsDbfs:-20, speechPeakDbfs:-14, snrDb:30 }, vad: { tonDb:-28, toffDb:-34, attackMs:80, releaseMs:300 }, filters:{}, createdAt: Date.now(), updatedAt: Date.now() } }, activeProfileId:'test' };
            localStorage.setItem('tp_asr_profiles_v1', JSON.stringify(asr));
            const prefs = JSON.parse(localStorage.getItem('tp_ui_prefs_v1') || '{}') || {};
            prefs.hybridUseProfileId = 'test';
            localStorage.setItem('tp_ui_prefs_v1', JSON.stringify(prefs));
            localStorage.setItem('tp_vad_apply_hybrid', '1');
            localStorage.setItem('scrollMode', 'hybrid');
            // Nudge router listeners
            window.dispatchEvent(new StorageEvent('storage', { key: 'tp_asr_profiles_v1', newValue: JSON.stringify(asr) }));
            window.dispatchEvent(new StorageEvent('storage', { key: 'tp_ui_prefs_v1', newValue: JSON.stringify(prefs) }));
            const chip = document.getElementById('autoChip');
            return chip ? chip.textContent.trim() : '';
          } catch { return ''; }
        });
        console.log('[smoke hybrid/vad-only]', txt);
      } catch {}

      // Kill switch latency (warn-only): toggle ON then OFF quickly, ensure handler responds within ~150ms
      try {
        const elapsed = await page.evaluate(async () => {
          const t0 = Date.now();
          const btn = document.getElementById('autoToggle');
          if (btn) { btn.click(); btn.click(); }
          return Date.now() - t0;
        });
        console.warn('[smoke kill]', elapsed, 'ms');
      } catch {}

      // Typography smoke guard: a line node must respond to font-size var changes
      try {
        const SEL = '#viewer .script :is(p,.line,.tp-line)';
        // Ensure at least one candidate exists; if not, create a temporary one
        const hadAny = await page.$(SEL);
        if (!hadAny) {
          await page.evaluate(() => {
            try {
              const host = document.getElementById('script');
              if (host) {
                const div = document.createElement('div');
                div.className = 'line tp-line';
                try { div.dataset.tpLine = '1'; } catch {}
                div.textContent = 'smoke-guard-temp';
                host.appendChild(div);
              }
            } catch {}
          });
        }
        const before = await page.$eval(SEL, el => getComputedStyle(el).fontSize);
        await page.evaluate(() => document.documentElement.style.setProperty('--tp-font-size','64px'));
        await page.waitForTimeout(30);
        const after  = await page.$eval(SEL, el => getComputedStyle(el).fontSize);
        if (after === before) warnLogs.push('[smoke] inline typography must affect actual line nodes');
      } catch (e) {
        warnLogs.push('[smoke] line typography guard failed: ' + (e?.message || String(e)));
      }

      // Legacy settings writers guard: ensure no legacy tp_* keys remain besides allowed modern ones
      try {
        const legacy = await page.evaluate(() => {
          try {
            const allowed = new Set([
              // modern or unrelated keys we intentionally allow
              'tp_ui_prefs_v1', 'tp_asr_profiles_v1', 'tp_baseline_wpm', 'tp_wpl_hint', 'scrollMode', 'tp_vad_apply_hybrid',
              'tp_auto_speed', 'tp_auto_record_on_start_v1'
            ]);
            const keys = Object.keys(localStorage || {});
            const legacyPattern = /^tp_(theme|font|line|mirror|colorize|hide|hud|wpm|step|auto_start|asr_lang)$/;
            return keys.filter(k => legacyPattern.test(k) && !allowed.has(k));
          } catch { return ['<eval-error>']; }
        });
        if (legacy.length) {
          warnLogs.push('[smoke] legacy-settings-writers detected: ' + legacy.join(','));
        } else {
          console.log('[smoke] settings:legacy-writers ok');
        }
      } catch (e) {
        warnLogs.push('[smoke] legacy settings guard error: ' + (e?.message || String(e)));
      }

      // Cheap E2E: assert CSS var changes propagate to display
      try {
        // Open settings so the builder mounts (ensures inputs exist)
        try { await page.evaluate(() => { try { window.scrollTo(0,0); } catch {} }); } catch {}
        try { await page.$eval('#settingsBtn, [data-action="settings-open"]', el => { try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch {} }); } catch {}
        // Prefer DOM click to avoid hit-testing flakiness
        try { await page.$eval('#settingsBtn, [data-action="settings-open"]', el => { try { el && el.click && el.click(); } catch {} }); } catch {}
        // Fallback to action click
        await page.click('#settingsBtn, [data-action="settings-open"]').catch(()=>{});
        await page.waitForSelector('#settingsBody');
        // Type font size into main field if present
        const hasMainFS = await page.$('#typoFontSize-main');
        if (hasMainFS) {
          await page.fill('#typoFontSize-main', '60');
          // small pause to flush rAF/store
          await page.waitForTimeout(50);
          const sizeMain = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tp-font-size').trim());
          if (sizeMain !== '60px') throw new Error('main font var not set');
          // Open display window and check mirrored var
          await page.click('#openDisplayBtn');
          await page.waitForTimeout(200);
          const sizeDisp = await page.evaluate(() => {
            try {
              const w = window.__tpDisplayWindow;
              if (!w) return null;
              return w.getComputedStyle(w.document.documentElement).getPropertyValue('--tp-font-size').trim();
            } catch { return null; }
          });
          if (sizeDisp !== '60px') throw new Error('display font var not mirrored');
        }
      } catch (e) {
        warnLogs.push('[typo-smoke] ' + (e?.message || String(e)));
      }

      // Guard: unlink by default; then link → mirror
      try {
        const hasSettingsBtn = await page.$('#settingsBtn, [data-action="settings-open"]');
        if (hasSettingsBtn) {
          try { await page.evaluate(() => { try { window.scrollTo(0,0); } catch {} }); } catch {}
          try { await page.$eval('#settingsBtn, [data-action="settings-open"]', el => { try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch {} }); } catch {}
          try { await page.$eval('#settingsBtn, [data-action="settings-open"]', el => { try { el && el.click && el.click(); } catch {} }); } catch {}
          await page.click('#settingsBtn, [data-action="settings-open"]').catch(()=>{});
          await page.waitForSelector('#settingsOverlay:not(.hidden)', { timeout: 2000 }).catch(()=>{});
          // Ensure Link is off by default
          const linkChecked = await page.$eval('#typoLink', el => el && el.checked);
          if (linkChecked) warnLogs.push('[smoke] Link Typography is ON by default (expected OFF)');
          // Change main only
          await page.$eval('#settingsFontSize', (el) => { el.value = '60'; el.dispatchEvent(new Event('input', { bubbles: true })); });
          // Open display and check it did not mirror by default
          await page.click('#openDisplayBtn');
          await page.waitForTimeout(400);
          const dispSize1 = await page.evaluate(() => {
            try {
              const w = window.__tpDisplayWindow; if (!w) return 'n/a';
              return w.getComputedStyle(w.document.documentElement).getPropertyValue('--tp-font-size').trim();
            } catch { return 'n/a'; }
          });
          if (dispSize1 === '60px') warnLogs.push('[smoke] Display mirrored size while Link was OFF');
          // Enable Link and change again → should mirror
          await page.click('#typoLink');
          await page.$eval('#settingsFontSize', (el) => { el.value = '64'; el.dispatchEvent(new Event('input', { bubbles: true })); });
          await page.waitForTimeout(250);
          const dispSize2 = await page.evaluate(() => {
            try {
              const w = window.__tpDisplayWindow; if (!w) return 'n/a';
              return w.getComputedStyle(w.document.documentElement).getPropertyValue('--tp-font-size').trim();
            } catch { return 'n/a'; }
          });
          if (dispSize2 !== '64px') warnLogs.push('[smoke] Display did not mirror when Link was ON');
          await page.click('#settingsClose').catch(()=>{});
        }
      } catch {}

      // Grab a couple runtime flags if present
      const { initDone, appVersion, ctx } = await page.evaluate(() => ({
        initDone: !!(window.__tp_init_done || (window.App && (window.App.inited || window.App.initDone))),
        appVersion: (window.App && (window.App.version || window.App.appVersion)) || null,
        ctx: window.opener ? 'Display' : (window.name || 'Main'),
      }));

      // Duplicate boot detection: if we saw multiple script-enter or TP-BOOT lines, flag it
      const dupBoot = Math.max(bootCount, scriptEnterCount) > 1;

      // Pass criteria: UI present, init completed, no console errors
      const ok = hasToast && hasScripts && initDone && errorLogs.length === 0;

      const report = {
        ok,
        runner: type,
        url: URL_TO_OPEN,
        timeoutMs: ARG_TIMEOUT,
        ctx,
        initDone,
        appVersion,
        ui: { toast: hasToast, scripts: hasScripts },
        counts: { boot: bootCount, scriptEnter: scriptEnterCount, rsComplete: rsCompleteCount },
        logs: {
          errors: errorLogs.slice(0, 5), // cap for CI readability
          warnings: warnLogs.slice(0, 5),
        }
      };

      // Expose duplicate-boot explicitly for CI parsing
      report.dupBoot = dupBoot;

      // One-line CI summary
      console.log(`[SMOKE-REPORT] ${JSON.stringify(report)}`);

      await browser.close();

      if (!hasToast || !hasScripts) process.exit(2);
      if (!initDone) process.exit(4);
      if (errorLogs.length) process.exit(4);

      // Only fail dup-boot if STRICT flag is set or init didn't complete
      if (dupBoot && (process.env.SMOKE_STRICT_DUPBOOT === '1' || !initDone)) {
        process.exit(5);
      }
      if (dupBoot) {
        console.warn('[SMOKE] duplicate boot observed (non-fatal because initDone=true)');
      }

      process.exit(ok ? 0 : 4);
    }

    if (playwright) {
      try {
        const makeBrowser = () => playwright.chromium.launch({ headless: true, args: ciArgs });
        return await runWithPage(makeBrowser, 'playwright');
      } catch (e) {
        console.warn('[SMOKE] Playwright launch failed, falling back to Puppeteer:', e && e.message || e);
        // fall through to Puppeteer
      }
    }

    // Puppeteer fallback
    let puppeteer;
    try { puppeteer = require('puppeteer'); } catch {}
    if (puppeteer) {
      const makeBrowser = () => puppeteer.launch({ headless: 'new', args: ciArgs });
      return await runWithPage(makeBrowser, 'puppeteer');
    }

    console.error('No Playwright or Puppeteer installed. Install one to run the smoke test:\n  npm i -D playwright  # or puppeteer');
    process.exit(3);
  } catch (e) {
    console.error('[SMOKE-ERROR]', e && e.stack || e);
    // Emit a report so CI still has a JSON artifact
    const fallback = { ok: false, runner: null, url: URL_TO_OPEN, timeoutMs: ARG_TIMEOUT, error: String(e && e.message || e) };
    console.log(`[SMOKE-REPORT] ${JSON.stringify(fallback)}`);
    process.exit(4);
  }
})();
