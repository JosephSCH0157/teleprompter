# Teleprompter Pro (v1.7.8)

Browser-based teleprompter with mirrored display, speech/scroll helpers, recording pills, and a TS-only runtime (`dist/index.js`).

## Highlights
- Single ESM entry (`dist/index.js`) with idempotent feature init (`__tpInit`, `[TP-READY]` log).
- Display mirror via `tp_display` snapshots; display window runs mirror-only JS (no main bundle).
- HUD and easter eggs are TypeScript (`src/hud/*`, `src/ui/eggs.ts`); legacy HUD/debug live in `legacy/`.
- Forge auth shell: `/login` and `/account` use `forge-config.js` for Supabase URL/key injection.

## Repo layout
- App shells: `teleprompter_pro.html`, `display.html`
- Main bundle: `dist/index.js` (from `src/index.ts`)
- Styles: `teleprompter_pro.css`
- ASR hook: `dist/index-hooks/asr.js`
- Forge pages: `login.html` → `dist/forge/login.js`, `account.html` → `dist/forge/account.js`
- Legacy/compat: `recorders.js`, stubs in `legacy/` (kept for older bundles)

## Getting started
Requires Node 18+.

```bash
npm ci
npm run dev          # live-server on 8080 (open teleprompter_pro.html)
# or
npm run build:ts     # produce dist/index.js
```

Quick flags:
- `?dev=1` or `localStorage.setItem('tp_dev_mode','1')` → dev HUD/logs
- `?ci=1` or `localStorage.setItem('tp_ci','1')` → CI profile (`__TP_SKIP_BOOT_FOR_TESTS`)
- `?mockFolder=1` → deterministic mapped-folder fixture list
Test helper (dev/test only):
- `window.__TP_TEST_SKIP_BOOT__ = true` lets unit tests import `src/index.ts` without running boot. Honored only when dev mode is enabled (`?dev=1`, `#dev`, or `localStorage.tp_dev_mode=1`).


Scroll writes: main viewer scrolling goes through `window.__tpScrollWrite(y)`; direct `scrollTop` is lint-blocked outside the scheduler.

## Common scripts
- `npm run lint`      ESLint (TS/JS)
- `npm run types`      Type-check (tsc, no emit)
- `npm run check`      lint + types
- `npm run check:cycles` madge circular-deps (`src/index.ts`)
- `npm run test`       Jest unit/DOM tests
- `npm run smoke:strict` headless smoke (Playwright preferred)
- `npm run build`      ts bundle + compat + speech + HUD

CI (`.github/workflows/check.yml`) runs: `npm run check && npm run check:cycles && npm run smoke:strict`.

## Dev / QA notes
- HUD: toggle via dev flags; close fully hides the root. Dev HUD hotkey `~` (legacy HUD lives in `legacy/`).
- Eggs: Ctrl+Alt+C toggles CK theme; Konami toggles `savanna`; `:roar` in editor shows the lion overlay.
- Recording: Settings → Recording and Start/Stop buttons drive the recorder registry (bridge + OBS when enabled). Recorder pills mirror to display via `tp_display`.
- Script ingest: sidebar Load renders locally and broadcasts to display; display requests a snapshot on open.

## Portable / offline usage (Windows)
Files: `start_server.bat`, `ps_static_server.ps1`, `teleprompter_pro.html`, `teleprompter_pro.css`, `dist/index.js`, `display.html`, `recorders.js`, adapters/.

Steps:
1) Copy the whole `teleprompter` folder to the laptop.
2) Double-click `start_server.bat`.
3) Open http://127.0.0.1:5180/teleprompter_pro.html
4) For the external display: http://127.0.0.1:5180/display.html

The script tries (port 5180): local http-server → `npx http-server` → `python -m http.server` → PowerShell fallback. If port is busy, close other servers or reboot. Use Ctrl+F5 to bypass cache.

Handy URLs:
- Main app: http://127.0.0.1:5180/teleprompter_pro.html
- Display: http://127.0.0.1:5180/display.html
- Dev HUD: add `?dev=1&calm=1`
- Fixture: add `&fixture=episode-2-data-traps`

## Troubleshooting
- Camera autoplay on iOS: tap video if muted autoplay is blocked.
- DOCX import: tries CDN (unpkg/jsDelivr), falls back to `vendor/mammoth/mammoth.browser.min.js` if present.
- Display blank when opened late: ensure `tp_display` snapshot handshake is active (display requests `tp:script:request`, main responds).

## Design docs
- Sitemap & wireframes: `docs/sitemap-wireframes.md`
- TS migration plan: `docs/TS_MIGRATION.md` (build `src/logic` via `npm run build:logic` for d.ts outputs)

## Packaging / release bumps
- Visible version in HTML is bumped by `npm run postversion` (runs `tools/bump_html_version.js`).
- Legacy HUD/debug and eggs are quarantined under `legacy/`; lint ignores them.
