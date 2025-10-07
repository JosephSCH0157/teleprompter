// Tiny read/write scheduler: batches reads before writes per animation frame
(function(){
  'use strict';
  if (window.SCHEDULE) return;
  const reads = [];
  const writes = [];
  let scheduled = false;
  function flush(){
    scheduled = false;
    // READ PHASE
    try {
      for (let i=0;i<reads.length;i++) { try { reads[i](); } catch {} }
    } finally { reads.length = 0; }
    // WRITE PHASE
    try {
      for (let i=0;i<writes.length;i++) { try { writes[i](); } catch {} }
    } finally { writes.length = 0; }
  }
  function schedule(){ if (scheduled) return; scheduled = true; try { requestAnimationFrame(flush); } catch { setTimeout(flush, 16); } }
  function read(fn){ if (typeof fn === 'function') { reads.push(fn); schedule(); } }
  function write(fn){ if (typeof fn === 'function') { writes.push(fn); schedule(); } }
  function flushNow(){ // run both phases immediately in current frame
    if (!scheduled && reads.length === 0 && writes.length === 0) return;
    flush();
  }
  window.SCHEDULE = { read, write, schedule, flush: flush, flushNow };
})();
