---
build: anvil-1.7.6
commit: main
date: 2025-12-10
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
- Other JS stubs still shipped for back-compat: `obs.js`, `hotkey.js`, `bridge.js`, `events.js`, `help.js`, `ui-sanitize.js`, `asr-types.js`
- Generated logic helpers: `src/build-logic/*.js` (output of `npm run build:logic`)

**Notes**
- `ui-sanitize.js` is intentionally commented out in `teleprompter_pro.html`.
- Display window no longer loads the main TS bundle; it hydrates via `tp_display` snapshots.
- Forge config is injected via `forge-config.js` (sets `window.__forgeSupabaseUrl/__forgeSupabaseAnonKey`).
