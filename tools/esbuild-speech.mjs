import esbuild from 'esbuild';
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
  target: ['es2020'],
  outdir: 'speech',            // served at /speech/*.js
};

const entries = [
  { in: 'src/speech/orchestrator.ts', outbase: 'src/speech' }, // your main loader
  // add others if you want separate bundles:
  // { in: 'src/speech/recognizer.ts' },
  // { in: 'src/speech/matcher.ts' },
];

const ctx = await esbuild.context({
  entryPoints: entries.map(e => e.in),
  outdir: shared.outdir,
  ...shared,
});

if (watch) {
  await ctx.watch();
  console.log('[esbuild] speech watch on → /speech/*.js');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('[esbuild] speech build → /speech/*.js');
}
