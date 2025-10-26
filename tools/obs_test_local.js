// Local OBS websocket test script
// Usage:
//   node tools/obs_test_local.js ws://192.168.1.200:4455 password
// Or with npx if you don't want to add a dependency:
//   npx node -e "(async()=>{ /* ... */ })()"

let OBSWebSocket = null;
try {
  const _req = typeof globalThis !== 'undefined' ? globalThis['require'] : undefined;
  if (typeof _req === 'function') OBSWebSocket = _req('obs-websocket-js');
} catch (_e) {
  // swallow optional require error
  void 0;
}
if (!OBSWebSocket) {
  try {
    const _req2 = typeof globalThis !== 'undefined' ? globalThis['require'] : undefined;
    if (typeof _req2 === 'function') OBSWebSocket = _req2('obs-websocket-js');
  } catch (_e) {
    void 0;
  }
}

if (
  typeof globalThis['process'] !== 'undefined' &&
  globalThis['process'] &&
  globalThis['process'].versions &&
  globalThis['process'].versions.node
) {
  const args = globalThis['process'].argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node tools/obs_test_local.js <ws://host:port> [password]');
    globalThis['process'].exit(2);
  }
  const url = args[0];
  const password = args[1] || '';

  (async function run() {
    const obs = new OBSWebSocket();
    obs.on('ConnectionOpened', () => console.log('[local-test] ConnectionOpened'));
    obs.on('ConnectionClosed', () => console.log('[local-test] ConnectionClosed'));
    obs.on('error', (err) => console.error('[local-test] error', err));

    try {
      console.log('[local-test] connecting to', url);
      await obs.connect(url, password);
      console.log('[local-test] connected, sending GetRecordStatus');
      const status = await obs.call('GetRecordStatus');
      console.log('[local-test] GetRecordStatus response:', status);
      try {
        await obs.disconnect();
      } catch (_e) {
        // ignore disconnect errors
        void 0;
      }
      globalThis['process'].exit(0);
    } catch (e) {
      console.error('[local-test] connection failed:', e && e.message ? e.message : e);
      try {
        await obs.disconnect();
      } catch (_e) {
        void 0;
      }
      globalThis['process'].exit(3);
    }
  })();
} else {
  // Not running in Node — make the file a no-op to satisfy browser/static checks
  try {
    console.debug('[obs_test_local] not running under Node; skipping');
  } catch (_e) {
    void 0;
  }
}

