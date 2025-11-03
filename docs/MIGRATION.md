Phase 4/5 incremental TypeScript migration

Goals
- Gradually raise TypeScript strictness by directory.
- Keep the legacy JS bundle running while moving pure logic into `src/` as TS.
- Preserve deterministic smoke-based CI gating.

Strategy
1. Root tsconfig.json remains permissive (allowJs/checkJs, strict:false). Add per-directory tsconfig files that extend the root and enable stricter checks (strict:true, noImplicitAny:true, exactOptionalPropertyTypes:true).
2. Use project references and build mode (`tsc -b`) so CI can build strict areas without blocking permissive ones.
3. No new JS: all new code should be TypeScript in `src/`.
4. DI-first: modules accept dependencies rather than reaching into `window`.
5. Shared types: put in `src/types/` only. Keep them minimal to avoid circular deps.

Commands

# Type check everything (no emit)
npm run typecheck

# Manually run tsc build (project refs)
npx tsc -b

# Lint (mixed)
# JS lint
npx eslint "**/*.{js}" --ext .js
# TS lint
npx eslint "src/**/*.{ts,tsx}" --ext .ts,.tsx

CI notes
- CI should run the canonical smoke runner first (tools/teleprompter_e2e.js). If smoke fails, fail the build.
- Then run typecheck (npm run typecheck). Allow type warnings in permissive areas early on.
- Use tsc -b to build strict areas selectively.

Phase 5 (when main < ~3k LOC)
- Carve the monolith into bootstrap.ts, routes/, events/ and stop shipping the legacy JS entry.
- Replace Window.App ambient with a typed DI container passed to bootstrap.

Conversion order suggestions
- Begin with the pure logic modules already extracted (src/logic/*).
- Then hotkeys and validators.
- Add typed OBS bridge interface in src/types/ and convert adapter when stable.

