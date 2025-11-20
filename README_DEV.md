# Dev server & quick QA

This repository includes a lightweight dev server setup and convenience scripts for local QA.

Start the server (PowerShell):

```powershell
# Run from repository root (d:/teleprompter/teleprompter)
.
./dev-start.ps1
```

Stop the server:

```powershell
./dev-stop.ps1
```

Open the app in your browser:

http://localhost:8080/teleprompter_pro.html

Quick QA checklist

- Toasts
  - Click buttons that trigger status messages (camera start/stop, mic request). Confirm toast appears bottom-right.
  - Trigger a script save (Save in Saved Scripts section) and confirm "Script saved" toast appears.

- Scripts UI
  - In the Saved Scripts dropdown, create/save a script, then load it using the Load button. Confirm the editor updates.
  - Rename and Delete operations should show appropriate toasts and update the list.

- Eggs module
  - Press Ctrl+Alt+C to toggle CK mode and check for the small toast "CK on" / "CK off".

- Debug / Speech HUDs
  - Debug HUD: toggle with `~` to view runtime scroll, match, and speech breadcrumbs.
  - Speech Notes HUD (transcript capture) is gated to dev sessions (`?dev=1` or `window.__TP_DEV`) or explicit prod opt‑in via `localStorage.setItem('tp_hud_prod','1')`.
    - Captures `tp:speech:transcript` + legacy HUD bus events ONLY when: mode is `asr` or `hybrid`, mic is active, and NOT in rehearsal.
    - Finals-only checkbox plus Copy / Export / Clear buttons. Stores last 500 entries in `localStorage` under `tp_hud_speech_notes_v1`.
    - Script auto-injects after the legacy HUD announces readiness (`hud:ready`) so the bus exists first.
    - To enable in production for an admin test: run `localStorage.setItem('tp_hud_prod','1')` in the console and reload.
- Recording
  - Open Settings ▶ Recording and use the Start/Stop recording buttons. Bridge + OBS (when enabled) should both follow the registry commands.
  - Start Present mode or trigger Play/speech sync with `Auto Record` enabled in the store. Recording should auto-start and auto-stop on the same registry without needing legacy shims.

## Runtime notes

- 1.7.6: Teleprompter Pro now boots solely through the TypeScript bundle (`dist/index.js`) via `boot-loader.js`. Legacy `teleprompter_pro.js` only loads when `?legacy=1` (or matching localStorage flags) is set, keeping production aligned with the TS runtime.

Notes

- The dev task in VS Code (`Serve (live-server)`) uses `npx live-server` to provide live-reload when files change.
- If you prefer not to use live reload, start the server via `npx http-server -p 8080 -c-1` instead.
- Modules are used for small helpers; serve over HTTP (file:// may block module imports).

NPM helpers

1. Install dev deps (optional — live-server will also work via npx):

```powershell
npm install
```

2. Run the dev script via npm (alternative to dev-start.ps1):

```powershell
npm run dev
```

3. Run the smoke test (requires Playwright or Puppeteer):

```powershell
npm run smoke
```
