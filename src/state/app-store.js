(function(){
  // Minimal app store for centralizing Settings and small app state.
  // Exposes window.__tpStore with get/set/subscribe and automatic persistence for a few keys.
  const DEVICE_KEY = 'tp_mic_device_v1';
  const OBS_ENABLED_KEY = 'tp_obs_enabled';
  const OBS_HOST_KEY = 'tp_obs_host';
  const OBS_PASSWORD_KEY = 'tp_obs_password';
  const OBS_SCENE_KEY = 'tp_obs_scene';
  const OBS_RECONNECT_KEY = 'tp_obs_reconnect';
  const AUTO_RECORD_KEY = 'tp_auto_record';
  const PREROLL_SEC_KEY = 'tp_preroll_seconds';
  const DEV_HUD_KEY = 'tp_dev_hud';
  const SETTINGS_TAB_KEY = 'tp_settings_tab';
  // Scroll router keys
  const SCROLL_MODE_KEY = 'tp_scroll_mode_v1';
  const TIMED_SPEED_KEY = 'tp_scroll_timed_speed_v1';
  const WPM_TARGET_KEY = 'tp_scroll_wpm_target_v1';
  const WPM_BASEPX_KEY = 'tp_scroll_wpm_basepx_v1';
  const WPM_MINPX_KEY = 'tp_scroll_wpm_minpx_v1';
  const WPM_MAXPX_KEY = 'tp_scroll_wpm_maxpx_v1';
  const WPM_EWMA_KEY = 'tp_scroll_wpm_ewma_v1';
  const HYB_ATTACK_KEY = 'tp_scroll_hybrid_attack_v1';
  const HYB_RELEASE_KEY = 'tp_scroll_hybrid_release_v1';
  const HYB_IDLE_KEY = 'tp_scroll_hybrid_idle_v1';
  const STEP_PX_KEY = 'tp_scroll_step_px_v1';
  const REH_PUNCT_KEY = 'tp_scroll_reh_punct_v1';
  const REH_RESUME_KEY = 'tp_scroll_reh_resume_v1';

  const persistMap = {
    settingsTab: SETTINGS_TAB_KEY,
    micDevice: DEVICE_KEY,
    obsEnabled: OBS_ENABLED_KEY,
    obsScene: OBS_SCENE_KEY,
    obsReconnect: OBS_RECONNECT_KEY,
    obsHost: OBS_HOST_KEY,
    obsPassword: OBS_PASSWORD_KEY,
    autoRecord: AUTO_RECORD_KEY,
    prerollSeconds: PREROLL_SEC_KEY,
    devHud: DEV_HUD_KEY,
    // Scroll router persistence
    scrollMode: SCROLL_MODE_KEY,
    timedSpeed: TIMED_SPEED_KEY,
    wpmTarget: WPM_TARGET_KEY,
    wpmBasePx: WPM_BASEPX_KEY,
    wpmMinPx: WPM_MINPX_KEY,
    wpmMaxPx: WPM_MAXPX_KEY,
    wpmEwmaSec: WPM_EWMA_KEY,
    hybridAttackMs: HYB_ATTACK_KEY,
    hybridReleaseMs: HYB_RELEASE_KEY,
    hybridIdleMs: HYB_IDLE_KEY,
    stepPx: STEP_PX_KEY,
    rehearsalPunct: REH_PUNCT_KEY,
    rehearsalResumeMs: REH_RESUME_KEY,
  };

  const state = {
    // UI / Settings
    settingsTab: (function(){ try { return localStorage.getItem(SETTINGS_TAB_KEY) || 'general'; } catch { return 'general'; } })(),
    micDevice: (function(){ try { return localStorage.getItem(DEVICE_KEY) || ''; } catch { return ''; } })(),
    obsEnabled: (function(){ try { return localStorage.getItem(OBS_ENABLED_KEY) === '1'; } catch { return false; } })(),
  obsScene: (function(){ try { return localStorage.getItem(OBS_SCENE_KEY) || ''; } catch { return ''; } })(),
  obsReconnect: (function(){ try { return localStorage.getItem(OBS_RECONNECT_KEY) === '1'; } catch { return false; } })(),
  autoRecord: (function(){ try { return localStorage.getItem(AUTO_RECORD_KEY) === '1'; } catch { return false; } })(),
  prerollSeconds: (function(){ try { const n = parseInt(localStorage.getItem(PREROLL_SEC_KEY)||'3',10); return isFinite(n) ? Math.max(0, Math.min(10, n)) : 3; } catch { return 3; } })(),
  devHud: (function(){ try { return localStorage.getItem(DEV_HUD_KEY) === '1'; } catch { return false; } })(),
  obsHost: (function(){ try { return localStorage.getItem(OBS_HOST_KEY) || ''; } catch { return ''; } })(),
  obsPassword: (function(){ try { return localStorage.getItem(OBS_PASSWORD_KEY) || ''; } catch { return ''; } })(),

    // Scroll router (persisted)
  scrollMode: (function(){ try { return (localStorage.getItem(SCROLL_MODE_KEY) || 'timed'); } catch { return 'timed'; } })(),
  timedSpeed: (function(){ try { const v = parseFloat(localStorage.getItem(TIMED_SPEED_KEY)||''); return (isFinite(v) && v>0) ? v : 25; } catch { return 25; } })(),
  wpmTarget: (function(){ try { const v = parseInt(localStorage.getItem(WPM_TARGET_KEY)||''); return (isFinite(v) && v>=60) ? v : 180; } catch { return 180; } })(),
  wpmBasePx: (function(){ try { const v = parseFloat(localStorage.getItem(WPM_BASEPX_KEY)||''); return (isFinite(v) && v>0) ? v : 25; } catch { return 25; } })(),
  wpmMinPx: (function(){ try { const v = parseFloat(localStorage.getItem(WPM_MINPX_KEY)||''); return (isFinite(v) && v>0) ? v : 6; } catch { return 6; } })(),
  wpmMaxPx: (function(){ try { const v = parseFloat(localStorage.getItem(WPM_MAXPX_KEY)||''); return (isFinite(v) && v>0) ? v : 200; } catch { return 200; } })(),
  wpmEwmaSec: (function(){ try { const v = parseFloat(localStorage.getItem(WPM_EWMA_KEY)||''); return (isFinite(v) && v>0) ? v : 1.0; } catch { return 1.0; } })(),
  hybridAttackMs: (function(){ try { const v = parseInt(localStorage.getItem(HYB_ATTACK_KEY)||''); return (isFinite(v) && v>=0) ? v : 120; } catch { return 120; } })(),
  hybridReleaseMs: (function(){ try { const v = parseInt(localStorage.getItem(HYB_RELEASE_KEY)||''); return (isFinite(v) && v>=0) ? v : 250; } catch { return 250; } })(),
  hybridIdleMs: (function(){ try { const v = parseInt(localStorage.getItem(HYB_IDLE_KEY)||''); return (isFinite(v) && v>=0) ? v : 1500; } catch { return 1500; } })(),
  stepPx: (function(){ try { const v = parseInt(localStorage.getItem(STEP_PX_KEY)||''); return (isFinite(v) && v>0) ? v : 120; } catch { return 120; } })(),
  rehearsalPunct: (function(){ try { const v = localStorage.getItem(REH_PUNCT_KEY); return (v!=null && v!=='') ? v : '.,;:?!'; } catch { return '.,;:?!'; } })(),
  rehearsalResumeMs: (function(){ try { const v = parseInt(localStorage.getItem(REH_RESUME_KEY)||''); return (isFinite(v) && v>=100) ? v : 1000; } catch { return 1000; } })(),

    // transient session state (not persisted)
  obsUrl: '',
  obsPort: '',
  obsSecure: false,
  };

  const subs = Object.create(null);

  function notify(key, value) {
    try {
      const fns = subs[key] || [];
      for (let i = 0; i < fns.length; i++) {
        try { fns[i](value); } catch {}
      }
    } catch {}
  }

  function get(key) {
    try { return state[key]; } catch { return undefined; }
  }

  function set(key, value) {
    try {
      const prev = state[key];
      // simple equality guard
      if (prev === value) return value;
      state[key] = value;
      // persist if mapped
      try {
        const storageKey = persistMap[key];
        if (storageKey) {
          if (typeof value === 'boolean') localStorage.setItem(storageKey, value ? '1' : '0');
          else if (value === null || typeof value === 'undefined') localStorage.removeItem(storageKey);
          else localStorage.setItem(storageKey, String(value));
        }
      } catch {}
      notify(key, value);
      return value;
    } catch { return undefined; }
  }

  function subscribe(key, fn) {
    if (typeof fn !== 'function') return function(){};
    subs[key] = subs[key] || [];
    subs[key].push(fn);
    // immediately call with current value
    try { fn(state[key]); } catch {}
    return function unsubscribe(){
      try { subs[key] = (subs[key] || []).filter(x => x !== fn); } catch {}
    };
  }

  // Small convenience: subscribe to many keys at once
  function subscribeAll(map) {
    const unsubs = [];
    try {
      for (const k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k)) {
          unsubs.push(subscribe(k, map[k]));
        }
      }
    } catch {}
    return function() { unsubs.forEach(u => u && u()); };
  }

  // Expose global store
  try {
    window.__tpStore = window.__tpStore || { get, set, subscribe, subscribeAll };
  } catch {}

})();
