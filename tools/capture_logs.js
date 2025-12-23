// Capture console logs from index.html and teleprompter_pro.html using Puppeteer
// Usage: node tools/capture_logs.js [--host http://127.0.0.1:8080] [--timeout 8000]

import puppeteer from 'puppeteer';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { host: 'http://127.0.0.1:8080', timeout: 8000 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--host' && args[i + 1]) { out.host = args[++i]; continue; }
    if (a === '--timeout' && args[i + 1]) { out.timeout = Number(args[++i]) || out.timeout; continue; }
  }
  return out;
}

function nowTs() { return new Date().toISOString(); }

async function capturePageLogs(browser, url, timeoutMs) {
  const page = await browser.newPage();
  const logs = [];

  function push(kind, text, extra) {
    logs.push({ t: nowTs(), kind, text, ...extra });
  }

  page.on('console', msg => {
    try {
      push(`console:${msg.type()}`, msg.text(), {});
    } catch {}
  });
  page.on('pageerror', err => push('pageerror', String(err && err.message || err), {}));
  page.on('requestfailed', req => push('requestfailed', `${req.failure()?.errorText || 'failed'}: ${req.url()}`, {}));

  try {
    await page.goto(url, { waitUntil: 'load', timeout: Math.max(10000, timeoutMs + 2000) });
  } catch (e) {
    push('goto-error', `Navigation error: ${e && e.message}`, {});
  }

  // Probe some useful state into logs to make capture deterministic
  try {
    await page.evaluate(() => {
      try { console.log('[probe] location', String(location)); } catch {}
      try { console.log('[probe] __tpBootSrc', (window).__tpBootSrc); } catch {}
      try { console.log('[probe] __TP_DEV', (window).__TP_DEV); } catch {}
    });
  } catch {}

  // Allow any late errors to surface
  await page.waitForTimeout(timeoutMs);

  // Also capture any boot text visible on the page for quick context
  try {
    const title = await page.title();
    push('meta', `title=${title}`, {});
  } catch {}

  await page.close();
  return logs;
}

(async () => {
  const { host, timeout } = parseArgs();
  const urls = [
    `${host}/teleprompter_pro.html?dev=1&ci=1`
  ];

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const all = [];
  try {
    for (const u of urls) {
      const logs = await capturePageLogs(browser, u, timeout);
      all.push({ url: u, logs });
    }
  } finally {
    await browser.close();
  }

  // Pretty print
  for (const { url, logs } of all) {
    console.log(`\n===== LOGS for ${url} =====`);
    if (!logs.length) {
      console.log('(no console output)');
      continue;
    }
    for (const entry of logs) {
      console.log(`${entry.t} | ${entry.kind} | ${entry.text}`);
    }
  }
})();
