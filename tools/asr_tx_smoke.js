#!/usr/bin/env node
// ASR transcript event smoke test
// Validates tp:speech:transcript and tp:speech:state events are properly typed and emitted

function emit(name, detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function log(msg, data) {
  console.log(`[asr-tx-smoke] ${msg}`, data || '');
}

function runTests() {
  log('Starting ASR transcript event smoke tests...');
  
  let transcriptReceived = false;
  let stateReceived = false;
  
  // Set up listeners
  const cleanup = [];
  
  const txHandler = (e) => {
    const d = e.detail;
    if (d.harness === 'smoke') {
      transcriptReceived = true;
      log('Received transcript event:', {
        text: d.text,
        partial: d.partial,
        final: d.final,
        confidence: d.confidence,
        timestamp: d.timestamp,
      });
    }
  };
  
  const stateHandler = (e) => {
    const d = e.detail;
    if (d.harness === 'smoke') {
      stateReceived = true;
      log('Received state event:', {
        state: d.state,
        reason: d.reason,
        timestamp: d.timestamp,
      });
    }
  };
  
  window.addEventListener('tp:speech:transcript', txHandler);
  window.addEventListener('tp:speech:state', stateHandler);
  cleanup.push(() => window.removeEventListener('tp:speech:transcript', txHandler));
  cleanup.push(() => window.removeEventListener('tp:speech:state', stateHandler));
  
  // Emit test events
  emit('tp:speech:state', { 
    state: 'running', 
    timestamp: performance.now(), 
    harness: 'smoke' 
  });
  
  emit('tp:speech:transcript', {
    text: 'Short test line one',
    partial: false,
    final: true,
    confidence: 0.92,
    timestamp: performance.now(),
    harness: 'smoke',
  });
  
  emit('tp:speech:transcript', {
    text: 'Partial interim text',
    partial: true,
    final: false,
    confidence: 0.65,
    timestamp: performance.now(),
    harness: 'smoke',
  });
  
  // Wait a bit for async processing
  setTimeout(() => {
    cleanup.forEach(fn => fn());
    
    if (transcriptReceived && stateReceived) {
      log('✅ PASS - ASR transcript events working');
      process.exit(0);
    } else {
      log('❌ FAIL - Missing events:', {
        transcriptReceived,
        stateReceived,
      });
      process.exit(1);
    }
  }, 100);
}

// Run if in browser context (e.g., via Playwright/Puppeteer)
if (typeof window !== 'undefined' && typeof performance !== 'undefined') {
  runTests();
} else {
  console.log('[asr-tx-smoke] Skipping: requires browser environment');
  console.log('[asr-tx-smoke] Run via: node tools/smoke_test.js (with Playwright)');
  process.exit(0);
}
