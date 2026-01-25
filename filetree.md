# File tree overview

This document highlights the key folders and files that define the teleprompter repository. The authoritative listing (the full `tree /F /A` output) can be regenerated via `tree /F /A > filetree.txt` and is stored in `filetree.txt` for quick reference.

## Bundles, entry points, and assets
- `src/` — the primary TypeScript source tree that drives application logic, UI, and feature modules.
- `dist/` — compiled bundles referenced by the HTML shells (`teleprompter_pro.html`, `display.html`, `account.html`, `login.html`, etc.).
- `teleprompter_pro.html`, `display.html`, `teleprompter_pro.css`, and `assets/` hold the runtime shells and shared visual assets.
- Key bridges and shims (`recorders.js`, `recorders-core.ts`, `obs.js`, `hotkey.js`, `bridge.js`, `help.js`, `ui-sanitize.js`) remain at the repo root for compatibility with legacy loaders.

## Runtime modules
- `asr/`, `speech/`, `hud/`, `settings/`, `controllers/`, `hotkeys/`, `wiring/`, `adapters/`, and `boot/` host transitional runtime glue that still ships in the top-level JS bundle.
- `src/state/types.ts` is the shared TypeScript types anchor that both legacy and new TS consumers reference during the migration.

## Supporting code and tooling
- `tools/` and `scripts/` contain automation (build helpers, smoke tests, release scripts, lint helpers).
- `tests/`, `fixtures/`, `docs/`, and `assets/` capture automated suites, sample data, consumer-facing documentation, and static media.
- `scripts/` and `.husky/` scripts keep developer workflows aligned (`dev-start.ps1`, `dev-stop.ps1`, `ps_static_server.ps1`, `start_server.bat`, etc.).

## Config and infra
- Repository tooling lives in `.github/`, `.vscode/`, `.netlify/`, `.husky/`, plus root files like `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.tsbuildinfo`, ESLint configs, `netlify.toml`, `README.md`, `CHANGELOG.md`, and `MANIFEST.md`.
- Generated bundles and auxiliary modules are listed under `node_modules/` (built output), `dist/`, and `src/build-logic/` (compiled helpers from `src/logic/`).

## Legacy/quarantined code
- `legacy/` and `vendor/` hold frozen scripts that exist only for backward compatibility; refer to `MANIFEST.md` for the migration legend.

## Generated listings
- `filetree.txt` — the up-to-date `tree` snapshot of the working volume.
- `project_tree.txt` — another generated listing that may focus on a subset of the tree.

## Regeneration notes
Run `tree /F /A > filetree.txt` from the repo root to refresh the canonical tree dump, and mirror any high-level layout changes here so this markdown stays human-readable.
