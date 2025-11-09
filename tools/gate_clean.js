const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repo = 'https://github.com/JosephSCH0157/teleprompter';
const dir = path.join(os.tmpdir(), 'teleprompter-clean');
if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

execSync(`git clone ${repo} "${dir}"`, { stdio: 'inherit' });
process.chdir(dir);
execSync('npm ci', { stdio: 'inherit' });
execSync('npm run gate', { stdio: 'inherit' });
console.log('\n✅ Clean-clone gate PASS\n');
