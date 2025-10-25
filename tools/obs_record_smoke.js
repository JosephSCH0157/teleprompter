// tools/obs_record_smoke.js
// Usage: node obs_record_smoke.js ws://127.0.0.1:4455 <password>
// Connects, gets record status, starts recording if not active, waits ~3s, then stops and prints result.

(async () => {
  const args = process.argv.slice(2);
  const url = args[0];
  const password = args[1];
  if (!url || !password) {
    console.error('Usage: node obs_record_smoke.js ws://host:port <password>');
    process.exit(2);
  }

  try {
    const mod = require('obs-websocket-js');
    const OBSWebSocket = mod.default || mod.OBSWebSocket || mod.OBSWebSocketClient || mod;
    const obs = new OBSWebSocket();

    console.log('[smoke] connecting to', url);
    await obs.connect(url, password);
    console.log('[smoke] connected');

    const status = await obs.call('GetRecordStatus');
    console.log('[smoke] GetRecordStatus =>', status);

    let started = false;
    if (!status.outputActive) {
      console.log('[smoke] Not recording — calling StartRecord()');
      const startRes = await obs.call('StartRecord');
      console.log('[smoke] StartRecord =>', startRes);
      started = true;
    } else {
      console.log('[smoke] OBS already recording — skipping StartRecord');
    }

    // Let it roll briefly
    await new Promise((r) => setTimeout(r, 3000));

    if (started) {
      const stopRes = await obs.call('StopRecord');
      console.log('[smoke] StopRecord =>', stopRes);
      if (stopRes && stopRes.outputPath) console.log('[smoke] Saved file:', stopRes.outputPath);
    } else {
      console.log('[smoke] Not stopping because we did not start recording in this run');
    }

    try {
      await obs.disconnect();
    } catch {}
    process.exit(0);
  } catch {
    console.error('[smoke] ERROR', e && e.message ? e.message : e);
    process.exit(3);
  }
})();

