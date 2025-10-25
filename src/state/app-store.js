(function(){
  // Minimal app store for centralizing Settings and small app state.
  // Exposes window.__tpStore with get/set/subscribe and automatic persistence for a few keys.
  const DEVICE_KEY = 'tp_mic_device_v1';
  const OBS_ENABLED_KEY = 'tp_obs_enabled';
  const AUTO_RECORD_KEY = 'tp_auto_record';
  const SETTINGS_TAB_KEY = 'tp_settings_tab';

  const persistMap = {
    settingsTab: SETTINGS_TAB_KEY,
    micDevice: DEVICE_KEY,
    obsEnabled: OBS_ENABLED_KEY,
    autoRecord: AUTO_RECORD_KEY,
  };

  const state = {
    // UI / Settings
    settingsTab: (function(){ try { return localStorage.getItem(SETTINGS_TAB_KEY) || 'general'; } catch { return 'general'; } })(),
    micDevice: (function(){ try { return localStorage.getItem(DEVICE_KEY) || ''; } catch { return ''; } })(),
    obsEnabled: (function(){ try { return localStorage.getItem(OBS_ENABLED_KEY) === '1'; } catch { return false; } })(),
    autoRecord: (function(){ try { return localStorage.getItem(AUTO_RECORD_KEY) === '1'; } catch { return false; } })(),

    // transient session state (not persisted)
    obsUrl: '',
    obsPort: '',
    obsSecure: false,
    obsScene: '',
    obsPassword: '',
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
