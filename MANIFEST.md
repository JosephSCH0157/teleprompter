# ANVIL Manifest

**Build**: 2025-10-03 21:15  
**Baseline**: fix/scroll-geometry  
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
- Add your own script content in the editor; no separate debug seed file currently.
