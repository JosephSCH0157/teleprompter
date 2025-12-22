import esbuild from 'esbuild';

const entry = 'src/index-hooks/asr-legacy.ts';
const outfile = 'src/index-hooks/asr.js';

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
  target: ['es2020'],
  outfile,
});

console.log('[esbuild] asr smoke build -> src/index-hooks/asr.js');
