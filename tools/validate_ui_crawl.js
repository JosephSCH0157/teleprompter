// tools/validate_ui_crawl.js
// Simple validator for tools/ui_crawl_report.json
// Exits 0 if all required controls are present, 1 otherwise.

const fs = require('fs');
const path = require('path');
const reportPath = path.join(__dirname, 'ui_crawl_report.json');

if (!fs.existsSync(reportPath)) {
  console.error('ui crawl report not found at', reportPath);
  process.exit(2);
}

const raw = fs.readFileSync(reportPath, 'utf8');
let report;
try {
  report = JSON.parse(raw);
} catch (err) {
  console.error('failed to parse JSON:', err && err.message);
  process.exit(2);
}

const clicked = Array.isArray(report.clicked) ? report.clicked : [];

function findByIdCandidates(ids) {
  return clicked.find((c) => c && c.id && ids.includes(c.id));
}
function findByTextRegex(re) {
  return clicked.find((c) => c && typeof c.text === 'string' && re.test(c.text));
}

const expectations = [
  {
    name: 'present',
    ids: ['presentBtn'],
    text: /present\s*mode/i,
    required: true,
  },
  {
    name: 'upload',
    ids: ['uploadBtn', 'openFile', 'fileInput', 'loadFile', 'chooseFile', 'openFileBtn', 'fileUpload'],
    text: /upload|open\s*(file|display)|choose\s*file|load\s*(file|text)/i,
    required: true,
  },
  {
    name: 'startCam',
    ids: ['startCam'],
    text: /start\s*camera/i,
    required: true,
  },
  {
    name: 'stopCam',
    ids: ['stopCam'],
    text: /stop\s*camera/i,
    required: true,
  },
  {
    name: 'record',
    ids: ['recBtn', 'recordBtn', 'startRec', 'startRecording'],
    text: /record|start\s*speech\s*sync/i,
    required: true,
  },
];

let allOk = true;
console.log('Validating UI crawl report:', reportPath);
for (const ex of expectations) {
  const byId = ex.ids && findByIdCandidates(ex.ids);
  const byText = ex.text && findByTextRegex(ex.text);
  if (byId) {
    console.log(`PASS ${ex.name} — matched id: ${byId.id}${byId.text ? ` (text: ${byId.text})` : ''}`);
  } else if (byText) {
    console.log(`PASS ${ex.name} — matched text: ${byText.text}${byText.id ? ` (id: ${byText.id})` : ''}`);
  } else {
    console.error(`FAIL ${ex.name} — no matching id or label found (looked for ids: ${ex.ids.join(', ')})`);
    allOk = false;
  }
}

if (!allOk) {
  console.error('\nOne or more required UI controls are missing from the crawl report.');
  process.exit(1);
}
console.log('\nAll required UI controls found.');
process.exit(0);
