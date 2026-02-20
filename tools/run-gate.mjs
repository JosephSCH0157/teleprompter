import { spawn } from 'node:child_process';

const steps = [
  ['lint'],
  ['lint:badchars'],
  ['types'],
  ['test:asr-smoke'],
  ['build:router'],
  ['smoke:strict'],
  ['smoke:rehearsal'],
  ['smoke:hud'],
  ['smoke:reh_api'],
  ['ui:crawl'],
  ['ui:crawl:validate'],
];

function runStep(args) {
  return new Promise((resolve, reject) => {
    const name = args.join(' ');
    console.log(`\n=== GATE STEP: ${name} ===`);

    const child = spawn('npm', ['run', ...args], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Step failed: ${name} (exit ${code})`));
    });
  });
}

try {
  for (const step of steps) {
    await runStep(step);
  }
  console.log('\nOK GATE COMPLETE');
} catch (err) {
  console.error('\nFAIL GATE FAILED:', err.message);
  process.exit(1);
}
