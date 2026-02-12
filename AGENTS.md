# Agent Runtime Rules (Repo Local)

This file defines non-negotiable architecture rules for automated agents working in this repository.

## Authority

- `MANIFEST.md` is architecture SSOT.
- If scroll behavior changes, update `MANIFEST.md` first or in the same change.
- `docs/scroll-contract.md` defines runtime flow boundaries.

## Hard Constraints

- In `scrollMode='asr'`, no motor/auto-intent/tick-driven scroll is allowed.
- ASR scroll movement is commit-driven only.
- ASR commit path is writer-first (`seekToBlockAnimated`); pixel drive is fallback only when writer/block mapping is unavailable.
- Hydration may not silently flip runtime mode to ASR unless ASR is already engaged or the user selected ASR in this session.
- Hydration writes that affect scroll mode must be tagged/attributable for scroll-audit.
- Do not create new ScrollMode unions; import canonical mode types and translate dialects.
- Only `src/index-app.ts` may publish scroll globals:
  - `window.setScrollMode`
  - `window.getScrollMode`
  - `window.__tpScrollMode`

## Kick Contract

- Kick is manual movement only.
- Kick must not depend on motors or auto-intent.
- Kick resolves scroller by viewer role (`main` vs `display`).
- Kick uses writer path when possible and a small pixel nudge fallback otherwise.
- Any dev-only kick global must never leak to production builds.

## Where To Look First

- `MANIFEST.md` - architecture SSOT and ownership rules.
- `src/state/app-store.ts` - persistent app-level SSOT keys.
- `src/state/session.ts` - runtime session and ASR gating flags.
- `src/scroll/*` - engine implementations and routing.
- `src/features/scroll/*` - UI dialect adapters; not source of truth.
- `src/features/asr/asr-scroll-driver.ts` - ASR commit pipeline.
- `src/index-app.ts` - runtime assembly and approved global publishers.

