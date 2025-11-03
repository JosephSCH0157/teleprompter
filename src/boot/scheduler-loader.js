import { requestWrite } from './scheduler.js';
try {
  window.__tpRequestWrite = requestWrite;
} catch {}

// Also expose a no-op hasPending check
try {
  window.__tpHasPendingWrites = function () {
    return false;
  };
} catch {}
