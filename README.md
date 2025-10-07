# Teleprompter Pro (v1.5.8)

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

- Debug HUD
  - Toggle with `~` to view runtime match and scroll signals; useful for diagnosing alignment.

## Dev quickstart

Open `teleprompter_pro.html` in a modern browser (Chromium-based recommended). Grant mic permissions if you want speech sync or the dB meter.

## Post-rollback stabilization (working branch)

We rolled main back to v1.5.8 for stability. New work should branch from the stable tag.

- Current work branch: `fix/post-rollback-stabilization` (based on `v1.5.8-stable`)
- Goal: re-introduce improvements incrementally with quick checks between steps.

Guardrails to keep the app stable while iterating:
- Keep a single scroller: `#viewer` must remain the only scrollable container.
- Re-assert invariants after mode/class toggles: call `assertViewerInvariants()` to set `overflowY:auto`, `scrollBehavior:auto`, `overscrollBehavior:contain`, and ensure flex parents are `display:flex` with `min-height:0` and `overflow:hidden`.
- Stop catch-up when the viewer isn’t scrollable: preflight `canScroll(viewer)` and immediately stop auto catch-up if false.
- Avoid SCROLLER for catch-up writes: use the controller’s raw writer under the lock to avoid reject spam when unscrollable.
- HUD isolation: HUD should live on a fixed/contained layer and must not affect layout/scroll geometry.

Micro-checklist for each change:
- [ ] Viewer remains scrollable (mouse wheel + “Catch Up” button work)
- [ ] No repeated `[reject] reason=not-scrollable` logs
- [ ] HUD opens (`~`) and logs without clipping
- [ ] No body/html scrollbars: page gutters are not visible

Quick verification steps:
1) Load `teleprompter_pro.html` and confirm you can scroll the script.
2) Press `~` to open the HUD; ensure it stays fixed and does not shift layout.
3) Toggle snap-only (if available) and confirm viewer stays scrollable.
4) Start/stop speech sync (if supported) and verify auto catch-up stops cleanly on stop.

## Troubleshooting

- If the camera doesn’t start automatically on iOS, tap the video area to trigger playback.
- DOCX import: tries Mammoth from a CDN first (unpkg, jsDelivr). If offline, it will attempt a local fallback at `vendor/mammoth/mammoth.browser.min.js` if present.
- After importing a `.docx`, the app auto-runs Normalize so the script lands in the exact standard immediately.
