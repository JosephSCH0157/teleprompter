# Teleprompter Pro (v1.6.1)

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

- Hybrid Auto-Scroll (PLL Controller)
  - Advanced feature that automatically adjusts scroll speed based on speech sync position.
  - Enable in Settings → Advanced → "Hybrid Lock (Auto + Speech)".
  - Features PID-like feedback control, state machine (LOCK_SEEK/LOCKED/COAST/LOST), and guardrails to prevent stalls or jumps.
  - Live readout shows Lead/Lag, Bias percentage, and current state.

## Dev quickstart

Open `teleprompter_pro.html` in a modern browser (Chromium-based recommended). Grant mic permissions if you want speech sync or the dB meter.

## Tools & developer helpers

There is a small `tools/` folder with developer helpers (Puppeteer runner, safe pre-commit helper). See `TOOLS-README.md` for usage and installation instructions.

## Troubleshooting

- If the camera doesn’t start automatically on iOS, tap the video area to trigger playback.
- DOCX import: tries Mammoth from a CDN first (unpkg, jsDelivr). If offline, it will attempt a local fallback at `vendor/mammoth/mammoth.browser.min.js` if present.
- After importing a `.docx`, the app auto-runs Normalize so the script lands in the exact standard immediately.
