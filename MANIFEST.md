---
build: anvil-baseline-1.6.0
commit: main
date: 2025-10-12
modules:
	- teleprompter_pro.html
	- teleprompter_pro.js
	- teleprompter_pro.css
	- display.html
	- scroll-helpers.js
	- scroll-control.js
	- io-anchor.js
	- recorders.js
	- debug-tools.js
	- debug-seed.js
---

# ANVIL Manifest

**Build**: 2025-10-12 00:00  
**Baseline**: feature/pll-controller  
**Dev Mode**: ON when ?dev=1 or localStorage tp_dev_mode=1

## Entry Points
- App HTML: ./teleprompter_pro.html
- Main script: ./teleprompter_pro.js
- Scroll helpers: ./scroll-helpers.js
- Speech/anchor: ./io-anchor.js
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
