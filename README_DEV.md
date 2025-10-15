# Dev server & quick QA

This repository includes a lightweight dev server setup and convenience scripts for local QA.

Start the server (PowerShell):

```powershell
# Run from repository root (d:/teleprompter/teleprompter)
.
./dev-start.ps1
```

Stop the server:

```powershell
./dev-stop.ps1
```

Open the app in your browser:

http://localhost:8080/teleprompter_pro.html

Quick QA checklist

- Toasts
  - Click buttons that trigger status messages (camera start/stop, mic request). Confirm toast appears bottom-right.
  - Trigger a script save (Save in Saved Scripts section) and confirm "Script saved" toast appears.

- Scripts UI
  - In the Saved Scripts dropdown, create/save a script, then load it using the Load button. Confirm the editor updates.
  - Rename and Delete operations should show appropriate toasts and update the list.

- Eggs module
  - Press Ctrl+Alt+C to toggle CK mode and check for the small toast "CK on" / "CK off".

Notes

- The dev task in VS Code (`Serve (live-server)`) uses `npx live-server` to provide live-reload when files change.
- If you prefer not to use live reload, start the server via `npx http-server -p 8080 -c-1` instead.
- Modules are used for small helpers; serve over HTTP (file:// may block module imports).
