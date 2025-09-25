// Simple recorder adapter registry
// Usage:
//   import { register, get, all } from './recorders.js';
//   register({ id: 'bridge', label: 'Bridge', isAvailable: async () => true, start: async ()=>{}, stop: async ()=>{} });
//   const adapter = get('bridge');
//   const list = all();

/**
 * @typedef {Object} RecorderAdapter
 * @property {string} id                       // e.g. "obs", "companion", "bridge"
 * @property {string} label                    // e.g. "OBS (WebSocket)"
 * @property {() => Promise<boolean>} isAvailable
 * @property {() => Promise<void>} start
 * @property {() => Promise<void>} stop
 * @property {() => Promise<void>} [test]      // optional “Test” button
 * @property {(cfg: any) => void} [configure]  // pass settings in
 */

/** @type {Map<string, RecorderAdapter>} */
const registry = new Map(); // id -> adapter

// Settings and orchestration
const LS_KEY = 'tp_rec_settings_v1';

/**
 * @typedef {Object} RecorderSettings
 * @property {('single'|'multi')} mode
 * @property {string[]} selected
 * @property {Record<string, any>} configs
 * @property {{ start: number, stop: number }} timeouts
 * @property {('continue'|'abort-on-first-fail')} failPolicy
 */

/** @type {RecorderSettings} */
let settings = {
	mode: 'multi',
	selected: ['obs','descript'],
	configs: {
		obs: { url: 'ws://127.0.0.1:4455', password: '' },
		companion: { url: 'http://127.0.0.1:8000', buttonId: '1.1' },
		bridge: { startUrl: 'http://127.0.0.1:5723/record/start', stopUrl: '' },
		descript: { startHotkey: 'Ctrl+R', via: 'bridge' },
		capcut: { startHotkey: 'Ctrl+R', via: 'companion' },
		winmedia: { startHotkey: 'Ctrl+R', via: 'bridge' }
	},
	timeouts: { start: 3000, stop: 3000 },
	failPolicy: 'continue'
};

// Load saved settings if available
try {
	const raw = localStorage.getItem(LS_KEY);
	if (raw) {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') settings = { ...settings, ...parsed };
	} else {
		// First run: persist the defaults exactly once so future merges have a stored baseline
		try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch {}
	}
} catch {}

function persistSettings(){ try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch {} }

/**
 * Update settings; shallow-merge known keys.
 * @param {Partial<RecorderSettings>} next
 */
export function setSettings(next){
	if (!next || typeof next !== 'object') return;
	const prev = settings;
	settings = {
		...prev,
		...('mode' in next ? { mode: next.mode } : {}),
		...('selected' in next ? { selected: Array.isArray(next.selected) ? next.selected.slice() : prev.selected } : {}),
		...('configs' in next ? { configs: { ...prev.configs, ...(next.configs||{}) } } : {}),
		...('timeouts' in next ? { timeouts: { ...prev.timeouts, ...(next.timeouts||{}) } } : {}),
		...('failPolicy' in next ? { failPolicy: next.failPolicy } : {}),
	};
	persistSettings();
	applyConfigs();
}

export function getSettings(){ return JSON.parse(JSON.stringify(settings)); }

export function setSelected(ids){ setSettings({ selected: Array.isArray(ids) ? ids : [] }); }
export function setMode(mode){ setSettings({ mode }); }
export function setTimeouts(t){ setSettings({ timeouts: t }); }
export function setFailPolicy(p){ setSettings({ failPolicy: p }); }

/** Apply per-adapter configuration objects via adapter.configure(cfg) when present. */
export function applyConfigs(){
	for (const [id, a] of registry.entries()) {
		try {
			const cfg = settings.configs?.[id];
			if (cfg && typeof a.configure === 'function') a.configure(cfg);
		} catch {}
	}
}

function callWithTimeout(promiseOrFn, ms){
	const p = (typeof promiseOrFn === 'function') ? promiseOrFn() : promiseOrFn;
	return Promise.race([
		Promise.resolve().then(()=>p),
		new Promise((_, rej)=> setTimeout(()=> rej(new Error('timeout')), Math.max(0, ms||0)))
	]);
}

let _busy = false;
async function guarded(fn){ if (_busy) return { skipped:true }; _busy = true; try { return await fn(); } finally { _busy = false; } }

function selectedIds(){
	const ids = Array.isArray(settings.selected) ? settings.selected.slice() : [];
	if (settings.mode === 'single' && ids.length > 1) ids.length = 1;
	return ids.filter(id => registry.has(id));
}

/** Start selected recorders based on settings (respects mode, timeouts, failPolicy). */
export async function startSelected(){
	return guarded(async () => {
		applyConfigs();
		const ids = selectedIds();
		const started = [];
		const actions = ids.map(id => ({ id, a: registry.get(id) }));
		const doStart = async ({ id, a }) => {
			if (!a) return { id, ok:false, error:'missing' };
			try {
				const avail = await callWithTimeout(() => a.isAvailable(), settings.timeouts.start);
				if (!avail) return { id, ok:false, error:'unavailable' };
			} catch (e) { return { id, ok:false, error: String(e?.message||e) } }
			try {
				await callWithTimeout(() => a.start(), settings.timeouts.start);
				started.push(id);
				return { id, ok:true };
			} catch (e) {
				return { id, ok:false, error: String(e?.message||e) };
			}
		};

		const results = [];
		if (settings.failPolicy === 'abort-on-first-fail') {
			// Serial, abort early
			for (const act of actions) {
				const r = await doStart(act);
				results.push(r);
				if (!r.ok) break;
			}
		} else {
			// Parallel, continue on failure
			const rs = await Promise.all(actions.map(doStart));
			results.push(...rs);
		}
		return { results, started };
	});
}

/** Stop selected recorders (parallel, timeout per adapter). */
export async function stopSelected(){
	return guarded(async () => {
		const ids = selectedIds();
		const actions = ids.map(id => ({ id, a: registry.get(id) })).filter(x => !!x.a);
		const rs = await Promise.all(actions.map(async ({ id, a }) => {
			try {
				const avail = await callWithTimeout(() => a.isAvailable(), settings.timeouts.stop);
				if (!avail) return { id, ok:false, error:'unavailable' };
			} catch (e) { return { id, ok:false, error: String(e?.message||e) } }
			try {
				await callWithTimeout(() => a.stop(), settings.timeouts.stop);
				return { id, ok:true };
			} catch (e) {
				return { id, ok:false, error: String(e?.message||e) };
			}
		}));
		return { results: rs };
	});
}

/**
 * Register or replace a recorder adapter by id.
 * @param {RecorderAdapter} adapter
 */
export function register(adapter){ registry.set(adapter.id, adapter); }

/**
 * Get a recorder adapter by id.
 * @param {string} id
 * @returns {RecorderAdapter | undefined}
 */
export function get(id){ return registry.get(id); }

/**
 * List all registered adapters in insertion order.
 * @returns {RecorderAdapter[]}
 */
export function all(){ return [...registry.values()]; }

// --- Built-in adapters (OBS, Bridge) registration ---
let _builtInsInit = false;
export async function initBuiltIns(){
	if (_builtInsInit) return;
	_builtInsInit = true;
	try {
		// Attempt to load and register built-in adapters. Each is optional.
		const adapters = [];
		try {
			const m = await import('./adapters/bridge.js');
			const a = m?.createBridgeAdapter?.(); if (a) adapters.push(a);
		} catch {}
		try {
			const m = await import('./adapters/obs.js');
			const a = m?.createOBSAdapter?.(); if (a) adapters.push(a);
		} catch {}
		for (const a of adapters){ try { register(a); } catch {} }
		applyConfigs();
	} catch {}
}

// Fire-and-forget initialization on module load (safe if ignored)
try { initBuiltIns(); } catch {}

// Simple aliases for consumers that prefer start/stop terminology
export async function start(){ return startSelected(); }
export async function stop(){ return stopSelected(); }
