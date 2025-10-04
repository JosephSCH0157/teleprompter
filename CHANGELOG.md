# Teleprompter Pro — Changelog

## Unreleased

Stability and alignment improvements across matching, scrolling, and observability.

- Match/Scroll
	- Monotonic commit with hysteresis: require two stable hits before committing; per-commit step cap (max 6 indices); stricter backtracking (sim ≥ 0.86), forward sim ≥ 0.82; commit application throttled (~8/sec).
	- Distance-penalized candidate ranking with rarity gating: long jumps only accepted when the spoken phrase is distinctive (IDF sum ≥ 8); closer candidates favored. Junk-anchor gate v2: forbid >6-word jumps when the spoken tail is entirely junk tokens (so/and/…); keep small +8 hops only when accompanied by a distinctive token.
	- Duplicate-line disambiguation: subtract 0.08 from rank when paragraph text appears more than once; HUD shows dup, dupCount, dupPenalty.
	- Line-cluster disambiguation: penalize repeated beginnings (first 4 tokens) by ~0.06 to avoid bouncing within phrase families (e.g., “exactly … they stop … they miss …”).
	- Dynamic forward window shrink when tail tokens are common nearby to reduce far jumps in repetitive text.
	- End-of-script guard: stop scrolling when viewer is at the bottom.
	- End-game easing: tiny sim boost near the last ~30 words to reduce stalls; recheck bottom guard to never continue scrolling when at/near bottom.
	- Calm Mode: relax jump caps near end of script and increase ease step dynamically to avoid perceived slowdown.
	- Lost Mode: after jitter spike or sustained low similarity, freeze commits and re-anchor using high‑IDF 3‑gram anchors (excluding stop-words) in a widened local band.
	- Jitter meter: rolling std-dev of (bestIdx − idx) with temporary threshold elevation (~8s) on spikes.
 	- Virtual lines: merge short runts into “virtual lines” for ranking/dup gating to reduce jitter on very short lines while preserving original highlighting via index mapping.
 	- Coverage-based soft advance: when lingering on the same virtual line and coverage ≥ 0.82 for ~1.8s, allow a small forward hop if the next line meets a modest sim floor (≥ 0.68) to prevent stalls.

- Speech
	- Phrase hints via SpeechGrammarList (JSGF) with small weight (0.4) for domain terms (ban, confiscation, transfer, possession); maxAlternatives increased.

- HUD/Debug
	- Candidate vs commit logs separated; sim histogram and time-between-commits retained; scroll WPS gated to speech and started on first write; quiet filter for noisy tags.
	- Jitter and Lost Mode events logged; duplicate penalty fields surfaced in candidate logs (includes both original and virtual duplication info); spoken tail and line keys normalized to matcher tokens.

- Scheduling/Fallback
	- Single-writer scroll scheduler; throttled commit applier and at-bottom guard; fallback nudge backoff; mid-band sim (0.72–0.80) patience (≈300ms) before nudging.

- Versioning
	- Bump to 1.5.8; update MANIFEST, VERSION.txt, HTML title, and APP_VERSION. HUD version label reflects new version.
 	- Saved new baseline artifact: releases/v1.5.8-solid-baseline.txt

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
