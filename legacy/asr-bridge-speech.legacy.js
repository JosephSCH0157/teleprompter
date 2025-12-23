// asr-bridge-speech.js
// Legacy stub: real ASR / scroll integration now lives in src/index-hooks/asr.ts.
// This file remains only to avoid 404s from older HTML/bundles. It does NOT
// attach listeners or control auto scroll.

(() => {
	function noOp(): void {
		// intentionally empty
	}

	try {
		if ((window as any).__TP_DEV) {
			try { console.debug('[asr-bridge-speech] legacy stub active – no ASR wiring'); } catch {}
		}
		(window as any).__asrBridge = {
			start: noOp,
			stop: noOp,
		};
	} catch {
		// Non-browser contexts: silently ignore
	}
})();
