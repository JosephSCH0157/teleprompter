// Simple OBS WebSocket v5 test script
// Usage: node obs_test.js <url> <password>
// Example: node obs_test.js ws://127.0.0.1:4455 mypassword

const args = process.argv.slice(2);
const url = args[0] || 'ws://127.0.0.1:4455';
const password = args[1] || '';

async function main() {
  try {
    const OBSWebSocket = require('obs-websocket-js').default || require('obs-websocket-js');
    const obs = new OBSWebSocket();
    console.log('[obs_test] connecting to', url);
    await obs.connect(url, password);
    console.log('[obs_test] connected. Calling GetRecordStatus...');
    const resp = await obs.call('GetRecordStatus');
    console.log('[obs_test] GetRecordStatus =>', JSON.stringify(resp, null, 2));
    try {
      await obs.disconnect();
    } catch {}
    process.exit(0);
  } catch (err) {
    console.error('[obs_test] ERROR:', err && err.message ? err.message : err);
    process.exit(2);
  }
}

main();
