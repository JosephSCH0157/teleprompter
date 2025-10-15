Camera → OBS → Anvil → Output

Overview

This document explains the full flow for recording with the teleprompter (Forge manual) when using a camera and OBS. It shows what happens on the hardware and software sides when the user records with automatic OBS control.

Flow steps

1. Camera (physical)
   - A camera (webcam or external) is connected to the computer and accessible to OBS as a Video Capture Device.
   - Camera provides raw video frames to OBS. If using hardware encoders (NVENC/QuickSync), OBS may use them to offload encoding.

2. OBS
   - OBS receives video from the camera and composes the final program output (scene) according to the currently selected Program Scene.
   - OBS encodes the output as a recording file when recording is active. Recording formats and encoders are configured in OBS settings.
   - OBS WebSocket (v5) exposes control events and commands (StartRecord, StopRecord, GetRecordStatus, SetCurrentProgramScene, RecordStateChanged, etc.).
   - Our teleprompter page uses the adapters/obsBridge.js module to connect to OBS WebSocket and control recording and scenes.

3. Anvil (Teleprompter)
   - The teleprompter (Anvil) page tracks the script timeline and preroll behavior.
   - When "Auto-record with Pre-Roll" is enabled, Anvil performs the following at preroll:
     - Ensures OBS connection (obsBridge.connect) and queries GetRecordStatus.
     - If not recording, optionally sets the configured Program Scene (SetCurrentProgramScene) for scene sanity.
     - Issues StartRecord to OBS.
     - Waits for confirmation via RecordStateChanged (or falls back to GetRecordStatus) and updates the UI rec chip.
   - At endgame (script finished), Anvil issues StopRecord and again confirms via RecordStateChanged or GetRecordStatus.
   - Anvil provides UI chips for connection status (`#obsConnStatus`) and recording state (`#recChip`) and exposes small helper APIs (window.__obsBridge) for other page subsystems.

4. Output (file)
   - OBS writes the recording file to disk as configured. The output file path can be read from StopRecord response (if provided by OBS).</n   - After StopRecord, Anvil will assume recording has completed and may surface the output path in logs or UI if available.

Notes and Guardrails

- Connection and reconnection
  - obsBridge implements exponential backoff reconnects (start 1s, *2 up to 5s max) and updates the `#obsConnStatus` chip when state changes.
  - The bridge attempts to reuse an existing obs-websocket-js client and will clear the client on failures to force a clean reconnect.

- Recording confirmation
  - After Send StartRecord, Anvil listens for RecordStateChanged events to confirm recording started. If no event arrives, the page will query GetRecordStatus and show a UI toast allowing a manual retry.

- Password handling
  - The bridge will prefer a configured password set by the adapter or the page, otherwise the page provides a password via `window.getObsPassword()` (sessionStorage or remembered localStorage when the user checks "Remember password").

- Scene sanity
  - If a default scene is configured in settings, Anvil will call SetCurrentProgramScene before StartRecord to ensure recording starts on the intended scene.

Security

- Passwords are stored in sessionStorage by default for safety; users may opt into persistent localStorage via the "Remember password" setting.
- The web page connects to OBS WebSocket over ws:// or wss:// as configured; ensure network security and local firewall rules are appropriate.

Troubleshooting

- If the `#obsConnStatus` chip shows disconnected:
  - Verify OBS is running and obs-websocket is enabled and listening on the configured address/port.
  - Check the OBS WebSocket password and ensure the page has the correct password.

- If recordings don't start automatically:
  - Confirm "Auto-record with Pre-Roll" is enabled in settings.
  - Check the `#recChip` for an error or retry prompt.

Contact

For additional help, open an issue in the project repository or contact the maintainer.

Recommended OBS Recording Settings

- Recording Filename Formatting: Anvil-{date}-{time}
  - Optionally include {scene} or {profile} if you run multiple setups. Example: Anvil-{date}-{time}-{scene}
- Container: mp4 if you stop recordings cleanly. If you prefer safer behavior against crashes, use mkv and enable "Automatically remux to mp4" on stop in OBS.
- Encoder: use your hardware encoder (NVENC, QuickSync) when available for lower CPU usage.
- Recording path: choose a drive with plenty of free space; the UI warns when free space (as reported by OBS) is under 2GB.

These recommendations ensure predictable filenames and minimize risk of corrupt recordings if OBS or the host crashes during recording.
