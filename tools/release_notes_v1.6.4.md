### Fixes

- UI crawl movement probes made robust (guarantee long content; reset scrollTop; detect auto-toggle).
- Safety bridge in `teleprompter_pro.html` now toggles Auto reliably and nudges scroll so headless probes see movement.
- Gate (`npm run gate`) stable across headless runs.

### Dev/CI

- Added crawl validation step; kept benign OBS ws error as WARN (no hard fail).
- Maintains zero-warning ESLint + clean typecheck.
