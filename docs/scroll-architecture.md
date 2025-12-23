# Scroll & Auto-Scroll Architecture

## Goals

- Single source of truth (SSOT) for:
  - Auto-scroll on/off
  - Active mode (timed, marker-lock, etc.)
  - Current speed (WPM or abstract "speed" value)
- Single DOM writer for scroll changes:
  - No direct `scrollTop` / `scrollTo` writes in UI or legacy code
  - All viewer movement goes through a single writer function
- Clear layering:
  1. State + controller (brain)
  2. Writer (DOM scrolling)
  3. Modes (strategies)
  4. UI bindings

---

## Ownership Layers

### 1. State + Controller (Brain)

**Owner (TS):**

- `src/index.ts`
  - Imports `initAutoScroll` from `./features/autoscroll.js`
  - Wires:
    - `viewer` (`#viewer`)
    - `autoToggle` (`#autoToggle`)
    - `autoSpeed` (`#autoSpeed`)

- `src/features/autoscroll.*` (TS source, compiled to `./features/autoscroll.js`)
  - Owns:
    - `autoEnabled` (on/off)
    - current speed
    - active mode
    - loops/timers that drive auto-scroll

**Rule:**  
Only the TS `autoscroll` feature owns auto-scroll state and timers.

---

### 2. Writer (DOM Scroll Pipe)

**Owner (legacy helper, used by TS):**

- `scroll-helpers.js`
  - `createScrollerHelpers(getScroller)`
    - Returns a writer that:
      - clamps scroll values to valid range
      - uses `requestAnimationFrame` to batch writes
      - ultimately sets `scroller.scrollTop`

**Rule:**  
All viewer scroll mutations must go through the scroll writer.  
No UI or legacy code may set `scrollTop` / `scrollTo` directly.

---

### 3. Modes (Strategies)

**Intended owners:**

- TS mode layer inside `features/autoscroll.*` (or siblings)
  - Timed mode (tick based on speed/WPM)
  - Marker-lock mode (keep highlight in view)
  - Manual/paused

**Rule:**  
Modes tell the brain *what* to do (advance, glide, hold),  
but they do **not** write to the DOM directly.  
They call the scroll writer via the controller API.

---

### 4. UI Bindings

**Owner (TS UI layer):**

- TS binder in `features/autoscroll.*` / `src/ui/*.ts`
  - `autoToggle` click ? `auto.toggle()`
  - `autoSpeed` input ? `auto.setSpeed(value)`
  - any mode buttons ? `auto.setMode('timed' | 'marker' | ...)`

**Rule:**  
UI binds to a small TS API and never manages its own timers,  
speed caches, or direct scrollTop writes.

---

## Legacy Modules (Allowed, but Not Owners)

These modules contain **implementation helpers** that TS may call,
but they are **not** allowed to own state or UI:

- `scroll-helpers.js`
  - `createScrollerHelpers(getScroller)` ? DOM writer

- `scroll-control.js`
  - `createScrollController(...)` ? low-level control loop, PLL-ish logic

- `line-index.js`
  - `buildLineIndex(root)` ? line ? DOM mapping

- `io-anchor.js`
  - Intersection observer / anchor tracking

**Rule:**  
These helpers are used *through* TS features.  
They do not bind UI or keep their own auto/scroll state.

---

## Legacy Modules (To Be Cleaned Up)

These are considered **legacy wiring** for scroll/auto and must not
own state or write to `scrollTop` directly after cleanup:

- `teleprompter_pro.js`
- `dom.js`
- `settings.js`
- `placeholder-ui.js`
- any other file that:
  - sets `viewer.scrollTop` or `document.scrollingElement.scrollTop`
  - uses its own scroll timers / intervals / rAF loops
  - keeps separate `autoEnabled` / `autoSpeed` state

---

## Cleanup Plan (CLEANUP MODE)

### Step 1 ? Discovery

Use ripgrep/VS Code search to find **all scroll/auto touchpoints**:

- `scrollTop`
- `scrollTo(`
- `autoToggle`
- `autoSpeed`
- `auto scroll`
- `createScrollController`
- `createScrollerHelpers`
- `setInterval` / `requestAnimationFrame` mentioning scroll

List each function / listener / state variable that touches these.

For each, classify as:

- **kept ? part of new flow**  
  (TS `autoscroll` feature, scroll writer, controller)

- **wrapped ? will now call the new API**  
  (legacy entry points that must call into TS instead of owning logic)

- **deleted ? old path we no longer want**  
  (direct scrollTop writes, old auto loops, duplicate state)

> Keep this list in this file under a new heading:
> `## Cleanup Inventory`

### Step 2 ? Apply

For each **wrapped** item:

- Replace direct logic with calls to the TS scroll API:
  - e.g. `window.tpAuto.toggle()`, `window.tpAuto.setSpeed(x)`, etc.
  - or whatever the autoscroll TS API exposes.

For each **deleted** item:

- Remove:
  - old auto-scroll timers and functions
  - direct `scrollTop` writes
  - duplicate `autoEnabled` / speed variables
  - extra DOM event handlers on `#viewer`, `#autoToggle`, `#autoSpeed`

### Step 3 ? Invariants Check

After cleanup, all of the following must be true:

1. Only **one** module owns scroll/auto state:
   - the TS `autoscroll` feature.

2. Only **one** handler is bound to:
   - `#autoToggle`
   - `#autoSpeed` (or speed controls in general).

3. All viewer scroll writes go through:
   - the scroll writer from `scroll-helpers.js`
   - no other direct `.scrollTop` / `.scrollTo` calls remain.

4. No remaining references to legacy auto-scroll functions:
   - e.g. `legacyAutoScroll`, `autoScrollTick`, old PLL loops, etc.

If any of these are not true, scroll cleanup is **not done**.

---

## Cleanup Inventory

- Kept ? TS SSOT + writer path:
  - `src/features/autoscroll.ts:78-212` owns `active`/speed state, RAF loop, UI binding for `autoToggle`/`autoSpeed`, and writes via `__tpScrollWrite` fallback.
  - `src/scroll/adapter.ts:5-22` installs `__tpScrollWrite` using `createScrollerHelpers` and asserts `__tpScrollSSOT`.
  - `src/scroll/scroll-helpers.ts` clamps and batches scroll writes (writer used by adapter and router).
  - `src/scroll/scroll-control.ts` provides the PLL scroll controller; no UI binding.
  - `src/features/scroll/auto-adapter.ts` exposes the TS auto brain as `__tpAuto` for the mode router.

- Wrapped ? needs to call the TS API / writer:
  - `src/index.ts:147-181` `bridgeLegacyScrollController` patches `window.__scrollCtl.setSpeed` via a polling `setInterval`; should forward into the TS scroll brain and remove the timer once SSOT is present.
  - `src/index.ts:631-646` legacy `autoSpeed` input listener pushes values into `brain.setBaseSpeedPx/setTargetSpeed`; should reuse the autoscroll API instead of duplicating bindings.
  - `src/features/scroll-router.ts:372-407` `stepOnce`/`holdCreepStart` mutate `viewer.scrollTop` directly; route through the scroll writer/brain.
  - `src/features/scroll-router.ts:963-968` keyboard +/- handler nudges `vp.scrollTop` for visibility; switch to the writer or a brain helper.
  - `src/features/scroll/step-scroll.ts:100-115,298-302` manual `scrollTop` jumps (line/block, Home/End) with optional helper fallback; replace with writer requests.
- `src/ui/dom.ts:433-440` `resetRun` forces `scroller.scrollTop = 0` and emits display scroll; call the writer/brain instead of direct DOM writes.
- `src/index-hooks/asr-legacy.ts:396-423,598-599` ASR legacy `scrollToLine` uses `window.scrollTo`/`scroller.scrollTo` with rAF smoothing; wrap to the TS scroll API or retire after migration.
- `src/features/autoscroll.ts:121-124` still falls back to `viewer.scrollTop` if `__tpScrollWrite` is absent; drop this once the writer is guaranteed to exist.

Canonical runtime shell: `teleprompter_pro.html` (the legacy `index.html` now redirects here for backward compatibility).

- Deleted ? direct DOM writes to remove:
  - `display.html:11-34` scroll channel writes `wrap.scrollTop` / `wrap.scrollTo` when applying display packets.
- `index.html:57-59` fallback sets `document.scrollingElement.scrollTop` during manual jumps (now a redirect stub to `teleprompter_pro.html`).
- `teleprompter_pro.html:57-59` same fallback jump handler in the legacy shell.

---

## TODO ? Legacy Callback Hunt

1) Make `__tpScrollWrite` available before any auto/mode loop starts, then remove the `viewer.scrollTop` fallback inside `src/features/autoscroll.ts`.
2) Replace every `viewer.scrollTop` touch in `src/features/scroll-router.ts` (stepOnce, creep, hotkey nudge) with writer/brain calls; keep UI-only speed changes on the TS API.
3) Convert `src/features/scroll/step-scroll.ts` to issue writer requests (and respect marker offsets) instead of direct DOM jumps.
4) Rework `resetRun` (`src/ui/dom.ts`) and `asr-legacy` scroll-to-line helpers to call the TS scroll API; delete the polling patch in `bridgeLegacyScrollController` once unused.
5) Remove the direct scroll writes in `display.html`/`index.html`/`teleprompter_pro.html` or funnel them through the TS writer entry point.
