const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FALLBACK_HTML = path.join(ROOT, 'teleprompter_pro.html');

// Choose host/port (allow overrides via env or argv)
const DEFAULT_HOST = process.env.CI_HOST || '0.0.0.0';
const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
let PORT = 5180; // default for CI

const parsePort = (value) => {
  const n = parseInt(String(value || ''), 10);
  return !Number.isNaN(n) && n >= 0 && n < 65536 ? n : null;
};

const argv = process.argv.slice(2);
const argPortFlag = argv.find((a) => a.startsWith('--port='));
let argPort = argPortFlag ? parsePort(argPortFlag.split('=')[1]) : null;
if (argPort == null) {
  const idx = argv.findIndex((a) => a === '--port');
  if (idx >= 0 && argv[idx + 1]) argPort = parsePort(argv[idx + 1]);
}
const argNum = argv.find((a) => /^\d+$/.test(String(a)));
const argNumericPort = argNum ? parsePort(argNum) : null;

const envPort = parsePort(process.env.TP_SMOKE_PORT || process.env.PORT || process.env.CI_PORT);
if (envPort != null) {
  PORT = envPort;
} else if (argPort != null) {
  PORT = argPort;
} else if (argNumericPort != null) {
  PORT = argNumericPort;
}

const HOST = process.env.CI_HOST || DEFAULT_HOST;

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json; charset=utf-8';
  if (p.endsWith('.webmanifest')) return 'application/manifest+json; charset=utf-8';
  if (p.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (p.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (p.endsWith('.ico')) return 'image/x-icon';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

const BOT_PATH_ALIASES = new Map([
  ['/robots', '/robots.txt'],
  ['/sitemap', '/sitemap.xml'],
  ['/sitemap/', '/sitemap.xml'],
  ['/favicon.ico', '/assets/anvil-favicon.png'],
  ['/apple-touch-icon.png', '/assets/anvil-favicon.png'],
  ['/apple-touch-icon-precomposed.png', '/assets/anvil-favicon.png'],
  ['/manifest.webmanifest', '/site.webmanifest'],
  ['/sitemap_index.xml', '/sitemap.xml'],
  ['/sitemap-index.xml', '/sitemap.xml'],
  ['/wp-sitemap.xml', '/sitemap.xml'],
  ['/feed', '/atom.xml'],
  ['/feed/', '/atom.xml'],
]);

const { createDisplayRelay } = (() => {
  try {
    const relay = require('../dist/net/display-ws-server.cjs');
    if (relay && typeof relay.createDisplayRelay === 'function') {
      return relay;
    }
  } catch (err) {
    console.warn('[display-relay] display relay module not built yet (run npm run build:relay)', err?.message || err);
  }
  return {};
})();

let displayRelay = null;
if (typeof createDisplayRelay === 'function') {
  try {
    displayRelay = createDisplayRelay();
  } catch (err) {
    console.warn('[display-relay] failed to initialize relay', err?.message || err);
  }
}

function sendJson(res, status, body) {
  try {
    const payload = JSON.stringify(body);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(payload);
  } catch (err) {
    res.statusCode = 500;
    res.end('json error');
    console.warn('[static-server] sendJson failed', err);
  }
}

function shouldUseFallback(req, basePath) {
  if (!req || req.method !== 'GET') return false;
  if (!basePath) basePath = (req.url || '/').split('?')[0];
  const clean = (basePath || '').toLowerCase();
  if (clean === '/login' || clean === '/login.html') return false;
  if (clean.startsWith('/display/')) return false;
  if (clean.startsWith('/ws/')) return false;
  return true;
}

function serveFile(res, file, req, basePath) {
  fs.readFile(file, (err2, data) => {
    if (err2) {
      const targetPath = basePath || (req ? (req.url || '/').split('?')[0] : '/');
      if (shouldUseFallback(req, targetPath)) {
        serveFallback(res, req, targetPath);
        return;
      }
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', contentType(file));
    res.end(data);
  });
}

function serveFallback(res, req, basePath) {
  if (!shouldUseFallback(req, basePath)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  if (req.method !== 'GET') {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  fs.readFile(FALLBACK_HTML, (fallbackErr, fallbackData) => {
    if (fallbackErr) {
      res.statusCode = 500;
      res.end('Fallback not available');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fallbackData);
  });
}

function getLanHostCandidate() {
  if (process.env.DISPLAY_HOST) {
    return String(process.env.DISPLAY_HOST).trim() || null;
  }
  const interfaces = os.networkInterfaces();
  for (const device of Object.values(interfaces)) {
    if (!device) continue;
    for (const entry of device) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      return entry.address;
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  try {
    const rawPath = (req.url || '/').split('?')[0];
    const basePath = BOT_PATH_ALIASES.get(String(rawPath || '').toLowerCase()) || rawPath;
    if (basePath === '/display/host') {
      sendJson(res, 200, { host: getLanHostCandidate() });
      return;
    }

    if (basePath === '/login') {
      res.statusCode = 302;
      res.setHeader('Location', '/login.html');
      res.end();
      return;
    }

    if (displayRelay?.tryHandleApi(req, res)) {
      return;
    }

    const u = decodeURI(basePath);
    let file = path.join(ROOT, u);
    // Map root index.js requests to dist output when present (dist-first runtime).
    if (u === '/index.js' || u === '/index.js.map') {
      const distCandidate = path.join(ROOT, 'dist', u.replace(/^\//, ''));
      if (fs.existsSync(distCandidate)) {
        file = distCandidate;
      }
    }
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
        if (shouldUseFallback(req, basePath)) {
          serveFallback(res, req, basePath);
        } else {
          res.statusCode = 404;
          res.end('Not found');
        }
        return;
      }
      if (st.isDirectory()) {
        const candidate = path.join(file, 'teleprompter_pro.html');
        if (fs.existsSync(candidate)) {
          file = candidate;
        } else {
          file = path.join(file, 'index.html');
        }
      }
      serveFile(res, file, req, basePath);
    });
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});

if (displayRelay) {
  displayRelay.attach(server);
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    if (isCi) {
      console.error(`[static-server] port ${PORT} already in use on ${HOST}; refusing to assume existing server in CI`);
      process.exit(1);
    }
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
  if (displayRelay) {
    const hostLabel = HOST === '0.0.0.0' ? 'localhost' : HOST;
    console.log(`[display-relay] pairing API at http://${hostLabel}:${PORT}/display/pair`);
    console.log(`[display-relay] ws endpoint at ws://${hostLabel}:${PORT}/ws/display`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

module.exports = server;
