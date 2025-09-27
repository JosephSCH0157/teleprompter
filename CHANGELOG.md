# Teleprompter Pro — Changelog

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
