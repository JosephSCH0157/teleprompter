(function(){
  function runSelfChecks(){
    const checks = [];
    try{
      const cs = document.currentScript;
      let count = 1, label = 'n/a';
      if (cs && cs.src){
        const src = cs.src;
        count = Array.from(document.scripts).filter((s)=>s.src && s.src === src).length;
        label = src.split('/').pop();
      }
      checks.push({ name: 'Single script include', pass: count === 1, info: `${label} found ${count}` });
    }catch{ checks.push({ name: 'Single script include', pass: true, info: '(skipped)' }); }

    try{
      const help = document.getElementById('shortcutsOverlay');
      const has = !!(help && help.querySelector('#normalizeBtn') && help.querySelector('#validateBtn'));
      checks.push({ name: 'Help injected', pass: has, info: has ? 'OK' : 'missing pieces' });
    }catch{ checks.push({ name: 'Help injected', pass: false, info: 'error' }); }

    try{
      const a = typeof window.SIM_THRESHOLD === 'number' && window.SIM_THRESHOLD > 0 && window.SIM_THRESHOLD < 1;
      const b = typeof window.MATCH_WINDOW_AHEAD === 'number' && window.MATCH_WINDOW_AHEAD >= 60 && window.MATCH_WINDOW_AHEAD <= 1000;
      const c = typeof window.MATCH_WINDOW_BACK === 'number' && window.MATCH_WINDOW_BACK >= 0 && window.MATCH_WINDOW_BACK <= 500;
      const d = typeof window.STRICT_FORWARD_SIM === 'number' && window.STRICT_FORWARD_SIM > 0 && window.STRICT_FORWARD_SIM < 1;
      const e = typeof window.MAX_JUMP_AHEAD_WORDS === 'number' && window.MAX_JUMP_AHEAD_WORDS >= 1 && window.MAX_JUMP_AHEAD_WORDS <= 200;
      checks.push({ name: 'Matcher constants', pass: Boolean(a && b && c && d && e), info: `SIM=${window.SIM_THRESHOLD ?? '?'} WIN_F=${window.MATCH_WINDOW_AHEAD ?? '?'} WIN_B=${window.MATCH_WINDOW_BACK ?? '?'} STRICT=${window.STRICT_FORWARD_SIM ?? '?'} JUMP=${window.MAX_JUMP_AHEAD_WORDS ?? '?'}` });
    }catch{ checks.push({ name: 'Matcher constants', pass: false, info: 'not defined' }); }

    try{
      const ok = typeof window.openDisplay === 'function' && typeof window.sendToDisplay === 'function';
      checks.push({ name: 'Display handshake', pass: ok, info: ok ? 'wiring present' : 'functions missing' });
    }catch{ checks.push({ name: 'Display handshake', pass: false, info: 'error' }); }

    try{
      const btn = document.getElementById('normalizeTopBtn');
      const wired = Boolean(btn && (btn.onclick || btn.dataset.wired));
      checks.push({ name: 'Top Normalize button wired', pass: wired, info: wired ? 'wired' : 'not wired' });
    }catch{ checks.push({ name: 'Top Normalize button wired', pass: false, info: 'error' }); }

    return checks;
  }
  try{ window.runSelfChecks = runSelfChecks; }catch{}
})();
