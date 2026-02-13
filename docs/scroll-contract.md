# Scroll Contract (SSOT Runtime Boundaries)

This document is the executable contract for scroll behavior.
`MANIFEST.md` owns architecture mapping; this file owns runtime boundaries.

## 1) SSOT Keys

- `scrollMode: EngineScrollMode` (owner: `appStore`)
- `scrollEnabled: boolean` (owner: `appStore`)
- `session.asrEngaged: boolean` (owner: `src/state/session.ts`)
- `session.asrArmed: boolean` (owner: `src/state/session.ts`)

`auto`/`off` are dialect states and must map through `scrollMode + scrollEnabled`.

## 2) ASR Invariants (Hard)

When `scrollMode='asr'`:

- `Start speech sync` must arm ASR for the session (`session.asrArmed=true`) before preroll/live begin.
- No timed/hybrid/wpm motor may run.
- No auto-intent flow may drive scroll.
- No preroll event may trigger movement.
- Movement trigger is ASR commit only.
- Commit path is writer-first: `seekToBlockAnimated(...)`.
- Pixel `driveToLine` is fallback only when writer/block mapping is unavailable.
- Strong small-delta forward/same matches (`delta>=0` within relaxed-small window) at/above required similarity must not be blocked solely for weak forward-evidence.
- Forward-evidence may still block backward jumps, large forward skips, and ambiguous multi-line collisions.
- `session.scrollAutoOnLive` does not gate ASR live attach/start logic.
- ASR index seeding from `blocks:scroll-mode` must resolve block-first, then derive line within block.
- If derived line is cue-only (`[pause]`, `[beat]`, `[reflective pause]`), advance to the first speakable line in that block.
- ASR anchor/cursor/evidence scans operate on speakable lines only; cue/tag/note-only render lines stay visible in UI but are excluded from ASR match domain.
- Scroll target identity is canonical: resolve scroller via `getScrollerEl()`; for main role this must be `main#viewer.viewer` with `#viewer` fallback.

## 3) Allowed Flows by Mode

- `timed`: timed engine drives movement when `scrollEnabled=true`.
- `wpm`: wpm adapter/timed drive movement when `scrollEnabled=true`.
- `hybrid`: motor + ASR correction lane (no ASR-only commit assertions).
- `asr`: commit-driven seek only; no motor lane.
- `step`: discrete manual stepping only.
- `rehearsal`: no programmatic movement; clamp behavior only.

## 4) Hydrate Contract

- Profile hydrate must not silently force runtime mode to ASR unless ASR is already engaged or user selected ASR in current session.
- Hydrate writes affecting scroll mode must be attributable (`withScrollModeWriter` metadata with source tags).

## 5) Kick Contract

- Kick is manual movement and never depends on motor/auto-intent.
- Kick resolves scroller by viewer role (`main` vs `display`) before movement.
- Kick prefers writer path; pixel nudge is fallback.
- Hotkeys and buttons call typed kick entrypoints only.
- Dev globals are allowed only in dev mode and must not leak to production.

## 6) Scroller Resolution Contract

- All runtime scroll reads/writes (kick, writer, router apply, step, restore, scheduler bridge) must use shared scroller resolution from `src/scroll/scroller.ts`.
- Do not target `document.scrollingElement`/`document.body` for script movement in normal runtime paths.
- Main viewer role target is `main#viewer.viewer` (fallback `#viewer`); display role target is display viewer element (`__tpDisplayViewerEl`) or `#wrap`.

## 7) Forbidden Flows

- Motor tick writes while `scrollMode='asr'`.
- Auto-intent writes while `scrollMode='asr'`.
- Unattributed hydrate mode writes.
- Publishing scroll globals outside `src/index-app.ts`.
- Defining new local ScrollMode unions instead of importing canonical types.
