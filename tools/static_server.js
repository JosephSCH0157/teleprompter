const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT || process.argv[2] || '8080', 10);

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

server.listen(PORT, () => {
  console.log('[static-server] serving', ROOT, 'on port', PORT);
});

// Graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

module.exports = server;
