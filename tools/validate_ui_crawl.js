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
const fileInputs = Array.isArray(report.fileInputs) ? report.fileInputs : [];
const consoleEntries = Array.isArray(report.console) ? report.console : [];

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

// Check file input wiring: expect at least one file input and prefer hidden inputs wired to UI
const fileOk = fileInputs.length > 0 && fileInputs.some(fi => fi.hidden === true || (fi.ariaLabel && fi.ariaLabel.length > 0));
if (fileOk) {
  console.log(`PASS upload-wiring — found ${fileInputs.length} file input(s); example: ${JSON.stringify(fileInputs[0])}`);
} else {
  console.error('FAIL upload-wiring — no hidden or labelled file input detected');
  allOk = false;
}

// Accessibility: ensure matched controls have either id+text or close aria-labels (basic heuristic)
for (const ex of expectations) {
  const candidate = clicked.find(c => c && ( (c.id && ex.ids && ex.ids.includes(c.id)) || (c.text && ex.text && ex.text.test(c.text)) ));
  if (candidate) {
    // require either text or a non-empty id
    if (!(candidate.text && candidate.text.trim().length > 0) && !(candidate.id && candidate.id.trim().length > 0)) {
      console.warn(`WARN ${ex.name}-a11y — matched but no visible label or id for accessibility`);
    }
  }
}

// Fail on any console errors recorded during crawl
const hasConsoleError = consoleEntries.some(e => e && (e.type === 'error' || e.type === 'warning' || (e.type==='log' && /error/i.test(e.text))));
if (hasConsoleError) {
  console.error('FAIL console-errors — console contains errors or warnings; sample:');
  const sample = consoleEntries.filter(e => e && (e.type === 'error' || e.type === 'warning' || (e.type==='log' && /error/i.test(e.text)))).slice(0,5);
  console.error(JSON.stringify(sample, null, 2));
  allOk = false;
} else {
  console.log('PASS console — no errors/warnings detected in console entries');
}

if (!allOk) {
  console.error('\nOne or more required UI controls or checks failed.');
  process.exit(1);
}
console.log('\nAll required UI controls and checks passed.');
process.exit(0);
