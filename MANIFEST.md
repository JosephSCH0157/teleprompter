---
build: anvil-baseline-1.6.0
commit: main
date: 2025-10-12
modules:
	- teleprompter_pro.html (HTML shell; boots dist/index.js TS bundle)
	- teleprompter_pro.css
	- dist/index.js (generated from src/index.ts �?" current runtime SSOT)
	- recorders.js (generated from TS; compatibility surface)
	- display.html
	- scroll-helpers.js (legacy artifact; replaced by src/scroll/scroll-helpers.ts)
	- scroll-control.js (legacy artifact; replaced by src/scroll/scroll-control.ts)
	- io-anchor.js (legacy artifact)
	- scroll/scroll-brain.js (legacy artifact; superseded by src/scroll/scroll-brain.ts)
	- asr-bridge-speech.js (legacy artifact; superseded by src/asr/bridge-speech.ts)
	- asr-types.js (legacy artifact; superseded by src/asr-types.ts)
	- typography-bridge.js (legacy artifact; superseded by src/ui/typography-bridge.ts)
	- features/typography.js (legacy artifact; superseded by src/features/typography.ts)
	- settings/typographyStore.js (legacy artifact; superseded by src/settings/typographyStore.ts)
	- ui/typography-bridge.js (legacy artifact; superseded by src/ui/typography-bridge.ts)
	- features/step-scroll.js (legacy artifact; superseded by src/features/scroll/step-scroll.ts)
	- features/rehearsal.js (legacy artifact; superseded by src/features/rehearsal/rehearsal.ts)
	- features/rehearsal-bus.js (legacy artifact; superseded by src/features/rehearsal/rehearsal-bus.ts)
	- features/display-sync.js (legacy artifact; superseded by src/features/display-sync.ts)
	- debug-tools.js
	- debug-seed.js
---

# ANVIL Manifest

**Build**: 2025-10-12 00:00  
**Baseline**: feature/pll-controller  
**Dev Mode**: ON when ?dev=1 or localStorage tp_dev_mode=1

## Entry Points
- App HTML: ./teleprompter_pro.html
- TS bundle (current runtime): ./dist/index.js (built from src/index.ts)
- Recorders bridge: ./recorders.js (generated from TS)
- Legacy artifacts (kept for pre-1.7.x bundles/docs): ./teleprompter_pro.js, ./scroll-helpers.js (superseded by src/scroll/scroll-helpers.ts), ./scroll-control.js (superseded by src/scroll/scroll-control.ts), ./scroll/scroll-brain.js (superseded by src/scroll/scroll-brain.ts), ./asr-bridge-speech.js (superseded by src/asr/bridge-speech.ts), ./asr-types.js (superseded by src/asr-types.ts), ./typography-bridge.js (superseded by src/ui/typography-bridge.ts), ./features/typography.js (superseded by src/features/typography.ts), ./settings/typographyStore.js (superseded by src/settings/typographyStore.ts), ./ui/typography-bridge.js (superseded by src/ui/typography-bridge.ts), ./features/step-scroll.js (superseded by src/features/scroll/step-scroll.ts), ./features/rehearsal.js (superseded by src/features/rehearsal/rehearsal.ts), ./features/rehearsal-bus.js (superseded by src/features/rehearsal/rehearsal-bus.ts), ./features/display-sync.js (superseded by src/features/display-sync.ts), ./io-anchor.js
- HUD: ./debug-tools.js

## Flags & Storage
- URL: ?dev=1 (enables dev)  
- localStorage: tp_dev_mode=1, tp_calm=1

## Known Issues
- Calm Mode routes many scroll paths but some direct writes may still bypass helpers.
- MutationObserver anchoring may need throttle if logs show redundant anchors.

## Repro Steps
1) Open teleprompter_pro.html in a browser
2) Load sample text via Controls > Load sample text
3) Click Start speech sync (if supported) or simulate matches; observe HUD logs (~ to toggle)

## Files of Interest
- Anchors: ./io-anchor.js
- Scroll driver/control: ./scroll-control.js
- HUD installer: ./debug-tools.js

## Test Content
- Add your own script content in the editor; debug seed file is included as ./debug-seed.js.

## Recent Dev Changes (Unreleased)
- Monotonic commit with hysteresis and per-commit jump caps; throttled commit application.
- Distance-penalized ranking with rarity gating; duplicate-line penalty (HUD visible).
- Jitter meter with auto-elevated thresholds; Lost Mode with high‑IDF 3‑gram re-anchoring.
- Calm Mode end-of-script cap relaxation; dynamic ease step to avoid late-script slowdown.
- End-of-script guard to stop further scrolling at bottom.
