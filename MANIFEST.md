---
build: anvil-1.7.8
commit: main
date: 2025-12-20
---

# ANVIL Manifest

**Entry points**
- App shell: `teleprompter_pro.html`
- Main bundle: `dist/index.js` (from `src/index.ts`)
- Styles: `teleprompter_pro.css`
- Display shell: `display.html` (mirror-only; no TS bundle)
- Recorder bridge (compat): `recorders.js` (from TS build:compat)
- ASR hook bundle: `dist/index-hooks/asr.js`
- Forge login: `login.html` + `dist/forge/login.js`
- Forge account: `account.html` + `dist/forge/account.js`
- Forge config injector: `forge-config.js`

**Authoritative root layout (source of truth)**
- This section is authoritative. Update here first and mirror README to match.
- Source + build: `src/` is the main TypeScript source; `dist/` is built output.
- Runtime / transitional modules at root: `asr/`, `speech/`, `hud/`, `settings/`, `controllers/`, `hotkeys/`, `wiring/`, `adapters/`, `boot/`, `legacy/`, `vendor/`.
- Shared types (migration anchor): **types.ts** (`src/state/types.ts`) contains shared TypeScript types exported for use across legacy and new TS modules during the migration.
- App entrypoints + static assets: HTML (`teleprompter_pro.html`, `display.html`, `index.html`), CSS (`teleprompter_pro.css`), plus `assets/` and `favicon2.png`.
- Tooling / scripts: `tools/`, `scripts/`, `.husky/`, plus helper scripts (`dev-start.ps1`, `dev-stop.ps1`, `ps_static_server.ps1`, `start_server.bat`).
- Tests / docs: `tests/`, `fixtures/`, `docs/`, plus `README.md`, `CHANGELOG.md`, `MANIFEST.md`.
- Project config + generated listings: `package.json`, `tsconfig.json`, ESLint configs, `netlify.toml`, `.github/`, `.vscode/`, `.netlify/`, `node_modules/`, and generated trees (`filetree.txt`, `project_tree.txt`).

**Where new code goes**
- New features & logic -> `src/` (TypeScript only). If it is net-new or being actively evolved, it starts life here.
- Bridges / shims only -> root runtime folders (e.g. `asr/`, `speech/`, `hud/`) only when adapting legacy code to TS or wiring into `src/`. No greenfield logic outside `src/`.

**Migration legend**
- TS-native (target state): `src/`, `dist/`, `src/state/types.ts`
- Transitional (runtime-critical, migrating or wrapping legacy behavior): `asr/`, `speech/`, `hud/`, `settings/`, `controllers/`, `hotkeys/`, `wiring/`, `adapters/`, `boot/`
- Legacy / frozen (no new logic): `legacy/`, `vendor/`

**Runtime modules (TS source of truth)**
- HUD: `src/hud/*` (loader/controller/toggle)
- Rendering + ingest: `src/render-script.ts`, `src/features/script-ingest.ts`
- Display sync: `src/features/display-sync.ts`
- Scroll brain/router: `src/scroll/*`
- Recorder registry/backends: `src/recording/*`
- Forge auth/profile: `src/forge/*`
- Easter eggs (TS): `src/ui/eggs.ts`

**Legacy kept for compatibility (quarantined)**
- Legacy HUD/debug and ASR stub: `legacy/debug-tools.legacy.js`, `legacy/debug-seed.legacy.js`, `legacy/asr-bridge-speech.legacy.js`
- Legacy eggs: `legacy/eggs.legacy.js`
- Archived pre-TS scroll/rehearsal helpers: `legacy/features/*.js`, `legacy/scroll/scroll-brain.js`
- Other JS stubs still shipped for back-compat: `obs.js`, `hotkey.js`, `bridge.js`, `events.js`, `help.js`, `ui-sanitize.js`, `asr-types.js`
- Generated logic helpers: `src/build-logic/*.js` (output of `npm run build:logic`)

**Generated modules**
- `src/build-logic/**` — compiled from `src/logic/**` via `npm run build:logic` (do not edit)

**Notes**
- `ui-sanitize.js` is intentionally commented out in `teleprompter_pro.html`.
- Display window no longer loads the main TS bundle; it hydrates via `tp_display` snapshots.
- Forge config is injected via `forge-config.js` (sets `window.__forgeSupabaseUrl/__forgeSupabaseAnonKey`).
- Dev/QA: HUD/diagnostics temporarily disabled (no `#hud-root`; HUD boot gated; hudLog is console-only) while HUD v2 is redesigned.
- Settings invariants: single overlay (`#settingsBody`), `mountSettings` rebuilds + wires once, `wireSettingsDynamic` guarded by `data-tpSettingsWired`, every card stores a `data-wired` flag, mic/cam selects use the helpers added in `src/ui/settings/wire.ts`, closing Settings is purely visual, and `npm run gate` (which rewrites `tools/ui_crawl_report.json`) must pass before landing.
