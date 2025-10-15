// Local OBS websocket test script
// Usage:
//   node tools/obs_test_local.js ws://192.168.1.198:4455 password
// Or with npx if you don't want to add a dependency:
//   npx node -e "(async()=>{ /* ... */ })()"

import OBSWebSocket from 'obs-websocket-js';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node tools/obs_test_local.js <ws://host:port> [password]');
  process.exit(2);
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
    } catch {}
    process.exit(0);
  } catch (e) {
    console.error('[local-test] connection failed:', e && e.message ? e.message : e);
    try {
      await obs.disconnect();
    } catch {}
    process.exit(3);
  }
})();
