# File tree overview

Last updated: 2026-02-10

This file is the human-readable map of the repo. The full machine listing is kept in `filetree.txt` (and `project_tree.txt` for alternate snapshots).

## Runtime entry surfaces
- `teleprompter_pro.html` is the main app shell.
- `display.html` is the paired display window shell.
- `login.html`, `account.html`, `reset.html`, and `pricing.html` are auth/account pages.
- `teleprompter_pro.css` and `assets/` provide shared styling and static assets.

## Source of truth (TypeScript)
- `src/` is the primary implementation tree.
- `src/features/` contains feature modules and runtime wiring.
- `src/features/scroll/` contains the scroll router and mode logic.
- `src/features/scroll-session.ts` drives session-phase auto-scroll bootstrap.
- `src/features/preroll-session.ts` handles countdown/preroll to live transition.
- `src/features/auth-unlock.ts` contains trial/auth gating behavior.
- `src/forge/authProfile.ts` is the Forge auth profile helper.
- `src/index-app.ts` and `src/index.ts` remain key boot/wiring entrypoints.

## Build outputs and compatibility layers
- `dist/` is generated output consumed by runtime shells.
- Root compatibility scripts remain for legacy wiring: `recorders.js`, `obs.js`, `hotkey.js`, `bridge.js`, `help.js`, `ui-sanitize.js`.
- Source companions for recorders/bridges remain at root (`recorders.ts`, `recorders-core.ts`, `recorders-bridge-compat.ts`).

## Tooling and automation
- `tools/` holds build helpers, smoke/e2e scripts, lint helpers, and release utilities.
- `tools/run-gate.mjs` runs gate steps with explicit stage banners.
- `tools/check-bad-chars.mjs` enforces character hygiene and ignores generated dirs.
- `scripts/` contains supporting build/dev scripts.

## Tests
- `tests/` is organized by domain: `tests/ui/`, `tests/scroll/`, `tests/recording/`, `tests/speech/`, and `tests/hud/`.

## Documentation and repo config
- Core docs: `README.md`, `MANIFEST.md`, `CHANGELOG.md`, `TOOLS-README.md`, `scroll-mode-ssot.md`.
- Infra/config: `.github/`, `.vscode/`, `.husky/`, `.netlify/`, `package.json`, `tsconfig.json`, `netlify.toml`.

## Legacy and vendor areas
- `legacy/` and `vendor/` store compatibility/frozen code paths.
- `archive/`, `artifacts/`, and `releases/` store historical/generated artifacts.

## Regeneration
- Windows: `tree /F /A > filetree.txt`
- Bash alternative: `find . -print > project_tree.txt`
