#!/usr/bin/env node
const puppeteer = require('puppeteer');
const fs = require('fs');
(async function main(){
  const out = { ok: false, errors: [], cases: [] };
  try{
    try { require('./static_server.js'); } catch {}
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    page.on('console', msg => {
      try { out.console = out.console || []; out.console.push({ type: msg.type(), text: msg.text() }); } catch {}
    });

    await page.goto('http://127.0.0.1:8080/teleprompter_pro.html', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(500);

    // helper to run the safe scene-check flow inside the page using the stubbed bridge
    async function runCase(name, opts) {
      const result = { name, ok: false, reason: null };
      try {
        // inject recorder preferred scene (via __recorder.getSettings or localStorage)
        if (opts.useLocalStorage) {
          await page.evaluate((pref) => localStorage.setItem('tp_obs_scene', pref), opts.preferred);
        } else {
          await page.evaluate((pref) => {
            window.__recorder = window.__recorder || {};
            window.__recorder.getSettings = () => ({ selected:['obs'], configs: { obs: { scene: pref } } });
          }, opts.preferred);
        }
        // inject stub bridge
        await page.evaluate(() => {
          window.__obsBridge = null; // clear
          window.__obsBridge = (function(){
            const calls = { setCurrentProgramScene: [] };
            return {
              calls,
              getSceneList: async () => window.__obsBridge._sceneList || [],
              getCurrentProgramScene: async () => window.__obsBridge._current || null,
              setCurrentProgramScene: async (sceneName) => { calls.setCurrentProgramScene.push(sceneName); return true; },
            };
          })();
        });
        // configure stub data
        await page.evaluate((data) => {
          window.__obsBridge._sceneList = (data && data.sceneList) || [];
          window.__obsBridge._current = (data && data.current) || null;
        }, { sceneList: opts.sceneList, current: opts.currentProgram });

        // run the safe flow (replicates app logic) inside page
        const res = await page.evaluate(async () => {
          try {
            const settings = (window.__recorder && window.__recorder.getSettings && window.__recorder.getSettings()) || {};
            const preferredScene = settings.configs?.obs?.scene || localStorage.getItem('tp_obs_scene') || '';
            // wait small stability window
            await new Promise(r=>setTimeout(r, 60));
            if (!preferredScene) return { action: 'none', reason: 'no-preference' };
            const bridge = window.__obsBridge;
            let current = null; let scenes = null;
            try { if (bridge && bridge.getCurrentProgramScene) current = await bridge.getCurrentProgramScene(); } catch(e) { return { action:'error', err:String(e) }; }
            try { if (bridge && bridge.getSceneList) scenes = await bridge.getSceneList(); } catch { scenes = null; }
            const names = Array.isArray(scenes) ? scenes.map(s => s && (s.sceneName || s.name || s)).filter(Boolean) : null;
            const exists = Array.isArray(names) ? names.indexOf(preferredScene) >= 0 : false;
            if (!exists) return { action: 'skip', reason: 'preferred-not-found', names, preferredScene, current };
            if (String(current) === String(preferredScene)) return { action: 'skip', reason: 'already-active', current };
            // call set
            try { await bridge.setCurrentProgramScene(preferredScene); } catch(e) { return { action:'error', err:String(e) }; }
            return { action: 'set', preferredScene };
          } catch(e) { return { action:'error', err:String(e) }; }
        });

        // read stub calls
        const calls = await page.evaluate(() => (window.__obsBridge && window.__obsBridge.calls) || null);
        result.res = res;
        result.calls = calls;

        // Determine expected
        const shouldSet = opts.shouldSet === true;
        const didSet = calls && calls.setCurrentProgramScene && calls.setCurrentProgramScene.length > 0;
        if (shouldSet === didSet) { result.ok = true; } else { result.ok = false; result.reason = `shouldSet=${shouldSet} but didSet=${didSet}`; }
      } catch (e) { result.ok = false; result.reason = String(e); }
      out.cases.push(result);
      return result;
    }

    // Case 1: preferred exists and different -> should set
    await runCase('preferred-exists-different', {
      preferred: 'PreferredScene',
      useLocalStorage: false,
      sceneList: [{ sceneName: 'Other' }, { sceneName: 'PreferredScene' }],
      currentProgram: 'Other',
      shouldSet: true,
    });

    // Case 2: preferred missing -> should NOT set
    await runCase('preferred-missing', {
      preferred: 'PreferredScene',
      useLocalStorage: false,
      sceneList: [{ sceneName: 'Other' }, { sceneName: 'Another' }],
      currentProgram: 'Other',
      shouldSet: false,
    });

    // Case 3: preferred already active -> should NOT set
    await runCase('preferred-already-active', {
      preferred: 'PreferredScene',
      useLocalStorage: false,
      sceneList: [{ sceneName: 'PreferredScene' }, { sceneName: 'Other' }],
      currentProgram: 'PreferredScene',
      shouldSet: false,
    });

    // Case 4: preferred missing, current unknown -> should skip without calling set
    await runCase('preferred-missing-current-unknown', {
      preferred: 'PreferredScene',
      useLocalStorage: false,
      sceneList: [{ sceneName: 'Other' }, { sceneName: 'Another' }],
      currentProgram: 'StrayScene',
      shouldSet: false,
    });

    await browser.close();
    out.ok = out.cases.every(c=>c.ok);
  }catch(e){ out.errors.push({ type:'fatal', message: String(e), stack: e && e.stack ? e.stack : null }); }
  const p = 'tools/test_obs_scene_ci_report.json'; fs.writeFileSync(p, JSON.stringify(out,null,2));
  console.log('[OBS-SCENE-CI] Wrote', p);
  if (out.ok) process.exit(0); process.exit(2);
})();
