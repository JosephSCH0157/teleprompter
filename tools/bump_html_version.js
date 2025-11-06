const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const ver = pkg.version;

const file = path.join(__dirname, '..', 'teleprompter_pro.html');
let html = fs.readFileSync(file, 'utf8');

// Update <title>…</title>
html = html.replace(/<title>[^<]*<\/title>/i, `<title>Anvil v${ver}</title>`);

// Optional: if you have a visible version span with id="appVersion" (allow attributes)
html = html.replace(
  /(<span[^>]*id=["']appVersion["'][^>]*>)([\s\S]*?)(<\/span>)/i,
  `$1v${ver}$3`
);

fs.writeFileSync(file, html, 'utf8');
console.log(`Updated HTML version to v${ver}`);
