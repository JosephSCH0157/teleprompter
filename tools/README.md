# Teleprompter E2E Smoke

## Quick Run (deterministic)

```powershell
npm run smoke
# or
node tools/teleprompter_e2e.js --runSmoke --stubObs --shimRecorder --headless
```

Expected output includes a single line:

[SMOKE-REPORT] {"ok":true,"tBootMs":...,"recorderReady":true,"adapterReady":true, ...}

Process exit code 0 = pass, 2 = controlled failure.

## Strict Mode (closer to prod)

```powershell
npm run smoke:strict
# no shim; uses the page's real recorder wiring
```

## Gate & UI crawl

```powershell
npm run gate
```

Runs lint/type/build, the suite of smoke targets, then `node tools/ui_crawl.js` + `node tools/validate_ui_crawl.js` against `teleprompter_pro.html?ci=1`. The crawler currently skips Supabase hydration when `?ci=1` is present to keep the console clean.

## Flags

--runSmoke    Print one-line JSON and exit.
--stubObs     Use WS stub (HELLO/IDENTIFY only).
--shimRecorder Inject minimal recorder so the run is deterministic even without MediaDevices.
--headless    Headless browser.

## Notes
- `smoke` is deterministic and uses the WS stub + recorder shim so CI can run without hardware.
- `smoke:strict` runs without the shim and is intended to be used later to test the real recorder wiring.
