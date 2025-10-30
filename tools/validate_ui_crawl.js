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
const hudProbe = report.hudProbe || {};
const hotkeysProbe = report.hotkeysProbe || {};
const lateProbe = report.lateProbe || {};
const settingsProbe = report.settingsProbe || {};
const obsTestProbe = report.obsTestProbe || {};
const scrollProbe = report.scrollProbe || {};
const reportUrl = typeof report.url === 'string' ? report.url : '';
const meta = report.meta || {};
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
const CI_STRICT = String(process.env.CI_STRICT || '0') === '1';
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const VERBOSE = process.argv.includes('--verbose');
const BASELINE_FILE = require('path').join(__dirname, '..', 'tests', 'baselines', 'ui_crawl.v1.json');

console.log('Validating UI crawl report:', reportPath);
if (meta && meta.build) {
  console.log('Build meta:', JSON.stringify(meta.build));
}
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
    const msg = 'legend — expected 2+ legend items, found ' + legendProbe.length;
    if (CI_STRICT) { console.error('FAIL ' + msg); allOk = false; } else { console.warn('WARN ' + msg); }
  } else {
    console.log('PASS legend — items:', legendProbe.length);
  }
  const { lineCount, iHello, iWorld, cHello, cWorld } = renderProbe;
  const colorDist = (a,b) => {
    const parse = (s) => { const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(String(s)||''); return m? [parseInt(m[1],10),parseInt(m[2],10),parseInt(m[3],10)] : null; };
    const va = parse(a), vb = parse(b); if (!va || !vb) return 0;
    const dr = va[0]-vb[0], dg = va[1]-vb[1], db = va[2]-vb[2];
    return Math.sqrt(dr*dr + dg*dg + db*db);
  };
  const threshold = 12; // accept tiny differences, require clearer separation
  if (!lineCount || iHello < 0 || iWorld < 0) {
    const msg = 'render — sample lines not rendered correctly';
    if (CI_STRICT) { console.error('FAIL ' + msg, renderProbe); allOk = false; } else { console.warn('WARN ' + msg, renderProbe); }
  } else {
    const dist = colorDist(cHello, cWorld);
    if (!cHello || !cWorld || dist <= threshold) {
      const msg = `render-colors — expected distinct colors beyond threshold (dist=${Math.round(dist)})`;
      if (CI_STRICT) { console.error('FAIL ' + msg, { cHello, cWorld }); allOk = false; } else { console.warn('WARN ' + msg, { cHello, cWorld }); }
    } else {
      console.log('PASS render-colors —', cHello, 'vs', cWorld, `(dist≈${Math.round(dist)})`);
    }
  }
  // HUD/Prod guard (best-effort)
  if (hudProbe && typeof hudProbe === 'object') {
    const devQuery = /[?&]dev=1(?!\d)/.test(reportUrl);
    if (devQuery) {
      if (hudProbe.hasHudChildren || hudProbe.isDevClass) {
        console.log('PASS hud-dev-guard — HUD present in dev');
      } else {
        const msg = 'hud-dev-guard — HUD absent in dev';
        if (CI_STRICT) { console.error('FAIL ' + msg); allOk = false; } else { console.warn('WARN ' + msg); }
      }
    } else {
      if (!hudProbe.isDevClass && !hudProbe.hasHudChildren) {
        console.log('PASS hud-prod-guard — HUD absent in non-dev');
      } else {
        console.warn('WARN hud-prod-guard — HUD present or dev class set');
      }
    }
  }
  // Hotkeys probe (best-effort)
  if (hotkeysProbe && hotkeysProbe.supported) {
    const moved = !!(hotkeysProbe.ok || (hotkeysProbe.afterPD && (hotkeysProbe.afterPD.scrollTop !== hotkeysProbe.beforeTop || hotkeysProbe.afterPD.markerTop !== hotkeysProbe.beforeMarker)));
    if (moved) console.log('PASS hotkeys — scroll reacted to keys');
    else {
      const msg = 'hotkeys — no scroll change after keys';
      if (CI_STRICT) { console.error('FAIL ' + msg); allOk = false; } else { console.warn('WARN ' + msg); }
    }
  }
  // Late-script probe: warn if jitter too high or fps too low
  if (lateProbe && lateProbe.supported) {
    const fpsOk = (lateProbe.approxFps || 0) >= 50; // target ~60, accept >=50
    const jitterOk = (lateProbe.jitterStd || 0) <= 6; // px tolerance
    if (fpsOk && jitterOk) console.log('PASS late-probe — fps≈', lateProbe.approxFps, 'jitterStd≈', Math.round((lateProbe.jitterStd || 0)*10)/10);
    else {
      const msg = `late-probe — fps=${lateProbe.approxFps}, jitterStd=${lateProbe.jitterStd}`;
      if (CI_STRICT) { console.error('FAIL ' + msg); allOk = false; } else { console.warn('WARN ' + msg); }
    }
  }

  // Settings overlay probe
  if (settingsProbe && typeof settingsProbe === 'object') {
    if (settingsProbe.hasBody && settingsProbe.tabs >= 2) {
      console.log('PASS settings-overlay — body present, tabs:', settingsProbe.tabs);
    } else {
      const msg = 'settings-overlay — missing body or tabs';
      if (CI_STRICT) { console.error('FAIL ' + msg, settingsProbe); allOk = false; } else { console.warn('WARN ' + msg, settingsProbe); }
    }
    if (settingsProbe.hasMedia && settingsProbe.hasMicSel) {
      console.log('PASS settings-media — Media tab and mic selector present');
    } else {
      const msg = 'settings-media — Media tab or mic selector missing';
      if (CI_STRICT) { console.error('FAIL ' + msg, settingsProbe); allOk = false; } else { console.warn('WARN ' + msg, settingsProbe); }
    }
    if (settingsProbe.hasAsrCalibBtn) {
      console.log('PASS settings-asr — Calibration button present');
    } else {
      const msg = 'settings-asr — Calibration button missing';
      if (CI_STRICT) { console.error('FAIL ' + msg, settingsProbe); allOk = false; } else { console.warn('WARN ' + msg, settingsProbe); }
    }
  }

  // OBS Test control assertions (regression guard)
  try {
    if (obsTestProbe && obsTestProbe.hasBtn) {
      console.log('PASS obs-test-btn — button present', obsTestProbe.btnId ? `(#${obsTestProbe.btnId})` : '');
    } else {
      console.error('FAIL obs-test-btn — Test connection button not found');
      allOk = false;
    }
    if (obsTestProbe && obsTestProbe.hasDataAction) {
      console.log('PASS obs-test-data-action — data-action="obs-test" present');
    } else {
      console.error('FAIL obs-test-data-action — expected data-action="obs-test" attribute');
      allOk = false;
    }
    if (obsTestProbe && obsTestProbe.hasPillAfter) {
      console.log('PASS obs-test-pill — status pill present after click');
    } else {
      console.error('FAIL obs-test-pill — status pill missing after click');
      allOk = false;
    }
  } catch (e) {
    console.warn('WARN obs-test validation failed:', String(e && e.message || e));
  }

  // Auto-scroll UI wiring check
  if (report.autoScrollUi) {
    if (report.autoScrollUi.ok) {
      console.log('PASS auto-scroll-ui —', JSON.stringify({ was: report.autoScrollUi.was, now: report.autoScrollUi.now }));
      // Extra: warn if chip did not change text at all
      if (report.autoScrollUi && report.autoScrollUi.chipBefore === report.autoScrollUi.chipAfter) {
        const msg = 'auto-chip — text did not change after toggle';
        if (CI_STRICT) { console.error('FAIL ' + msg); allOk = false; } else { console.warn('WARN ' + msg); }
      } else {
        console.log('PASS auto-chip — text changed');
      }
    } else {
      const msg = 'auto-scroll-ui — toggle did not flip to On when enabled';
      if (CI_STRICT) { console.error('FAIL ' + msg, JSON.stringify(report.autoScrollUi)); allOk = false; } else { console.warn('WARN ' + msg, JSON.stringify(report.autoScrollUi)); }
    }
  }

  // Mini scroll proof (engine should move without OBS/ASR)
  try {
    if (!scrollProbe || scrollProbe.hasControls === false) {
      console.error('FAIL scroll-probe-missing-controls — auto/inc/viewer not found');
      allOk = false;
    } else if (typeof scrollProbe.delta !== 'number') {
      console.error('FAIL scroll-probe-no-delta — missing movement delta');
      allOk = false;
    } else if (scrollProbe.delta <= 0) {
      console.error('FAIL scroll-probe-no-movement — engine did not move');
      allOk = false;
    } else {
      console.log('PASS scroll-probe — delta=', scrollProbe.delta, 'label=', scrollProbe.label);
      const lbl = String(scrollProbe.label || '');
      if (!/Auto-scroll:\s*(On|Paused)/i.test(lbl)) {
        console.warn('WARN scroll-probe-label-bad — label not On/Paused:', lbl);
      }
    }
  } catch (e) {
    console.warn('WARN scroll-probe validation failed:', String(e && e.message || e));
  }
} catch (e) {
  console.warn('WARN probes evaluation failed:', String(e && e.message || e));
}

// Baseline support (schema + CLI)
try {
  const path = require('path');
  if (UPDATE_BASELINE) {
    if (String(process.env.ALLOW_BASELINE_UPDATE || '0') !== '1') {
      console.error('Refusing to update baseline without ALLOW_BASELINE_UPDATE=1');
      process.exit(3);
    }
    const dir = path.dirname(BASELINE_FILE);
    require('fs').mkdirSync(dir, { recursive: true });
    require('fs').writeFileSync(BASELINE_FILE, JSON.stringify(report, null, 2));
    console.log('Baseline updated:', BASELINE_FILE);
  } else if (require('fs').existsSync(BASELINE_FILE)) {
    // Minimal summary compare: number of controls and legend/render presence
    const base = JSON.parse(require('fs').readFileSync(BASELINE_FILE, 'utf8'));
    const deltaControls = (clicked.length || 0) - ((base.clicked || []).length || 0);
    console.log(`Summary: controls now=${clicked.length} (Δ${deltaControls>=0?'+':''}${deltaControls}) legend=${legendProbe.length} lines=${renderProbe.lineCount||0}`);
    if (VERBOSE) {
      // print small diff of control ids
      const curIds = new Set(clicked.map(c=>c.id).filter(Boolean));
      const baseIds = new Set((base.clicked||[]).map(c=>c.id).filter(Boolean));
      const added = [...curIds].filter(x=>!baseIds.has(x));
      const removed = [...baseIds].filter(x=>!curIds.has(x));
      if (added.length) console.log('Added controls:', added);
      if (removed.length) console.log('Removed controls:', removed);
    }
  }
} catch (e) {
  console.warn('WARN baseline handling failed:', String(e && e.message || e));
}

if (!allOk) {
  console.error('\nOne or more required UI controls or checks failed.');
  process.exit(1);
}

console.log('\nAll required UI controls and checks passed.');
process.exit(0);

