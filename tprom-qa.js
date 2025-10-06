/*
 * Teleprompter QA Overlay — tprom-qa.js
 * One-file console overlay + instrumentation for SCROLLER-driven teleprompter runs.
 *
 * Drop in after SCROLLER loads. No behavior changes; read-only except for monkey-patching
 * SCROLLER.request to capture intent + timing. Degrades gracefully if SCROLLER is absent.
 *
 * Metrics shown:
 *  - Commits (count) & p95 latency
 *  - Oscillation (direction flips within hysteresis window) & ratio
 *  - User-canceled pending commits (wheel/touch/key before commit)
 *  - Legacy programmatic scrolls (scrolls with no pending request and no recent user input)
 *  - Stall count (no line advance or programmatic commit > stallMs while playing)
 *
 * Optional hooks (call these from your code for higher-fidelity signals):
 *  - window.TPROM.play(true|false)          // mark playing state
 *  - window.TPROM.noteLineAdvance()         // call when reader advances a line
 *  - window.TPROM.setContainer(el)          // override auto-detected scroll container
 *  - window.TPROM.config = { ... }          // thresholds before start(); see defaults below
 */
/* eslint no-console:0 */
;(function () {
  'use strict'

  const DEFAULTS = {
    stallMs: 2000,          // stall detector threshold
    hysteresisMs: 800,      // oscillation window
    minMovePx: 8,           // minimum pixel delta to treat as a commit
    minMoveVh: 0.05,        // OR 5% of viewport height
    maxLatencySamples: 300, // rolling window for p95
    overlayPos: 'br',       // 'br' | 'tr' | 'bl' | 'tl'
    autoStart: true
  }

  const TPROM = (window.TPROM = window.TPROM || {})
  if (TPROM.__loaded) return
  TPROM.__loaded = true

  TPROM.config = Object.assign({}, DEFAULTS, TPROM.config || {})

  // ----- state -----
  const S = {
    playing: false,
    lastUserInputTs: 0,
    lastAdvanceTs: 0,
    lastCommitTs: 0,
    lastDir: 0, // -1 up, 1 down
    pending: null, // { ts, dir, src, top }

    commitLatencies: [],
    commitCount: 0,
    flips: 0,
    userCancels: 0,
    stalls: 0,
    legacyProgrammatic: 0,

    container: null,
    overlayEl: null,
    timerId: null,
    scrollListener: null,
    inputListeners: [],
    unpatch: null,
  }

  // ----- utilities -----
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now() }

  function getContainer() {
    if (S.container && S.container.nodeType) return S.container
    // Prefer SCROLLER's active container if exposed
    try {
      const sc = window.SCROLLER
      if (sc) {
        if (typeof sc.getContainer === 'function') {
          const c = sc.getContainer()
          if (c) return (S.container = c)
        } else if (sc.state && sc.state.container) {
          return (S.container = sc.state.container)
        }
      }
    } catch (_) {}
    return (S.container = document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body)
  }

  function getScrollTop() {
    const c = getContainer()
    if (!c) return 0
    if (c === window) return window.scrollY || 0
    return (typeof c.scrollTop === 'number') ? c.scrollTop : 0
  }

  function vh(px) { return (window.innerHeight || 0) * px }

  function minMove() {
    const cfg = TPROM.config
    return Math.max(cfg.minMovePx, vh(cfg.minMoveVh))
  }

  function p95(arr) {
    if (!arr.length) return 0
    const a = arr.slice().sort((a, b) => a - b)
    const idx = Math.min(a.length - 1, Math.floor(0.95 * (a.length - 1)))
    return Math.round(a[idx])
  }

  function fmt(n) { return typeof n === 'number' ? n.toFixed(0) : '—' }

  function setPlaying(v) { S.playing = !!v }

  // ----- overlay -----
  function injectStyles() {
    const style = document.createElement('style')
    style.id = 'tprom-qa-style'
    style.textContent = `
#tprom-overlay{position:fixed;${posCss(TPROM.config.overlayPos)}min-width:260px;max-width:360px;z-index:2147483647;backdrop-filter:saturate(1.2) blur(8px);background:rgba(10,12,16,.75);color:#e8f0ff;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 12px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-shadow:0 6px 24px rgba(0,0,0,.35)}
#tprom-overlay .hdr{display:flex;align-items:center;gap:8px;margin-bottom:6px}
#tprom-overlay .dot{width:8px;height:8px;border-radius:50%;background:#79f2c0;box-shadow:0 0 0 2px rgba(121,242,192,.2)}
#tprom-overlay .dot.paused{background:#f5a97f}
#tprom-overlay .title{font-weight:600;letter-spacing:.2px}
#tprom-overlay .rows{display:grid;grid-template-columns:1fr auto;gap:4px 10px}
#tprom-overlay .lab{opacity:.65}
#tprom-overlay .val{font-weight:600}
#tprom-overlay .ok{color:#79f2c0}
#tprom-overlay .warn{color:#ffd166}
#tprom-overlay .bad{color:#ff6b6b}
#tprom-overlay .muted{opacity:.5}
#tprom-overlay .footer{margin-top:6px;display:flex;justify-content:space-between;opacity:.6}
    `
    document.head.appendChild(style)
  }

  function posCss(pos){
    switch(pos){
      case 'tr': return 'top:12px;right:12px;'
      case 'bl': return 'bottom:12px;left:12px;'
      case 'tl': return 'top:12px;left:12px;'
      default: return 'bottom:12px;right:12px;'
    }
  }

  function renderOverlay() {
    const el = (S.overlayEl = document.createElement('div'))
    el.id = 'tprom-overlay'
    el.innerHTML = `
      <div class="hdr">
        <div class="dot" id="tprom-dot"></div>
        <div class="title">Teleprompter QA</div>
        <div class="muted" style="margin-left:auto">SCROLLER</div>
      </div>
      <div class="rows">
        <div class="lab">Commits</div><div class="val" id="tprom-commits">0</div>
        <div class="lab">p95 commit ms</div><div class="val" id="tprom-p95">0</div>
        <div class="lab">Oscillation</div><div class="val" id="tprom-osc">0 (0%)</div>
        <div class="lab">User cancels</div><div class="val" id="tprom-cancel">0</div>
        <div class="lab">Legacy programmatic</div><div class="val" id="tprom-legacy">0</div>
        <div class="lab">Stalls</div><div class="val" id="tprom-stalls">0</div>
      </div>
      <div class="footer"><span id="tprom-src" class="muted">—</span><span class="muted">hyst ${TPROM.config.hysteresisMs}ms</span></div>
    `
    document.body.appendChild(el)
  }

  function updateOverlay() {
    if (!S.overlayEl) return
    const $ = (id) => S.overlayEl.querySelector(id)
    const commits = S.commitCount
    const p95ms = p95(S.commitLatencies)
    const osc = S.flips
    const ratio = commits ? Math.round((osc / commits) * 100) : 0

    $('#tprom-commits').textContent = commits
    $('#tprom-p95').textContent = fmt(p95ms)

    const oscEl = $('#tprom-osc')
    oscEl.textContent = `${osc} (${ratio}%)`
    oscEl.className = 'val ' + (ratio < 2 ? 'ok' : ratio < 5 ? 'warn' : 'bad')

    $('#tprom-cancel').textContent = S.userCancels
    $('#tprom-legacy').textContent = S.legacyProgrammatic
    $('#tprom-stalls').textContent = S.stalls

    const dot = S.overlayEl.querySelector('#tprom-dot')
    dot.classList.toggle('paused', !S.playing)

    const src = S.pending ? (S.pending.src || 'pending') : '—'
    S.overlayEl.querySelector('#tprom-src').textContent = src
  }

  // Roughly match ScrollManager.computeTargetYForEl for direction inference
  function estimateTargetYForEl(el){
    try {
      const sc = getContainer(); if (!el || !sc) return null
      const scR = (sc === window) ? { top: 0 } : (sc.getBoundingClientRect ? sc.getBoundingClientRect() : { top: 0 })
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null
      if (!r) return null
      const vh = (sc === window) ? (window.innerHeight || 0) : (sc.clientHeight || 0)
      const bias = 0.35
      const cur = getScrollTop()
      const y = cur + (r.top - scR.top) - Math.round(vh * bias)
      const max = (function(){ try { const h = (sc===window? document.documentElement.scrollHeight : sc.scrollHeight); const v = (sc===window? window.innerHeight : sc.clientHeight); return Math.max(0, h - v); } catch { return 0; } })()
      return Math.max(0, Math.min(Math.round(y), max))
    } catch { return null }
  }

  // ----- instrumentation -----
  function instrumentScroller() {
    const sc = window.SCROLLER
    if (!sc || typeof sc.request !== 'function') return () => {}
    if (sc.__tprom_patched) return sc.__tprom_unpatch || (() => {})

    const orig = sc.request.bind(sc)
    sc.__tprom_patched = true

    sc.__tprom_unpatch = function () {
      sc.request = orig
      sc.__tprom_patched = false
    }

    sc.request = function (req) {
      // mark playing if source looks like reader/teleprompter
      const src = (req && (req.src || req.source || req.intent || req.tag || req.reason)) || 'unknown'
      if (/reader|teleprompter|autoplay|script/i.test(String(src))) setPlaying(true)

      try {
        const ts = now()
        const st = getScrollTop()
        let target = st
        if (req && typeof req.y === 'number') target = Number(req.y)
        else if (req && typeof req.top === 'number') target = Number(req.top)
        else if (req && req.el) {
          const est = estimateTargetYForEl(req.el)
          if (typeof est === 'number') target = est
        }
        const dir = Math.sign(target - st)
        S.pending = { ts, dir, src, top: target }
        console.debug('[TPROM] SCROLLER.request', { ts, src, st, target, dir })
      } catch (e) {}

      return orig(req)
    }

    return sc.__tprom_unpatch
  }

  function onScroll(e) {
    const t = now()
    const st = getScrollTop()
    const pend = S.pending
    const deltaDir = (() => {
      if (!pend || typeof pend.top !== 'number') return 0
      const d = pend.top - st
      return Math.abs(d) >= minMove() ? Math.sign(d) * -1 : 0 // if we've reached/passed target, direction of travel was -sign(d)
    })()

    if (pend) {
      // Did user cancel before commit?
      if (S.lastUserInputTs && t - S.lastUserInputTs < 200 && !deltaDir) {
        S.userCancels++
        S.pending = null
        console.debug('[TPROM] pending canceled by user input')
        updateOverlay()
        return
      }

      // Consider a commit realized if we've moved in the intended direction and by enough
      const moved = Math.abs((pend.top || st) - st)
      const intendedDir = pend.dir
      const currentDir = Math.sign(st - (S.__lastSt || st))
      S.__lastSt = st

      if (intendedDir !== 0 && currentDir === intendedDir && moved >= minMove()) {
        const latency = Math.max(0, t - pend.ts)
        S.commitLatencies.push(latency)
        if (S.commitLatencies.length > TPROM.config.maxLatencySamples) S.commitLatencies.shift()
        S.commitCount++

        // oscillation check
        if (S.lastDir && currentDir && currentDir !== S.lastDir && (t - S.lastCommitTs) < TPROM.config.hysteresisMs) {
          S.flips++
          console.warn('[TPROM] oscillation flip', { dt: t - S.lastCommitTs })
        }

        S.lastDir = currentDir
        S.lastCommitTs = t
        S.pending = null

        console.debug('[TPROM] commit', { latency, currentDir, st })
        updateOverlay()
        return
      }
    }

    // If we got a scroll without pending and without recent user input, treat as legacy programmatic
    if (!pend && (!S.lastUserInputTs || t - S.lastUserInputTs > 200)) {
      S.legacyProgrammatic++
      console.warn('[TPROM] legacy programmatic scroll detected', { st })
      updateOverlay()
    }
  }

  function bindScroll() {
    S.scrollListener = onScroll
    const c = getContainer()
    ;(c === window ? window : c).addEventListener('scroll', S.scrollListener, { passive: true })
  }

  function bindUserInputs() {
    const bump = () => { S.lastUserInputTs = now() }
    const opts = { passive: true }
    const roots = [window, document]
    const events = ['wheel', 'touchstart', 'touchmove', 'keydown', 'mousedown']
    for (const root of roots) for (const ev of events) {
      root.addEventListener(ev, bump, opts)
      S.inputListeners.push([root, ev, bump])
    }
  }

  function unbindUserInputs() {
    for (const [root, ev, fn] of S.inputListeners) root.removeEventListener(ev, fn)
    S.inputListeners = []
  }

  function startTimers() {
    stopTimers()
    S.timerId = window.setInterval(() => {
      // Stall detector
      if (S.playing) {
        const t = now()
        const quietSince = Math.min(
          S.lastCommitTs || 0x7fffffff,
          S.lastAdvanceTs || 0x7fffffff
        )
        const dt = t - quietSince
        if (quietSince && dt > TPROM.config.stallMs) {
          S.stalls++
          console.error('[TPROM] stall detected', { dt })
          // Reset so we don't count continuously
          S.lastCommitTs = t
          S.lastAdvanceTs = t
          updateOverlay()
        }
      }
    }, 500)
  }

  function stopTimers() {
    if (S.timerId) window.clearInterval(S.timerId)
    S.timerId = null
  }

  // ----- public API -----
  TPROM.start = function () {
    injectStyles()
    renderOverlay()
    S.unpatch = instrumentScroller()
    bindScroll()
    bindUserInputs()
    startTimers()
    updateOverlay()
    console.info('[TPROM] QA overlay started')
  }

  TPROM.stop = function () {
    try { if (S.unpatch) S.unpatch() } catch (_) {}
    try { const c = getContainer(); (c===window?window:c).removeEventListener('scroll', S.scrollListener) } catch (_) {}
    unbindUserInputs()
    stopTimers()
    if (S.overlayEl && S.overlayEl.parentNode) S.overlayEl.parentNode.removeChild(S.overlayEl)
    const style = document.getElementById('tprom-qa-style')
    if (style && style.parentNode) style.parentNode.removeChild(style)
    console.info('[TPROM] QA overlay stopped')
  }

  TPROM.play = function (v) { setPlaying(!!v); updateOverlay() }
  TPROM.noteLineAdvance = function () { S.lastAdvanceTs = now() }
  TPROM.setContainer = function (el) { S.container = el }

  // convenience toggles in console
  TPROM.toggle = function () { if (S.overlayEl) TPROM.stop(); else TPROM.start() }

  // Auto-start unless opted out
  if (TPROM.config.autoStart) TPROM.start()
})()
