#!/usr/bin/env node
// CommonJS smoke check for projects using "type": "module" in package.json
const http = require('http');
const url = require('url');

const TARGET = process.env.SMOKE_URL || 'http://127.0.0.1:5180/';
const MAX_ATTEMPTS = parseInt(process.env.SMOKE_RETRIES || '10', 10);
const RETRY_DELAY_MS = parseInt(process.env.SMOKE_DELAY_MS || '300', 10);

function fetchRoot(target) {
  return new Promise((resolve, reject) => {
    const u = url.parse(target);
    const opts = { hostname: u.hostname, port: u.port || 80, path: u.path || '/', method: 'GET', timeout: 8000 };
    const req = http.request(opts, (res) => {
      const { statusCode } = res;
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

(async function main(){
  try {
    console.log('[smoke] fetching', TARGET);
    let lastErr = null;
    let result = null;
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      try {
        if (i > 1) console.log(`[smoke] attempt ${i}/${MAX_ATTEMPTS}`);
        result = await fetchRoot(TARGET);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        // wait before retrying
        await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
      }
    }
    if (!result) {
      console.error('[smoke] failed to fetch root after retries', lastErr && lastErr.message);
      process.exit(4);
    }
    console.log('[smoke] status', result.statusCode);
    if (result.statusCode !== 200) {
      console.error('[smoke] unexpected status', result.statusCode);
      process.exit(2);
    }
    const body = (result.body || '').toLowerCase();
    if (!body.includes('<html') && !body.includes('teleprompter')) {
      console.error('[smoke] unexpected body (no html or teleprompter keyword)');
      process.exit(3);
    }
    console.log('[smoke] ok — root looks good');
    process.exit(0);
  } catch (err) {
    console.error('[smoke] error', err && err.message);
    process.exit(4);
  }
})();
