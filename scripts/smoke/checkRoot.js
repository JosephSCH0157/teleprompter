#!/usr/bin/env node
// Minimal smoke check: GET / and ensure HTTP 200 and HTML content
const http = require('http');
const url = require('url');

const TARGET = process.env.SMOKE_URL || 'http://127.0.0.1:5180/';

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
    const r = await fetchRoot(TARGET);
    console.log('[smoke] status', r.statusCode);
    if (r.statusCode !== 200) {
      console.error('[smoke] unexpected status', r.statusCode);
      process.exit(2);
    }
    const body = (r.body || '').toLowerCase();
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
