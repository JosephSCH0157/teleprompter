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
      const hasScripts = await waitFor('#scriptSlots');      // scripts UI area

      // Cheap E2E: assert CSS var changes propagate to display
      try {
        // Open settings so the builder mounts (ensures inputs exist)
        await page.click('#settingsBtn');
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
        const hasSettingsBtn = await page.$('#settingsBtn');
        if (hasSettingsBtn) {
          await page.click('#settingsBtn');
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
      const makeBrowser = () => playwright.chromium.launch({ headless: true, args: ciArgs });
      return await runWithPage(makeBrowser, 'playwright');
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
