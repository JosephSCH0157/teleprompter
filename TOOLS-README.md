# Teleprompter Tools & Dev Helpers

This file documents the helper scripts and dev tooling included under `tools/` and the robust pre-commit helper used by Husky.

## Goals
- Provide a small, self-contained Puppeteer runner to load `teleprompter_pro.html` for smoke tests and to expose the scroll API.
- Make the pre-commit hook robust: prefer `lint-staged` when available, fall back to `eslint --fix` on staged JS files, and otherwise skip gracefully.

## Install (tools only)
Install tool-specific dev dependencies under the `tools/` folder. This keeps the main project manifest untouched.

PowerShell:
```powershell
cd d:\teleprompter\teleprompter
npm --prefix tools install
```

This installs `puppeteer` for the e2e runner.

## E2E runner (Puppeteer)
Script: `tools/teleprompter_e2e.js`

Usage (PowerShell):
```powershell
npm --prefix tools run e2e
# or run directly after install
node tools/teleprompter_e2e.js
```

Interactive commands available once the runner is ready:
- `scroll <y>` — scroll the page to the given vertical offset (calls `tpScrollTo` if present)
- `eval <js>` — evaluate arbitrary JS in the page context and print the result
- `exit` / `quit` — close the browser and server

Notes:
- Puppeteer downloads a Chromium binary during install. Ensure network access when running `npm --prefix tools install`.
- If you prefer a visible browser for debugging, edit `tools/teleprompter_e2e.js` and set `headless: false` when launching Puppeteer.

## Robust pre-commit helper
File: `tools/precommit-safe.js`
Hook: `.husky/pre-commit` now calls `node tools/precommit-safe.js`

Behavior:
- If a locally installed `lint-staged` exists, the script runs it.
- Otherwise, it finds staged `.js`/`.jsx` files and runs `eslint --fix` (if eslint is available).
- If neither tool exists, the script logs a message and skips lint checks (non-fatal).

This keeps developer workflows flexible while still enforcing checks when available.

## Troubleshooting
- If Husky still fails, ensure `.husky/pre-commit` points to the correct script and that your local Node environment is functional.
- For CI, run `npm run check` from the project root (ensure project devDependencies are installed in CI) to enforce linting and types.

## Contributing
- If you add other helper tools under `tools/`, prefer a single `tools/package.json` to manage their dependencies.
