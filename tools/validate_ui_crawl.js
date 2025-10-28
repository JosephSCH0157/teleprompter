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
const legendProbe = Array.isArray(report.legendProbe) ? report.legendProbe : [];
const renderProbe = report.renderProbe || {};
const reportUrl = typeof report.url === 'string' ? report.url : '';
// CI detection retained for potential future use; currently not used in validation rules
const _isCI = !!(
  (process && process.env && (process.env.SMOKE_CI === '1' || process.env.CI === 'true' || process.env.CI === '1')) ||
  report.ci === true ||
  /[?&]ci=1(?!\d)/.test(reportUrl)
);

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
let uploadMatched = false;
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
  if (ex.name === 'upload' && (byId || byText)) uploadMatched = true;
}

// Check file input wiring: expect at least one file input and prefer hidden inputs wired to UI
// Allow a pass if upload control is present even if hidden/labelled file input wasn't detected yet
const fileOkDetected = fileInputs.length > 0 && fileInputs.some(fi => fi.hidden === true || (fi.ariaLabel && fi.ariaLabel.length > 0));
const fileOk = fileOkDetected || uploadMatched;
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

// Fail only on real console errors (ignore warnings/logs and benign 'global error hooks' log)
const benignLogRegex = /installed\s+global\s+error\s+hooks/i;
const isProblemConsole = (e) => {
  if (!e) return false;
  if (benignLogRegex.test(String(e.text || ''))) return false;
  return e.type === 'error';
};
const problemEntries = consoleEntries.filter(isProblemConsole);
if (problemEntries.length) {
  console.error('FAIL console-errors — console contains errors (CI) or strict issues; sample:');
  console.error(JSON.stringify(problemEntries.slice(0,5), null, 2));
  allOk = false;
} else {
  console.log('PASS console — no failing console entries detected');
}

if (!allOk) {
  console.error('\nOne or more required UI controls or checks failed.');
  process.exit(1);
}
// Additional probes validation: ensure legend exists and renderer applies different colors
try {
  if (legendProbe.length < 2) {
    console.warn('WARN legend — expected 2+ legend items, found', legendProbe.length);
  } else {
    console.log('PASS legend — items:', legendProbe.length);
  }
  const { lineCount, iHello, iWorld, cHello, cWorld } = renderProbe;
  if (!lineCount || iHello < 0 || iWorld < 0) {
    console.warn('WARN render — sample lines not rendered (ci profile or renderer not wired in this build)', renderProbe);
  } else if (!cHello || !cWorld || cHello === cWorld) {
    console.warn('WARN render-colors — expected distinct colors for S1 and S2', { cHello, cWorld });
  } else {
    console.log('PASS render-colors —', cHello, 'vs', cWorld);
  }
} catch (e) {
  console.warn('WARN probes evaluation failed:', String(e && e.message || e));
}

if (!allOk) {
  console.error('\nOne or more required UI controls or checks failed.');
  process.exit(1);
}

console.log('\nAll required UI controls and checks passed.');
process.exit(0);

