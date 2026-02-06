import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const eslintPackageJson = require.resolve('eslint/package.json');
const eslintDir = path.dirname(eslintPackageJson);
const eslintBin = path.join(eslintDir, 'bin', 'eslint.js');

const baseArgs = ['.', '--ext', '.js,.ts', '--ignore-pattern', 'dist/**'];

function isDistAssetsTarget(arg) {
  if (!arg || arg.startsWith('-')) {
    return false;
  }
  const normalized = arg.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
  return normalized === 'dist/assets' || normalized.startsWith('dist/assets/');
}

const extraArgs = process.argv.slice(2).filter((arg) => !isDistAssetsTarget(arg));

const args = [...baseArgs, ...extraArgs];

const result = spawnSync(process.execPath, [eslintBin, ...args], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
