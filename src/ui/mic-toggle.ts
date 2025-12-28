export function wireMicToggle() {
  try {
    const btn = document.getElementById('micToggleBtn') as HTMLButtonElement | null;
    if (!btn) return;

    let active = false;

    const syncUI = () => {
      try {
        if (active) {
          btn.textContent = 'Release Mic';
          btn.classList.remove('mic-idle');
          btn.classList.add('mic-active');
        } else {
          btn.textContent = 'Request Mic';
          btn.classList.remove('mic-active');
          btn.classList.add('mic-idle');
        }
      } catch {}
    };

    // Sync from global mic state events if available
    try {
      window.addEventListener('tp:mic:state', (e: any) => {
        try { active = e?.detail?.state === 'capturing' || !!e?.detail?.capturing; } catch {}
        syncUI();
      });
    } catch {}

    // One-time initial UI
    syncUI();

    btn.addEventListener('click', async () => {
      try {
        const mic = (window as any).__tpMic || (window as any).ASR || (window as any).__tpAsrImpl;
        if (!active) {
          let ok = false;
          try { ok = !!(await mic?.requestMic?.()); } catch {}
          if (!ok) {
            try {
              const s = await navigator.mediaDevices?.getUserMedia?.({ audio: true });
              ok = !!s; // best-effort fallback
            } catch {}
          }
          if (ok) active = true;
        } else {
          try { await mic?.releaseMic?.(); } catch {}
          // Best-effort fallback has no global handle; rely on event or local state
          active = false;
        }
        syncUI();
      } catch (e) {
        try { console.warn('[micToggle] error', e); } catch {}
      }
    });
  } catch {}
}
