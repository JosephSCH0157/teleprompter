import esbuild from 'esbuild';
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
  target: ['es2020'],
  outdir: 'dist/hud',
};

const entries = [
  { in: 'src/hud/debug.ts', outbase: 'src/hud' },
];

const ctx = await esbuild.context({
  entryPoints: entries.map(e => e.in),
  outdir: shared.outdir,
  ...shared,
});

if (watch) {
  await ctx.watch();
  console.log('[esbuild] hud watch → dist/hud/*.js');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('[esbuild] hud build → dist/hud/*.js');
}
