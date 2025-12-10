# TypeScript Migration Plan (fast, low-risk)

This document explains a staged approach to converting the monolithic legacy JS app into a typed TypeScript codebase while keeping CI and developer workflows stable.

## Goals

- Preserve velocity: no big-bang rewrites.
- Keep the typecheck green at every step.
- Add types and TS modules in small, well-reviewed commits.

## Strategy

1. Surface types only (small files)
   - Start with `src/types/*` for shared shapes (PLL states, scroll geometry, match scores, OBS bridge types).
   - These help when adding types to larger modules later.

2. Convert leaf utilities first
   - Convert pure functions and helpers: `src/match/guards.ts`, `src/match/anchors.ts`, `src/util/text.ts`, `src/util/dom.ts`.
   - These are easy to test and reduce JS noise.

3. Use thin TS facades over legacy JS
   - Create TS files that import legacy JS implementations and re-export typed APIs.
   - Example: `src/ui/format.ts` exports `formatInlineMarkup` but delegates to `ui/format.js` until fully ported.

4. Migrate UI slices last
   - Move settings panels, HUD, and toast manager into small TS modules.
   - Recent moves: HUD is TS-first (`src/hud/*`), eggs are now typed (`src/ui/eggs.ts`), and legacy HUD/eggs live in `legacy/` (ignored by lint/build).

## CI & Build notes
- `src/logic` is a composite project that emits `.d.ts` into `src/build-logic`. Build it first:

```bash
npm run build:logic
```

Then type-check the root:

```bash
npm run typecheck
```

This avoids TS6305 errors about missing outputs.

## Re-enabling `checkJs`
- Keep `checkJs: false` in root tsconfig during the migration.
- When a folder is ready, add a `tsconfig.json` with `checkJs: true` scoped to that folder and enable `// @ts-check` in targeted JS files.

## Rollforward plan
1. Add types for 3-5 core modules per week.
2. Require `npm run typecheck` on main branch CI (already added).
3. Remove `exclude: src/build-logic/**` once declarations are produced by the build system or code is fully migrated.

Happy to pair on the first few conversions (I can open PRs with the small transformations).
