# Teleprompter Pro (v1.6.2)

This is a browser-based teleprompter with display mirroring, speech sync, camera overlay, and convenient editing helpers.

## Notes for contributors

- Camera autoplay/inline
  - Mobile browsers (especially iOS Safari) require the video to be muted and `playsInline` to allow autoplay.
  - We set `video.muted = true`, `video.autoplay = true`, `video.playsInline = true` and also mirror the attributes `playsinline` and `webkit-playsinline` for compatibility.
  - Order matters: set these before assigning `srcObject`, then call `video.play()`; add a user-gesture fallback if autoplay is blocked.

- Help overlay & normalization
  - A shared fallback normalizer (`fallbackNormalize()`) is used when a stricter `normalizeToStandard()` is not provided.
  - Both the Help overlay and the top-bar Normalize button call the same helper to avoid drift.

- Match aggressiveness
  - The aggressiveness select tunes similarity thresholds and window sizes at runtime.
  - The chosen setting is persisted in `localStorage` under `tp_match_aggro_v1`.

- Per-viewport base speed
  - The auto-scroll base speed is now persisted per viewport size to reduce initial tuning on different displays. The primary storage key is of the form `tp_base_speed_px_s@vh=<n>` where `<n>` is the viewport height rounded to the nearest 10 (units: CSS pixels). The code still writes a legacy `tp_base_speed_px_s` key for backward compatibility, and on load the per-viewport key is preferred with a fallback to the legacy key.

- Debug HUD
  - Toggle with `~` to view runtime match and scroll signals; useful for diagnosing alignment.

- Hybrid Auto-Scroll (PLL Controller)
  - Advanced feature that automatically adjusts scroll speed based on speech sync position.
  - Enable in Settings → Advanced → "Hybrid Lock (Auto + Speech)".
  - Features PID-like feedback control, state machine (LOCK_SEEK/LOCKED/COAST/LOST), and guardrails to prevent stalls or jumps.
  - Live readout shows Lead/Lag, Bias percentage, and current state.

## Contributing / Quickstart

### Dev & CI quickstart

**Install**

```bash
npm ci
```

Local checks

```bash
npm run lint      # zero warnings enforced
npm test          # unit tests
```

Run smoke locally

```bash
# serves the repo at http://127.0.0.1:5180 and runs headless smoke
npm run smoke:strict
```

Flags

?dev=1 or localStorage.setItem('tp_dev_mode','1') → DEV extras (HUD, logs)

?ci=1 or localStorage.setItem('tp_ci','1') → CI mode (sets window.\_\_TP_SKIP_BOOT_FOR_TESTS=true)

Matcher escape hatch (temporary):
localStorage.setItem('tp_matcher','legacy') (remove next release)

Scroll writes
All main viewer scrolling goes through window.\_\_tpScrollWrite(y). Direct .scrollTop/.scrollTo is lint-blocked outside the scheduler.

# Optional tiny follow-ups (fast wins)

- Add the **nomodule** fallback in HTML to stop executing the monolith in modern browsers:
  ```html
  <script type="module" src="/src/boot/loader.js"></script>
  <script nomodule src="/teleprompter_pro.js"></script>
  ```

In the workflow, make sure npm run smoke:strict is included after starting the static server (you’ve got this locally; mirror it in CI if not already).

## Dev quickstart

Open `teleprompter_pro.html` in a modern browser (Chromium-based recommended). Grant mic permissions if you want speech sync or the dB meter.

## Tools & developer helpers

There is a small `tools/` folder with developer helpers (Puppeteer runner, safe pre-commit helper). See `TOOLS-README.md` for usage and installation instructions.

## Troubleshooting

- If the camera doesn’t start automatically on iOS, tap the video area to trigger playback.
- DOCX import: tries Mammoth from a CDN first (unpkg, jsDelivr). If offline, it will attempt a local fallback at `vendor/mammoth/mammoth.browser.min.js` if present.
- After importing a `.docx`, the app auto-runs Normalize so the script lands in the exact standard immediately.

## Continuous Integration

This repository includes a GitHub Actions workflow that enforces code quality on pull requests and pushes to `main`.

- Workflow: `.github/workflows/check.yml`
- What it runs: `npm ci` followed by `npm run check` (which runs `eslint` and `tsc` per the `package.json`).
- Purpose: prevent merges that would introduce lint or type errors.

If you maintain the repository you can run the same check locally before pushing:

PowerShell:

```powershell
npm ci
npm run check
```

If you prefer a faster developer loop, run `npm run lint` and `npm run types` separately while coding.

### CI profile & smoke flags

- CI server: `http://127.0.0.1:5180` (set via `CI_HOST`, `CI_PORT`)
- Smoke URL: `/teleprompter_pro.html?ci=1` (app sets `window.__TP_SKIP_BOOT_FOR_TESTS=true`)
- Headless runner: Playwright (preferred) with `npx playwright install --with-deps`; Puppeteer is a fallback if present.

## Testing → Smoke Test

Minimal headless check that Anvil boots and the key UI renders.

**Run locally**

```bash
node tools/static_server.js &
node tools/smoke_test.js --calm --timeout=120000
```

What it checks

- `#tp_toast_container` (toast host)
- `#scriptSlots` (scripts UI area)
- `window.__tp_init_done` (set by `tpMarkInitDone()` at the end of init)

Captures console to flag duplicate boot attempts

Duplicate boot handling

By default, duplicate boot is a warning if `initDone=true` (guard blocks side effects).

Set `SMOKE_STRICT_DUPBOOT=1` to fail CI on duplicate boot:

```bash
SMOKE_STRICT_DUPBOOT=1 node tools/smoke_test.js --calm
```

The smoke prints a one-line JSON summary:

```
[SMOKE-REPORT] {"ok":true,"runner":"puppeteer","dupBoot":true,...}
```

### TypeScript in a hybrid JS/TS repo

The repo contains legacy JS plus new TS. We stage the migration:

1. Build references first (they emit `.d.ts`):

```bash
npm run build:logic
```

2. Type-check without emitting JS:

```bash
npm run typecheck
```

Why exclude `src/build-logic/**`?
Those are prebuilt declaration artifacts; excluding them avoids TS6305 “expected outputs” churn while we incrementally convert.

Why `checkJs: false` (temporary)?
Legacy JS is noisy under TS. We'll re-enable it per-folder as we migrate (see “Migration plan” below).

Flip `checkJs` back on later by:

- adding `// @ts-check` to files you're ready to enforce, or
- using folder `tsconfig.json` with `checkJs: true` scoped to the new TS/JS you want strict.
