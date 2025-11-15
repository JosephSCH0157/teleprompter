// boot-loader.js — singleton guard + clean dev/prod import
(function (g) {
  if (g.__TP_LOADER_RAN__) { try { (g.__TP_BOOT_TRACE = g.__TP_BOOT_TRACE || []).push({ ts: performance.now(), tag: 'boot-loader', msg: 'dup-loader' }); } catch {} throw 'dup-loader'; }
  g.__TP_LOADER_RAN__ = true;

  const push = (e) => (g.__TP_BOOT_TRACE = g.__TP_BOOT_TRACE || []).push({ ts: performance.now(), ...e });

  const isLocalHost = (() => { try { return ['localhost','127.0.0.1'].includes(location.hostname); } catch { return false; } })();
  const isDev = /\bdev=1\b/.test(location.search) || /\bdev\b/.test(location.hash) || isLocalHost ||
                (function(){ try { return localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; } })();
  const forceLegacy = (() => {
    try {
      const qs = new URLSearchParams(location.search || '');
      return qs.has('legacy') || localStorage.getItem('tp_legacy') === '1';
    } catch { return false; }
  })();
  g.__TP_BOOT_INFO = Object.assign(g.__TP_BOOT_INFO || {}, { isDev, path: isDev ? 'dev' : 'prod' });

  push({ tag: 'boot-loader', msg: 'start', isDev });

  (async () => {
    try {
      const v = encodeURIComponent(g.__TP_ADDV || 'dev');
      if (isDev) {
        // Install verbose error hooks early in dev to capture script URL/line on failures
        try {
          if (!g.__TP_DEV_ERROR_HOOKS) {
            g.__TP_DEV_ERROR_HOOKS = true;
            g.addEventListener('error', function (ev) {
              try {
                var fn = (ev && ev.filename) || (ev && ev.target && ev.target.src) || '';
                var ln = (ev && ev.lineno) || 0;
                var cn = (ev && ev.colno) || 0;
                var msg = (ev && ev.message) || '';
                try {
                  console.error('[boot-loader] window.error filename=' + fn + ' lineno=' + ln + ' colno=' + cn + ' message=' + msg);
                } catch {}
              } catch {}
            }, { capture: true });
            g.addEventListener('unhandledrejection', function (ev) {
              try {
                var r = ev && ev.reason;
                console.error('[boot-loader] unhandledrejection', r && (r.stack || r.message || String(r)));
              } catch {}
            }, { capture: true });
          }
        } catch {}
        // We are in /src/boot/boot-loader.js → dev entry is ../index.js
        push({ tag: 'boot-loader', msg: 'import ../index.js → start' });
        // Helpful probe: if /src/index.js is missing or blocked, log a targeted hint
        try {
          const base = new URL('../index.js', import.meta.url).href + `?v=${v}`;
          const head = await fetch(base, { method: 'HEAD', cache: 'no-store' });
          if (!head || !head.ok) {
            try { console.error('[boot-loader] probe failed for', base, 'status=', head && head.status); } catch {}
          }
        } catch {}
        await import(`../index.js?v=${v}`);
        push({ tag: 'boot-loader', msg: 'import ../index.js → done', ok: true });
      } else {
        // Prod bundle lives at /dist/index.js → from /src/boot use ../../dist/index.js
        push({ tag: 'boot-loader', msg: 'import ../../dist/index.js → start' });
        await import(`../../dist/index.js?v=${v}`);
        push({ tag: 'boot-loader', msg: 'import ../../dist/index.js → done', ok: true });
      }
      g.__TP_BOOT_INFO.imported = true;
    } catch (err) {
      g.__TP_BOOT_INFO.imported = false;
      push({ tag: 'boot-loader', msg: 'import failed', ok: false, err: String(err), isDev, forceLegacy });
      // Dev: attempt a granular import probe of src/index.js dependencies to find the failing module
      try {
        if (isDev && typeof fetch === 'function') {
          const baseUrl = new URL('../index.js', import.meta.url);
          const txt = await (await fetch(baseUrl.href, { cache: 'no-store' })).text();
          const specs = [];
          try {
            const re = /(^|\n)\s*import\s+(?:[^'"\n]+\s+from\s+)?["']([^"']+)["']/g;
            let m;
            while ((m = re.exec(txt))) {
              const spec = m[2];
              // Only probe bare/relative imports that look like module files (avoid side-effect CSS etc.)
              if (spec && /^(\.|\/)/.test(spec)) specs.push(spec);
            }
          } catch {}
          const uniq = Array.from(new Set(specs));
          for (const s of uniq) {
            try {
              const u = new URL(s, baseUrl).href;
              // eslint-disable-next-line no-await-in-loop
              await import(/* @vite-ignore */ u);
              try { console.info('[boot-loader] probe ok:', u); } catch {}
            } catch (eProbe) {
              try {
                console.error('[boot-loader] probe failed:', s, eProbe && (eProbe.stack || eProbe.message || String(eProbe)));
              } catch {}
            }
          }
        }
      } catch {}
      // Dev safety: avoid silent fallback in regular dev sessions.
      // However, in CI/headless or when uiMock/mockFolder are set, prefer resilience.
      let relaxDevFallback = false;
      try {
        const qs = new URLSearchParams(location.search || '');
        const noRelax = qs.has('noRelax') || (function(){ try { return localStorage.getItem('tp_noRelax') === '1'; } catch { return false; } })();
        const ci = qs.has('ci');
        const uiMock = qs.has('uiMock');
        const mockFolder = qs.has('mockFolder');
        const isWebDriver = (typeof navigator !== 'undefined') && ((navigator).webdriver === true);
        relaxDevFallback = !!(ci || uiMock || mockFolder || isWebDriver) && !noRelax;
      } catch {}
      if (isDev && !forceLegacy && !relaxDevFallback) {
        try {
          console.error('[boot-loader] TS import failed; not falling back in dev. Set ?legacy=1 to force legacy.');
          if (err) console.error('[boot-loader] import error detail:', err && (err.stack || err.message || String(err)));
        } catch {}
        // Optional dev escape hatch: allow using built dist bundle with ?useDist=1
        try {
          const qs = new URLSearchParams(location.search || '');
          if (qs.has('useDist')) {
            push({ tag: 'boot-loader', msg: 'dev import failed; trying dist bundle (useDist=1)' });
            try {
              const v2 = encodeURIComponent(g.__TP_ADDV || 'dev');
              await import(`../../dist/index.js?v=${v2}`);
              push({ tag: 'boot-loader', msg: 'dist bundle loaded in dev', ok: true });
              return;
            } catch (e2) {
              try { console.error('[boot-loader] dist import in dev failed', e2 && (e2.stack || e2.message || String(e2))); } catch {}
            }
          }
        } catch {}
        return;
      }
      // Prod or forced legacy: inject monolith/module as a last resort
      try {
        try { g.applyCamOpacity = g.applyCamOpacity || function(){ try { console.debug('[boot-loader] shim: applyCamOpacity'); } catch{} }; } catch {}
        const s = document.createElement('script');
        s.src = './teleprompter_pro.js';
        // The current legacy build uses ESM import statements; load as a module
        s.type = 'module';
        s.defer = true;
        s.onload = async () => {
          push({ tag: 'boot-loader', msg: 'legacy loaded', ok: true });
          try {
            // Augment legacy with minimal UI bindings and Settings Scripts card for smoke
            const ui = await import('/src/wiring/ui-binds.js').catch(()=>null);
            if (ui && typeof ui.bindCoreUI === 'function') {
              try { ui.bindCoreUI({ scrollModeSelect: '#scrollMode', presentBtn: '#presentBtn, [data-action="present-toggle"]' }); } catch {}
            }
          } catch {}
          try {
            const inj = await import('/src/ui/inject-settings-folder.js').catch(()=>null);
            if (inj && typeof inj.ensureSettingsFolderControlsAsync === 'function') {
              try { inj.ensureSettingsFolderControlsAsync(6000); } catch {}
            }
          } catch {}
        };
        s.onerror = () => push({ tag: 'boot-loader', msg: 'legacy failed', ok: false });
        document.head.appendChild(s);
      } catch {}
    }
  })();
})(window);
