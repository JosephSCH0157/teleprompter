# Teleprompter Pro 1.7.5

Added

- Camera toggle: busy spinner while starting.
- Event: `tp:preroll:done` (with `detail.source`).
- Central preroll hooks for logging and gating start behavior.

Changed

- Auto-scroll starts only after pre-roll completes across Hybrid/WPM/Timed.
- Rehearsal UX: Auto chip shows “Manual Only”, auto controls disabled, watermark over script.
- Leaving Rehearsal triggers a pre-roll before resuming movement; Auto is enabled post‑preroll.

Fixed

- Prevent switching into Rehearsal while Speech is running (selector reverts; toast explains why).
- Auto‑record only starts on Speech‑initiated preroll (not on mode-switch prerolls).
