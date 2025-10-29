const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Choose host/port (allow overrides via env or argv)
const DEFAULT_HOST = process.env.CI_HOST || '127.0.0.1';
let PORT = 5180; // default for CI
const envPort = parseInt(process.env.PORT || process.env.CI_PORT, 10);
if (!Number.isNaN(envPort) && envPort >= 0 && envPort < 65536) {
  PORT = envPort;
} else {
  const argNum = process.argv.find((a) => /^\d+$/.test(String(a)));
  const argPort = argNum ? parseInt(argNum, 10) : NaN;
  if (!Number.isNaN(argPort) && argPort >= 0 && argPort < 65536) {
    PORT = argPort;
  }
}
const HOST = process.env.CI_HOST || DEFAULT_HOST;

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json; charset=utf-8';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  try {
    const u = decodeURI(req.url.split('?')[0]);
    let file = path.join(ROOT, u);
    // Directory default to teleprompter_pro.html for '/'
    if (u === '/' || u === '') {
      file = path.join(ROOT, 'teleprompter_pro.html');
    }
    // Prevent path traversal
    if (!file.startsWith(ROOT)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    fs.stat(file, (err, st) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      if (st.isDirectory()) {
        file = path.join(file, 'index.html');
      }
      fs.readFile(file, (err2, data) => {
        if (err2) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.setHeader('Content-Type', contentType(file));
        res.end(data);
      });
    });
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    // Port already in use: assume another step already started the server.
    console.log(`[static-server] port ${PORT} already in use on ${HOST}; assuming server already running`);
    // If this script is being required by another module (e.g., smoke_test.js),
    // don't terminate the parent process. Only exit when executed directly.
    try {
      if (require && require.main === module) {
        process.exit(0); // exit successfully so CI doesn't fail
      }
      // When required, just return early and let the caller continue.
      return;
    } catch {
      // In non-CommonJS contexts, fall back to non-fatal behavior
      return;
    }
  }
  console.error('[static-server] error:', err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('[static-server] serving', ROOT, 'on', `${HOST}:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

module.exports = server;

