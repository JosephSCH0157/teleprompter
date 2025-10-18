const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'releases') continue;
      out.push(...walk(full));
    } else if (e.isFile() && full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const root = path.resolve(__dirname, '..');
const files = walk(root);

const fails = [];
for (const f of files) {
  try {
    const src = fs.readFileSync(f, 'utf8');
    try {
      // Try parsing as module first (handles import/export files)
      acorn.parse(src, { ecmaVersion: 2022, locations: true, sourceType: 'module' });
    } catch {
      try {
        // Fallback to script parsing
        acorn.parse(src, { ecmaVersion: 2022, locations: true, sourceType: 'script' });
      } catch (eScript) {
        fails.push({ file: f, error: eScript.message });
      }
    }
  } catch (e) {
    fails.push({ file: f, error: e.message });
  }
}

if (fails.length) {
  console.log(`PARSE_FAIL ${fails.length} files:`);
  for (const p of fails) console.log(`${p.file}: ${p.error}`);
  process.exit(2);
}
console.log('PARSE_OK');
