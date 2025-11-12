// Compatibility helpers (ID aliases and tolerant $id()) must be installed very early
import { bootstrap } from './boot/boot';
import './boot/compat-ids';
// Guarded preventDefault utility used by wheel listeners
function safePreventDefault(e){ try{ const fn = e && e['prevent' + 'Default']; if(typeof fn==='function' && !e.defaultPrevented){ fn.call(e); } } catch{} }
// Run bootstrap (best-effort, non-blocking). The legacy monolith still calls
// window._initCore/_initCoreRunner paths; this ensures the modular runtime
// sets up the same early hooks when the module entry is used.
bootstrap().catch(() => { });
// Install vendor shims (mammoth) so legacy code can use window.ensureMammoth
import './vendor/mammoth';
// Settings → ASR wizard wiring (safe to import; guards on element presence)
import { createScrollBrain } from './scroll/scroll-brain';
import './ui/settings/asrWizard';
// Create and expose the scroll brain globally
const scrollBrain = createScrollBrain();
window.__tpScrollBrain = scrollBrain;
function applyUiScrollMode(mode) {
    // Store the UI mode somewhere global so existing JS can still read it
    window.__tpUiScrollMode = mode;
    const brain = window.__tpScrollBrain;
    const asr = window.__tpAsrMode;
    const setClampMode = window.__tpSetClampMode;
    // Defaults
    let brainMode = 'manual';
    let clampMode = 'free';
    let asrEnabled = false;
    switch (mode) {
        case 'off':
            brainMode = 'manual';
            clampMode = 'free';
            asrEnabled = false;
            break;
        case 'auto':
            brainMode = 'auto'; // pure time-based scroll
            clampMode = 'free'; // ASR anti-jitter not needed
            asrEnabled = false;
            break;
        case 'asr':
            brainMode = 'hybrid'; // auto + ASR corrections
            clampMode = 'follow'; // monotonic clamp: no back-jogs
            asrEnabled = true;
            break;
        case 'step':
            brainMode = 'step'; // discrete step moves
            clampMode = 'free'; // clamp doesn't matter here
            asrEnabled = false;
            break;
        case 'rehearsal':
            brainMode = 'rehearsal'; // no programmatic scroll
            clampMode = 'free';
            asrEnabled = false;
            break;
    }
    // Apply decisions
    if (brain)
        brain.setMode(brainMode);
    if (setClampMode)
        setClampMode(clampMode);
    if (asr && typeof asr.setEnabled === 'function')
        asr.setEnabled(asrEnabled);
    // HUD visibility: show all three layers for debugging
    try {
        const summary = `UI: ${mode} | Brain: ${brainMode} | Clamp: ${clampMode}`;
        window.HUD?.log?.('scroll:mode', {
            summary,
            ui: mode,
            brain: brainMode,
            clamp: clampMode,
            asrEnabled
        });
        // Also log to console for quick visibility
        console.debug(`[Scroll Mode] ${summary} | ASR: ${asrEnabled ? 'on' : 'off'}`);
    }
    catch {
        // ignore
    }
}
// Expose this function as the global router for existing JS
window.setScrollMode = applyUiScrollMode;
window.getScrollMode = () => window.__tpUiScrollMode ?? 'off';
// === End UI Scroll Mode Router ===
// The compiled bundle (./dist/index.js) will import other modules and
// eventually assign window.__tpRealCore or resolve the _initCore waiter.
// Optional: wire Auto-scroll + install scroll router in TS path as well
import './asr/v2/prompts';
import { startVadAdapter } from './asr/vadAdapter';
import * as Auto from './features/autoscroll.js';
import { installDisplaySync } from './features/display-sync';
import { installRehearsal, resolveInitialRehearsal } from './features/rehearsal';
import { installScrollRouter } from './features/scroll-router';
import { installStepScroll } from './features/step-scroll';
import { applyTypographyTo } from './features/typography';
import { initAsrFeature } from './index-hooks/asr';
import { getTypography, onTypography, setTypography } from './settings/typographyStore';
import { getUiPrefs } from './settings/uiPrefs';
import './ui/micMenu';
import { initObsUI } from './wiring/obs-wiring';
// Dev HUD for notes (only activates under ?dev=1 or __TP_DEV)
import './hud/loader';
// Defer loading speech notes HUD until legacy/debug HUD announces readiness so the legacy bus exists first.
try {
    function injectSpeechNotesHud() {
        try {
            if (document.getElementById('tp-speech-notes-hud'))
                return; // already present
            const s = document.createElement('script');
            s.src = './hud/speech-notes-hud.js';
            s.async = true; // non-blocking
            document.head.appendChild(s);
        }
        catch { }
    }
    window.addEventListener('hud:ready', () => { injectSpeechNotesHud(); }, { once: true });
    if (window.__tpHudWireActive) {
        injectSpeechNotesHud();
    }
}
catch { }
try {
    document.addEventListener('DOMContentLoaded', () => {
        // Initialize ASR feature (settings card, hotkeys, topbar UI)
        try {
            initAsrFeature();
        }
        catch { }
        // OBS Settings wiring (inline bridge-backed "Test connect")
        try {
            initObsUI();
        }
        catch { }
        // Ensure autoscroll engine is initialized
        try {
            Auto.initAutoScroll?.();
        }
        catch { }
        // Wire Auto buttons via resilient delegation (nodes may be re-rendered)
        try {
            const onClick = (e) => {
                const t = e && e.target;
                // The Scroll Router manages #autoToggle intent; avoid double-toggling here
                try {
                    if (t?.closest?.('#autoInc'))
                        return Auto.inc?.();
                }
                catch { }
                try {
                    if (t?.closest?.('#autoDec'))
                        return Auto.dec?.();
                }
                catch { }
            };
            document.addEventListener('click', onClick, { capture: true });
        }
        catch { }
        // Auto-record when the session actually starts (one-shot per page load)
        try {
            (function autoRecordOnStart() {
                const FLAG = 'tp_auto_record_on_start_v1';
                let fired = false;
                function wants() { try {
                    return localStorage.getItem(FLAG) === '1';
                }
                catch {
                    return false;
                } }
                async function maybe() {
                    if (fired || !wants())
                        return;
                    try {
                        if (window.__tpRecording?.getAdapter?.() === 'obs') {
                            // Respect OBS "Off" gating
                            if (!window.__tpObs?.armed?.())
                                return;
                        }
                        fired = true;
                        await (window.__tpRecording?.start?.() || Promise.resolve());
                    }
                    catch (e) {
                        // allow retry on next event if it fails
                        fired = false;
                        try {
                            console.warn('auto-record failed', e);
                        }
                        catch { }
                    }
                }
                ['tp:session:start', 'speech:start', 'autoscroll:start'].forEach((ev) => {
                    document.addEventListener(ev, () => { try {
                        maybe();
                    }
                    catch { } }, { capture: true });
                });
            })();
        }
        catch { }
        // Install the new Scroll Router (Step/Hybrid; WPM/ASR/Rehearsal stubs)
        try {
            installScrollRouter({ auto: {
                    toggle: Auto.toggle,
                    inc: Auto.inc,
                    dec: Auto.dec,
                    setEnabled: Auto.setEnabled,
                    setSpeed: Auto.setSpeed,
                    getState: Auto.getState,
                } });
        }
        catch { }
        // Install TS-first Step scroller (non-invasive). Expose API and allow optional override.
        try {
            const step = installStepScroll({ stepLines: 1, pageLines: 4, enableFKeys: true });
            const rehearsal = installRehearsal();
            // Honor URL/localStorage bootstrap for Rehearsal
            try {
                resolveInitialRehearsal();
            }
            catch { }
            // Optional wiring: allow window.setScrollMode('step') to control Step when router is absent
            if (!window.setScrollMode) {
                window.setScrollMode = (mode) => {
                    try {
                        Auto.setEnabled?.(mode === 'auto');
                    }
                    catch { }
                    try {
                        window.__scrollCtl?.stopAutoCatchup?.();
                    }
                    catch { }
                    if (mode === 'rehearsal') {
                        rehearsal.enable();
                        step.disable();
                    }
                    else {
                        rehearsal.disable();
                        if (mode === 'step')
                            step.enable();
                        else
                            step.disable();
                    }
                };
            }
            // If explicitly requested, override router Step with TS module
            try {
                if (window.__TP_TS_STEP_OVERRIDE) {
                    // Basic observer: when a custom event selects a mode, reflect into TS step
                    document.addEventListener('tp:selectMode', (e) => {
                        const m = e?.detail?.mode;
                        if (m === 'step')
                            step.enable();
                        else
                            step.disable();
                    }, { capture: true });
                }
            }
            catch { }
        }
        catch { }
        // Install coalesced Display Sync (hash + optional HTML text) for external display
        try {
            installDisplaySync({
                getText: () => {
                    try {
                        return (document.getElementById('script')?.innerHTML) || '';
                    }
                    catch {
                        return '';
                    }
                },
                getAnchorRatio: () => {
                    try {
                        const v = document.getElementById('viewer');
                        if (!v)
                            return 0;
                        const max = Math.max(0, v.scrollHeight - v.clientHeight);
                        return max > 0 ? (v.scrollTop / max) : 0;
                    }
                    catch {
                        return 0;
                    }
                },
                getDisplayWindow: () => {
                    try {
                        return window.__tpDisplayWindow || null;
                    }
                    catch {
                        return null;
                    }
                },
                // onApplyRemote is used on display side only; main does not need it here
            });
        }
        catch { }
        // Apply typography to main window and, if present, to display window
        try {
            // Mark TS typography path active so legacy bridge can stand down
            try {
                window.__tpTsTypographyActive = true;
            }
            catch { }
            applyTypographyTo(window, 'main');
            const w = window.__tpDisplayWindow;
            if (w)
                applyTypographyTo(w, 'display');
        }
        catch { }
        // Broadcast typography changes to external display (only when linked)
        try {
            let bc = null;
            try {
                bc = new BroadcastChannel('tp_display');
            }
            catch { }
            onTypography((d, t) => {
                // Only broadcast if explicitly linked
                try {
                    if (!getUiPrefs().linkTypography)
                        return;
                }
                catch { }
                // Push to the other screen (target opposite of the source display)
                const target = (d === 'main' ? 'display' : 'main');
                const snap = { kind: 'tp:typography', source: 'main', display: target, t };
                try {
                    bc?.postMessage(snap);
                }
                catch { }
                try {
                    const w = window.__tpDisplayWindow;
                    w?.postMessage?.(snap, '*');
                }
                catch { }
            });
        }
        catch { }
        // Auto-recompute scroll step after typography changes
        try {
            window.addEventListener('tp:lineMetricsDirty', () => {
                try {
                    const root = document.documentElement;
                    const cs = getComputedStyle(root);
                    const fs = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
                    const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
                    const pxPerLine = fs * lh;
                    const stepPx = Math.round(pxPerLine * 7); // ~7 lines per step
                    try {
                        window.__tpAuto?.setStepPx?.(stepPx);
                    }
                    catch { }
                }
                catch { }
            });
        }
        catch { }
        // Ctrl/Cmd + Mouse Wheel to adjust font size (main by default, Ctrl+Alt for display)
        try {
            // If legacy typography bridge is present, skip TS wheel bindings to avoid duplicate handling
            if (window.__tpTypographyBridgeActive) {
                // still keep TS store/reactivity, but avoid attaching wheel listeners twice
                throw new Error('skip-ts-wheel');
            }
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            window.addEventListener('wheel', (e) => {
                try {
                    if (!(e.ctrlKey || e.metaKey))
                        return; // only when user intends zoom-like behavior
                    safePreventDefault(e);
                    const targetDisplay = e.altKey ? 'display' : 'main';
                    const cur = getTypography(targetDisplay).fontSizePx;
                    const step = 2;
                    const next = clamp(cur + (e.deltaY < 0 ? step : -step), 18, 120);
                    setTypography(targetDisplay, { fontSizePx: next });
                }
                catch { }
            }, { passive: false });
        }
        catch { }
        // Shift + Wheel over the viewer to adjust font size (no Ctrl/Cmd required)
        try {
            if (window.__tpTypographyBridgeActive) {
                throw new Error('skip-ts-wheel');
            }
            const clamp2 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            const viewer = document.getElementById('viewer');
            if (viewer) {
                viewer.addEventListener('wheel', (e) => {
                    try {
                        if (!e.shiftKey || e.ctrlKey || e.metaKey)
                            return; // only Shift, not Ctrl/Cmd
                        safePreventDefault(e);
                        const cur = getTypography('main').fontSizePx;
                        const step = 2;
                        const next = clamp2(cur + (e.deltaY < 0 ? step : -step), 18, 120);
                        setTypography('main', { fontSizePx: next });
                    }
                    catch { }
                }, { passive: false });
            }
        }
        catch { }
        // Dev-only sanity ping: ensure our line selector matches something at boot
        try {
            const isDevHost = () => {
                try {
                    return /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
                }
                catch {
                    return false;
                }
            };
            if (isDevHost()) {
                const LINE_SEL = '#viewer .script :is(p,.line,.tp-line)';
                try {
                    if (!document.querySelector(LINE_SEL))
                        console.warn('[TP] No line nodes matched — check renderer/markup');
                }
                catch { }
            }
        }
        catch { }
        // Start/stop VAD adapter when mic stream is provided
        try {
            let stopVad = null;
            window.addEventListener('tp:mic:stream', (e) => {
                try {
                    stopVad?.();
                }
                catch { }
                try {
                    const s = e?.detail?.stream;
                    if (s)
                        stopVad = startVadAdapter(s, (_speaking, _rms) => { });
                }
                catch { }
            });
            window.addEventListener('beforeunload', () => { try {
                stopVad?.();
            }
            catch { } });
        }
        catch { }
    });
}
catch { }
