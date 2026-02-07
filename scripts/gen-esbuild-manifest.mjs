import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) {
  console.error('[manifest] dist/ not found; run build first.');
  process.exit(1);
}

const toPosix = (p) => p.split(path.sep).join('/');

const findEntry = () => {
  const direct = path.join(DIST, 'index.js');
  if (fs.existsSync(direct)) return direct;

  const rootEntries = fs
    .readdirSync(DIST)
    .filter((name) => name.endsWith('.js') && name.startsWith('index') && name !== 'index-hooks');
  const rootCandidate = rootEntries
    .filter((name) => /^index[-.\w]*\.js$/.test(name))
    .sort()[0];
  if (rootCandidate) return path.join(DIST, rootCandidate);

  const assetsDir = path.join(DIST, 'assets');
  if (fs.existsSync(assetsDir)) {
    const assetEntries = fs
      .readdirSync(assetsDir)
      .filter((name) => name.endsWith('.js') && name.startsWith('index'));
    const assetCandidate = assetEntries
      .filter((name) => /^index[-.\w]*\.js$/.test(name))
      .sort()[0];
    if (assetCandidate) return path.join(assetsDir, assetCandidate);
  }

  return null;
};

const entryPath = findEntry();
if (!entryPath) {
  console.error('[manifest] unable to locate entry bundle (index*.js).');
  process.exit(1);
}

const relEntry = toPosix(path.relative(DIST, entryPath));
const manifest = {
  entry: `./${relEntry}`,
};

fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('[manifest] wrote dist/manifest.json ->', manifest.entry);
