# Teleprompter Pro — Changelog

## Unreleased

No entries yet.

## v1.5.9 — 2025-10-06

Alignment, control, and packaging updates. This build introduces a single scroll authority and begins modularizing the monolith. Known issues remain with edge-case stalls; declaring a baseline now to unblock follow-ups.

- Scroll control
  - Extracted a centralized ScrollManager into core/module: `core/scroll-manager.js` with a PD loop, deadband, and single requestAnimationFrame “flight.”
  - Enforced single-writer gating: ScrollManager’s own animation counts as “anim-active.” Unified cooldown across helpers and catchup.
  - Scroller selection fixed to prefer `#viewer`; early lock to viewer on DOMContentLoaded; fallback swap from HTML/body to `#viewer` when not-scrollable.
  - Teleprompter/catchup unblocked: bypass anim/cooldown holds and accept bounded-advance steps within the deadband; compatible write-locks for catchup/teleprompter.
  - Motion quality: adaptive PD taper near target, quiet write-backoff at low velocity, sub‑pixel write suppression, sticky settle, and microtask post-frame bookkeeping.

- Diagnostics and HUD
  - Result listeners wired; reduced mid-flight spam; summarize animation rejections.
  - HUD autoscroll made polite (only when user is at bottom) and moved reads into rAF to avoid layout warnings. One-time extension error logger added.
  - Rogue writer guard scoped to viewer/doc scroller only (HUD excluded).

- Packaging
  - `teleprompter_pro.html` now loads `core/scroll-manager.js` before `teleprompter_pro.js`.
  - Removed legacy inline ScrollManager from `teleprompter_pro.js` now that core provides `window.SCROLLER`.

- Versioning and artifacts
  - Version bumped to 1.5.9 across manifest/version files and HTML title; new baseline artifact saved as `releases/v1.5.9-baseline.txt` (status: known issues remain).

Known issues
- Edge-case stalls may still occur near target under specific content patterns; further tuning planned.

## v1.5.7 — 2025-09-27

Stability baseline after init/boot fixes and camera/display guards.

- Fix: validateStandardTags now returns a message and properly closes, unblocking core definition.
- Fix: Removed stray closing brace at end of IIFE (syntax error).
- Fix: Declared missing globals (displayReady, camStream, wantCamRTC, camPC, recog, etc.).
- Fix: WebRTC signaling guards — only setRemoteDescription in `have-local-offer`, ignore late answers, only add ICE after remote description.
- Fix: Avoid duplicate cam-offer sends; safer renegotiation on camera switch.
- Improve: Settings helpers resilient before core init; avoid ReferenceErrors.
- Improve: Boot watchdog and trace retained; early minimal boot safe.
- Version: Bump to 1.5.7 and expose `window.APP_VERSION`.

This snapshot is declared the new baseline.

## 1.5.8
ANVIL build: 2025-10-04 00:00
Baseline: fix/scroll-geometry
Notes: Virtual lines, soft advance, junk-anchor gate v2, cluster penalty, end-game easing, stall logs
  
- feat(transcript): enhance marker tracking by logging active line position relative to the marker (e17673d)

