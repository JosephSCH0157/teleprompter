# Teleprompter Pro — Changelog
## [1.8.2] - 2026-02-06

Release: v1.8.2

### Added

- Audio-only recording mode (Core Recorder) with WAV output and a `REC - AUDIO` badge.
- `robots.txt` to discourage indexing and block common AI/bulk crawlers.

### Changed

- Recording settings now split "Recording Engine" and "Recording Mode"; audio-only is disabled when OBS is selected.
- Camera is only required for Video + Audio; audio-only skips camera validation and hides the camera preview.

## [1.8.0] - 2026-01-21

Release: v1.8

### Added

- Servo-driven display scroll smoothing plus a heartbeat poll so the mirror stays buttery even when the main window jumps lines; the display now animates toward the latest 	argetTop like a continuous motor.

### Changed

- 	p:scriptChanged publishes scroll/rAF heartbeats more frequently so the display mirror samples every motor tick instead of waiting for native scroll events.
- The welcome script seeding now prefers Supabase flags, enforces placeholder detection, and avoids overwriting real scripts or rerunning in display windows.

### Fixed

- Iron Mine tab wiring (Discord link) no longer depends on the legacy page-tab handlers.

## [1.7.8] - 2025-12-20

Release: v1.7.8

### Changed

- ASR scroll driver now forward-biases matches to the scroll cursor and keeps matcher state in sync even on same-line hits.
- ASR scrolling steps in controlled 30px increments with snap-tail handling; display mirror uses the same stepped scroll behavior.
- Added limited final-only backward recovery plus same-line/stagnation nudges to prevent late-script stalls.

### Fixed

- HUD popout direct URL now bootstraps reliably with fallback loader messaging instead of black screen.

### Docs

- Documented AI/API usage and pricing principles in MANIFEST.md and added docs/Trust-Contract.md with a README pointer.


## [1.7.7-pre-stabilization] - 2025-12-06

Release: v1.7.7-pre-stabilization (checkpoint tag)

### Changed

- Display mirror now uses a single scroll/render channel: main sends `{ type: 'scroll', top }` plus `kind:'tp:script'/'tp:typography'`; the display applies the same marker padding as main (no spacer drift, no legacy `scrollTop` channel`).
- Preroll/Start wiring stabilized so session-driven start/stop semantics gate auto-scroll and recording; countdown feeds the scroll brain and `scrollAutoOnLive` rules.
- OBS/settings binders share one SSOT flag; legacy hooks are disabled in the display context.

### Fixed

- First-line alignment on display matches the main marker line after render; no “load at top then race” behavior.

## [1.7.6] - 2025-11-20

Release: https://github.com/JosephSCH0157/teleprompter/releases/tag/v1.7.6

### Changed

- Switched the teleprompter HTML to load the bundled TypeScript runtime (`dist/index.js`) exclusively via the boot loader; no more implicit legacy fallbacks.
- Version metadata now sources from `window.APP_VERSION = '1.7.6'`, keeping the title badge, telemetry, and HUD logs in sync.

### Removed

- Deleted the legacy monolithic scroll stack (`teleprompter_pro.js` entry path) from the default boot sequence so TS remains the only authoritative runtime.

### Added

- `io-anchor.ts` + dev-only guards keep anchor observers and HUD probes isolated to `?dev=1` or `tp_dev_mode` sessions; prod no longer downloads the HUD scripts without an explicit override.

## [1.7.5c] - 2025-11-16

Release: https://github.com/JosephSCH0157/teleprompter/releases/tag/v1.7.5c

### CI

- Added single-source CI script: `npm run ci` runs lint + types + strict smoke.
- Simplified GitHub Actions: `npm ci` + `npm run ci` with no continue-on-error; CI now fails on lint/types/smoke regressions.

### Lint/Types

- ESLint now ignores generated artifacts (`recorders.js`, `adapters/*.js`, and `**/*.map`) to avoid false positives.
- Temporarily applied `// @ts-nocheck` to `recorders.ts` (hybrid JS-in-TS) to unblock typecheck; plan to add types incrementally in a follow-up.

### App

- Visible version bumped to v1.7.5c in `VERSION.txt`, HTML `<title>`, and the UI version badge.
- No functional changes to features; this is a CI/infra alignment release.

## [1.7.5] - 2025-11-16

### Added

- Camera toggle: busy spinner shown while camera starts.
- Event: `tp:preroll:done` emitted after countdown completes with `detail.source`.
- Global preroll hooks: centralized logging and start gates for scroll/recorder.

### Changed

- Auto-scroll now starts only after preroll completes; hybrid/wpm/timed respect countdown.
- Rehearsal UX: top-bar Auto chip becomes gray “Manual Only”, controls disabled, watermark visible.
- Mode switches: leaving Rehearsal triggers a preroll before resuming movement; Auto enabled post-preroll.

### Fixed

- Prevent switching into Rehearsal while Speech is running (selector reverts; toast explains why).
- Auto-recorder starts only on Speech-initiated preroll (not on mode-switch prerolls).

## [1.7.3] - 2025-11-13

### Added

- build:compat script to compile TypeScript sources to in-place JS for runtime.

### Changed

- Migrated `recorders.js`, `adapters/bridge.js`, and `adapters/obs.js` to TypeScript sources (`recorders.ts`, `adapters/bridge.ts`, `adapters/obs.ts`) while preserving existing import surface.

### Fixed

- Ensured recorder/adapter readiness under strict smoke after migration.

## v1.7.1

- chore(mode): remove dev-only select polling shim (SSOT stable)
