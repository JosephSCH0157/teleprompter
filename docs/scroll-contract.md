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
- Driver attach/create and transcript ingest readiness should occur on ASR mode selection when script blocks are available (do not require `session.asrArmed`).
- `session.asrArmed` is movement permission only: ASR may ingest/match/bookkeep while unarmed, but must not write scroll.
- No timed/hybrid/wpm motor may run.
- No auto-intent flow may drive scroll.
- No preroll event may trigger movement.
- Movement trigger is ASR commit only.
- Commit path is writer-first: `seekToBlockAnimated(...)`.
- ASR commit movement is writer-first: resolve block mapping via `seekToBlockAnimated(...)`, then (in ASR mode) ease toward commit `targetTop` with bounded-speed animation; this remains commit-driven (no continuous ASR motor lane).
- After a successful ASR commit seek, enforce a post-commit readability pass so the active line stays near the marker band while forward readable lookahead remains visible.
- Post-commit readability nudge must preserve a marker-centered active-line band; lookahead nudges must not force the active line above that band.
- Live ASR capture may force interim hypotheses on transport even when UI interim toggle is off; commit/movement remains gated by ASR commit logic.
- Pixel `driveToLine` is fallback only when writer/block mapping is unavailable.
- Strong small-delta forward/same matches (`delta>=0` within relaxed-small window) at/above required similarity must not be blocked solely for weak forward-evidence.
- Forward scan must score speakable joined windows (multi-line candidates) in addition to single-line candidates, so combined ASR phrases can advance to the correct forward line.
- Arbitration must allow forward continuation when transcript length exceeds current-line length and a forward window (`span>=2`) meets floor and near-current score slack.
- If current-line evidence is lexically weak (very low overlap tokens) and a forward candidate is near-score and above floor, prefer forward candidate instead of same-line recenter.
- Weak-current forward rescue must be continuity-bounded (`delta<=2`, `span<=2`) so low-overlap anchors cannot leap multiple lines/paragraphs.
- If arbitration regresses behind the current cursor after a forward commit, continuation recovery must stay near-forward (`+1` preferred, max `+2`) and never long-jump.
- First near-start commit is continuity-capped (`delta<=1`, non-forced) to prevent startup overshoot from buffered multi-line transcript chunks.
- Match selection is band-preferred: pick best candidate from active band (+tiny backward tolerance) first, but permit forward-window continuation/fallback before hard reject.
- During live ASR, `blocks:*` sync may refresh block metadata but must not rewrite cursor/index truth (`currentIndex` / driver line index).
- During live ASR after first commit, external cursor/index sync inputs must be monotonic: they may advance cursor truth but must not regress below committed cursor floor.
- On successful ASR commit, publish canonical cursor truth immediately (`currentIndex` plus commit index signal) so subsequent sync uses the new anchor.
- During interim transcript growth (`bufferGrowing`), block arbitration may temporarily expand forward window to `+2` blocks and evaluate merged forward block text (`N + N+1`) so boundary-split phrases can surface a forward candidate before guards apply.
- After forward/forced commit seek, reseed the match band around the committed index (small back tolerance, forward window) before next ingest so stale pre-commit windows cannot force immediate `match_out_of_band`.
- Out-of-band guard must be non-destructive (no evidence buffer clear or backward reseed); ignore and continue listening for in-band forward evidence.
- Stuck watchdog fail-safe: if phase is live, ASR is armed, transcript traffic continues (finals or sustained interim bursts), and commit count has not advanced for watchdog window, attempt a bounded forward recovery commit from forward scan at low floor.
- If watchdog selects a forward recovery candidate while interim buffer is still growing, treat that as forward-progress evidence: do not reject it as `interim_unstable`, and preserve watchdog floor through low-sim gating for that recovery attempt.
- Commit-time clamp: before ASR commit finalization (writer/pixel), cap forward delta for all commits to a small window (default `+1` line) unless confidence is strong (default `sim>=0.82`); emit `ASR_CLAMP` dev log when the clamp is applied.
- Cue-bridge low-sim bypass must be bridge-only: intermediate skipped lines must be skippable cue/meta/blank lines, capped to a small bridge (`<=2` skipped lines), and target must be speakable.
- Multi-line cue-bridge commits require stronger confidence (`sim>=0.45`); low-floor bypass is not allowed for multi-line bridge jumps.
- Commit-time hard deny: forward jumps greater than `+1` line must clear multi-jump floor (`sim>=0.45`), and `sim<0.30` must never commit multi-line.
- Ambiguity is hold-first: for low-confidence/tied/low-information near-line matches, enter HOLD (no commit), continue ingesting, and only relock/commit on strong forward anchor evidence.
- Guard profile defaults are relaxed for forward continuity: reduce same-line throttle, lower forced-evidence floors, and trigger watchdog recovery sooner while keeping forward recovery bounded.
- Any non-finite (`NaN`/`Infinity`) value in ASR commit/seek numeric paths must be hard-guarded and dropped; emit a dev diagnostic (`ASR NAN GUARD` / writer non-finite guard) instead of propagating unstable math.
- Forward-evidence may still block backward jumps, large forward skips, and ambiguous multi-line collisions.
- In short-final recent-forward cases, strong forward candidates above floor may satisfy forced-evidence even if general token/char minima are not met.
- `session.scrollAutoOnLive` does not gate ASR live attach/start logic.
- WebSpeech `onend` during an active ASR session must auto-restart recognition; manual/session stop must terminate without restart loops.
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
- In `scrollMode='asr'`, Kick acts as manual forward assist (advance one ASR block when available).
- Kick prefers writer path; pixel nudge is fallback.
- Hotkeys and buttons call typed kick entrypoints only.
- Hotkey typing-target suppression may block only `input`, `textarea`, and contenteditable targets; it must not suppress Kick on actionable controls like `button`/`#recBtn`.
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
