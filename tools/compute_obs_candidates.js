// Node-only helper: compute OBS auth candidate values (A..G)
// This file is intended to run under Node.js (uses Buffer/process/require).
// It guards access to Node globals so static checkers won't flag undefined globals.
// @ts-nocheck

/* global require, Buffer, process, atob, btoa */
// Compute OBS auth candidate values (A..G) in Node.js
// Usage:
//   node tools/compute_obs_candidates.js <password> <challenge_b64> <salt_b64>
// Example:
//   node tools/compute_obs_candidates.js mypassword HdcUo+as... kbifDb6n9k3V...

const crypto = require('crypto');

function b64(buf) {
  return Buffer.from(buf).toString('base64');
}

function base64ToBuffer(s) {
  return Buffer.from(s, 'base64');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error(
      'Usage: node tools/compute_obs_candidates.js <password> <challenge_b64> <salt_b64>'
    );
    process.exit(2);
  }
  const [password, challengeB64, saltB64] = args;
  const saltBytes = base64ToBuffer(saltB64);
  const passBytes = Buffer.from(String(password), 'utf8');

  const secretBuf1 = sha256(Buffer.concat([saltBytes, passBytes]));
  const secretBuf2 = sha256(Buffer.concat([passBytes, saltBytes]));
  const secretB641 = b64(secretBuf1);
  const secretB642 = b64(secretBuf2);

  const challengeBytes = base64ToBuffer(challengeB64);
  const challengeUtf8 = Buffer.from(challengeB64, 'utf8');

  const candidates = [];

  // A: hash(utf8(password + secretB641 + challengeB64))
  candidates.push({
    label: 'A',
    auth: b64(sha256(Buffer.from(password + secretB641 + challengeB64, 'utf8'))),
  });
  // B: hash(utf8(secretB641 + challengeB64))
  candidates.push({
    label: 'B',
    auth: b64(sha256(Buffer.from(secretB641 + challengeB64, 'utf8'))),
  });
  // C: hash(secretBuf1 + challengeBytes)
  candidates.push({ label: 'C', auth: b64(sha256(Buffer.concat([secretBuf1, challengeBytes]))) });
  // D: hash(secretBuf1 + utf8(challengeB64))
  candidates.push({ label: 'D', auth: b64(sha256(Buffer.concat([secretBuf1, challengeUtf8]))) });
  // E: hash(utf8(password + secretB642 + challengeB64))
  candidates.push({
    label: 'E',
    auth: b64(sha256(Buffer.from(password + secretB642 + challengeB64, 'utf8'))),
  });
  // F: hash(utf8(secretB642 + challengeB64))
  candidates.push({
    label: 'F',
    auth: b64(sha256(Buffer.from(secretB642 + challengeB64, 'utf8'))),
  });
  // G: hash(secretBuf2 + challengeBytes)
  candidates.push({ label: 'G', auth: b64(sha256(Buffer.concat([secretBuf2, challengeBytes]))) });

  console.log('secretB641:', secretB641);
  console.log('secretB642:', secretB642);
  console.log('candidates:');
  for (const c of candidates) console.log(c.label, c.auth);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
