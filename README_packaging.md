# Teleprompter — Portable Usage Guide

This guide shows how to run the teleprompter on a Windows laptop without installing Node, Python, or Git.

## What’s included
- start_server.bat — launches a local web server on port 5180
- ps_static_server.ps1 — PowerShell static server fallback (no installs required)
- teleprompter_pro.html / teleprompter_pro.js / teleprompter_pro.css
- display.html (external display)
- adapters/ and other supporting JS files

## Quick start (no installs)
1) Copy the entire `teleprompter` folder to the laptop.
2) Double‑click `start_server.bat`.
3) When the window prints a URL, open:
   - http://127.0.0.1:5180/teleprompter_pro.html
4) Optional: For the external display, open this on the second screen:
   - http://127.0.0.1:5180/display.html

If Node or Python isn’t installed, the script automatically falls back to the bundled PowerShell server and you’ll see:
- “Falling back to PowerShell static server on http://127.0.0.1:5180/”

## Server order and ports
The batch script tries, in order:
1. Local http-server from node_modules (port 5180)
2. `npx http-server` (port 5180)
3. `python -m http.server` (port 5180)
4. PowerShell `ps_static_server.ps1` (port 5180)

All serve from the teleprompter folder you launched from. The primary URLs printed should include:
- http://127.0.0.1:5180/
- http://<your-lan-ip>:5180/ (only when using Node http-server)

## Common options
- Calm mode and dev HUD: add `?dev=1&calm=1` to the URL
- Load a fixture script: `&fixture=episode-2-data-traps`
  Example:
  http://127.0.0.1:5180/teleprompter_pro.html?dev=1&calm=1&fixture=episode-2-data-traps

## OBS WebSocket
- Default WebSocket URL is `ws://192.168.1.200:4455` (configurable in Settings)
- If OBS isn’t running, the app will continue without it.

## External display
- Open `display.html` on the second screen.
- The main window mirrors scroll positions and orders events to avoid out‑of‑order updates.

## Troubleshooting
- Port already in use (nothing loads):
  - Close other servers or reboot the machine. Then re-run `start_server.bat`.
- Browser shows old code (cache):
  - Press Ctrl+F5 or shift‑refresh to bypass cache.
- Policy prevents running scripts:
  - Try right‑click → “Run as administrator”. The batch uses `-ExecutionPolicy Bypass` only for this one process.
- Server shows port 8080 instead of 5180:
  - Ensure you’re launching the correct `start_server.bat` inside the teleprompter folder. Our script now passes `.` as the served path to avoid quoting issues that force a fallback to 8080.

## Handy URLs
- Main app: http://127.0.0.1:5180/teleprompter_pro.html
- External display: http://127.0.0.1:5180/display.html
- With dev HUD: http://127.0.0.1:5180/teleprompter_pro.html?dev=1&calm=1
- With fixture: http://127.0.0.1:5180/teleprompter_pro.html?dev=1&calm=1&fixture=episode-2-data-traps

---
If you need a one‑file start: double‑click `start_server.bat` and use the “Main app” URL above. The script will choose the best available server automatically.