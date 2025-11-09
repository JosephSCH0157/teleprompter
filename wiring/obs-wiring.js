// src/wiring/obs-wiring.ts
// Minimal, UI-safe OBS wiring for TS path
// Uses the lightweight inline OBS v5 bridge in recorders.js
// @ts-ignore - recorders.js is JS
import * as rec from '../../recorders.js';
import { obsTestConnect } from '../dev/obs-probe';
// Optional: expose a dev console hook for quick OBS probes
try {
    if (location.search.includes('dev=1')) {
        window.__obsTestConnect = obsTestConnect;
    }
}
catch { }
export function initObsUI() {
    // Respect JS SSOT or existing wire.js ownership: bail out if another owner is active
    try {
        const w = window;
        if (w.__tpObsWireActive || (w.__tpObsSSOT && w.__tpObsSSOT !== 'ts')) {
            try {
                console.warn('[obs-wiring.ts] Skipping TS wiring: SSOT=', w.__tpObsSSOT || 'unknown', 'wireActive=', !!w.__tpObsWireActive);
            }
            catch { }
            return;
        }
        w.__tpObsSSOT = 'ts';
    }
    catch { }
    try {
        window.__tpObsInlineBridgeActive = true;
    }
    catch { }
    const byId = (id) => document.getElementById(id);
    const pillEl = () => (byId('obsStatusText') || byId('obsStatus'));
    const testMsgEl = () => byId('settingsObsTestMsg');
    // Persistent Enable OBS flag (UI-independent), drives connection and reconnection
    const OBS_EN_KEY = 'tp_obs_enabled_v1';
    let obsEnabled = (() => { try {
        return localStorage.getItem(OBS_EN_KEY) === '1';
    }
    catch {
        return false;
    } })();
    const getObsEnabled = () => obsEnabled;
    const setObsEnabled = (on) => {
        obsEnabled = !!on;
        try {
            localStorage.setItem(OBS_EN_KEY, obsEnabled ? '1' : '0');
        }
        catch { }
    };
    const readUrl = () => {
        const urlIn = (byId('settingsObsUrl') || byId('obsUrl'));
        const hostIn = byId('settingsObsHost');
        const u = urlIn?.value?.trim();
        if (u)
            return u;
        const h = hostIn?.value?.trim();
        if (h)
            return `ws://${h}${/:[0-9]+$/.test(h) ? '' : ':4455'}`;
        return 'ws://127.0.0.1:4455';
    };
    const readPass = () => (byId('settingsObsPassword')?.value ?? byId('obsPassword')?.value ?? '');
    // UI checkbox reader is used to reflect state in the UI only; the engine relies on getObsEnabled()
    const readEnabledFromUI = () => !!(byId('settingsEnableObs')?.checked || byId('enableObs')?.checked);
    const writeEnabledToUI = (on) => {
        try {
            const elA = byId('settingsEnableObs');
            const elB = byId('enableObs');
            if (elA)
                elA.checked = !!on;
            if (elB)
                elB.checked = !!on;
        }
        catch { }
    };
    // Initialize recorder bridge with dynamic getters
    try {
        rec.init({
            getUrl: readUrl,
            getPass: readPass,
            // Important: drive connection using the persistent flag, not the transient UI
            isEnabled: getObsEnabled,
            onStatus: (txt, ok) => {
                try {
                    const p = pillEl();
                    if (p)
                        p.textContent = ok ? 'connected' : (txt || 'disconnected');
                }
                catch { }
            },
            onRecordState: (_active) => { },
        });
    }
    catch { }
    // Delegated listeners so it works even if Settings overlay mounts later
    try {
        document.addEventListener('change', (e) => {
            const t = e.target;
            const id = t?.id || '';
            if (id === 'settingsEnableObs' || id === 'enableObs') {
                // Persist and apply immediately
                const on = readEnabledFromUI();
                setObsEnabled(on);
                try {
                    rec.setEnabled(on);
                }
                catch { }
            }
            if (id === 'settingsObsUrl' || id === 'obsUrl' || id === 'settingsObsHost') {
                try {
                    rec.reconfigure(parseWsUrl(readUrl(), readPass()));
                }
                catch { }
            }
            if (id === 'settingsObsPassword' || id === 'obsPassword') {
                try {
                    rec.reconfigure({ password: readPass() });
                }
                catch { }
            }
        }, { capture: true });
    }
    catch { }
    // If the overlay/checkbox renders later, reflect the persisted state into it.
    try {
        const mo = new MutationObserver(() => {
            try {
                const el = byId('settingsEnableObs') || byId('enableObs');
                if (el)
                    writeEnabledToUI(getObsEnabled());
            }
            catch { }
        });
        try {
            mo.observe(document.documentElement, { childList: true, subtree: true });
        }
        catch { }
        // Also attempt an immediate sync in case the checkbox already exists
        writeEnabledToUI(getObsEnabled());
    }
    catch { }
    // Delegated Test/Sync/Poke buttons
    try {
        const onObsClick = async (e) => {
            const t = e.target;
            const id = t?.id || '';
            let pill = pillEl();
            const testMsg = testMsgEl();
            const clearMsg = () => { try {
                if (testMsg) {
                    testMsg.textContent = '';
                    testMsg.classList.remove('obs-test-ok', 'obs-test-error');
                }
            }
            catch { } };
            const okMsg = (s) => { try {
                if (testMsg) {
                    testMsg.textContent = s;
                    testMsg.classList.add('obs-test-ok');
                }
            }
            catch { } };
            const errMsg = (s) => { try {
                if (testMsg) {
                    testMsg.textContent = s;
                    testMsg.classList.add('obs-test-error');
                }
            }
            catch { } };
            const testBtn = (t && t.closest('#settingsObsTest,#obsTest,[data-action="obs-test"]')) || null;
            if (testBtn) {
                try {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
                catch { }
                // Ensure a pill exists near the button if missing
                if (!pill && testBtn && testBtn.parentElement) {
                    try {
                        const span = document.createElement('span');
                        span.id = 'obsStatusText';
                        span.style.marginLeft = '8px';
                        testBtn.after(span);
                        pill = span;
                    }
                    catch { }
                }
                clearMsg();
                if (pill)
                    pill.textContent = 'testing…';
                try {
                    const url = readUrl();
                    const pass = readPass();
                    // Run a real v5 handshake probe to validate connectivity
                    const { version } = await obsTestConnect(url, pass);
                    okMsg('OBS test: OK' + (version ? ` (v${version})` : ''));
                    if (pill)
                        pill.textContent = version ? `connected (${version})` : 'connected';
                }
                catch (err) {
                    errMsg('OBS test failed: ' + (err?.message || String(err)));
                    if (pill)
                        pill.textContent = 'failed';
                }
            }
            if (id === 'settingsObsSyncTest') {
                clearMsg();
                if (pill)
                    pill.textContent = 'testing…';
                try {
                    await rec.reconfigure(parseWsUrl(readUrl(), readPass()));
                    const ok = await rec.test();
                    if (!ok)
                        throw new Error('test failed');
                    okMsg('OBS sync+test: OK');
                    if (pill)
                        pill.textContent = 'ok';
                }
                catch (err) {
                    errMsg('OBS sync+test failed: ' + (err?.message || String(err)));
                    if (pill)
                        pill.textContent = 'failed';
                }
            }
            if (id === 'settingsObsPoke') {
                clearMsg();
                try {
                    const ok = await rec.test();
                    if (!ok)
                        throw new Error('poke failed');
                    okMsg('OBS poke: OK');
                }
                catch (err) {
                    errMsg('OBS poke failed: ' + (err?.message || String(err)));
                }
            }
        };
        // Capture-phase interception (primary)
        document.addEventListener('click', onObsClick, { capture: true });
        // Bubble-phase interception (belt-and-suspenders)
        document.addEventListener('click', onObsClick, { capture: false });
    }
    catch { }
    // Reflect recorder status in the pill whenever it changes
    try {
        window.addEventListener('tp-recorder-status', (e) => {
            try {
                const p = pillEl();
                const d = e?.detail || {};
                if (p)
                    p.textContent = d.ok ? 'connected' : (d.state || 'disconnected');
            }
            catch { }
        });
    }
    catch { }
    function parseWsUrl(u, pass) {
        try {
            const url = new URL(u);
            return { secure: url.protocol === 'wss:', host: url.hostname, port: Number(url.port || 4455), password: pass };
        }
        catch {
            return { password: pass };
        }
    }
    // Bridge to central store if present, so toggles from Settings drive the bridge too
    try {
        const S = window.__tpStore;
        if (S && typeof S.subscribe === 'function') {
            try {
                S.subscribe('obsEnabled', (v) => { try {
                    setObsEnabled(!!v);
                    rec.setEnabled(!!v);
                }
                catch { } });
            }
            catch { }
            try {
                S.subscribe('obsHost', (h) => { try {
                    rec.reconfigure(parseWsUrl(h ? `ws://${String(h)}` : readUrl(), readPass()));
                }
                catch { } });
            }
            catch { }
            try {
                S.subscribe('obsPassword', (p) => { try {
                    rec.reconfigure({ password: String(p || '') });
                }
                catch { } });
            }
            catch { }
        }
    }
    catch { }
    // On load: apply persisted state (connect if enabled), and ensure clean disconnect on page close
    try {
        if (getObsEnabled()) {
            try {
                rec.setEnabled(true);
            }
            catch { }
        }
    }
    catch { }
    try {
        window.addEventListener('beforeunload', () => { try {
            rec.setEnabled(false);
        }
        catch { } });
    }
    catch { }
}
