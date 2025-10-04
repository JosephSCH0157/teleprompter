# Teleprompter Pro — Changelog

## Unreleased

Stability and alignment improvements across matching, scrolling, and observability.

- Match/Scroll
	- Monotonic commit with hysteresis: require two stable hits before committing; per-commit step cap (max 6 indices); stricter backtracking (sim ≥ 0.86), forward sim ≥ 0.82; commit application throttled (~8/sec).
	- Distance-penalized candidate ranking with rarity gating: long jumps only accepted when the spoken phrase is distinctive (IDF sum ≥ 8); closer candidates favored.
	- Duplicate-line disambiguation: subtract 0.08 from rank when paragraph text appears more than once; HUD shows dup, dupCount, dupPenalty.
	- Dynamic forward window shrink when tail tokens are common nearby to reduce far jumps in repetitive text.
	- End-of-script guard: stop scrolling when viewer is at the bottom.
	- Calm Mode: relax jump caps near end of script and increase ease step dynamically to avoid perceived slowdown.
	- Lost Mode: after jitter spike or sustained low similarity, freeze commits and re-anchor using high‑IDF 3‑gram anchors (excluding stop-words) in a widened local band.
	- Jitter meter: rolling std-dev of (bestIdx − idx) with temporary threshold elevation (~8s) on spikes.

- Speech
	- Phrase hints via SpeechGrammarList (JSGF) with small weight (0.4) for domain terms (ban, confiscation, transfer, possession); maxAlternatives increased.

- HUD/Debug
	- Candidate vs commit logs separated; sim histogram and time-between-commits retained; scroll WPS gated to speech and started on first write; quiet filter for noisy tags.
	- Jitter and Lost Mode events logged; duplicate penalty fields surfaced in candidate logs.

- Scheduling/Fallback
	- Single-writer scroll scheduler; throttled commit applier and at-bottom guard; fallback nudge backoff; mid-band sim (0.72–0.80) patience (≈300ms) before nudging.

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
