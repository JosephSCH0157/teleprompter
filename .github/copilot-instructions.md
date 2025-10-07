# Teleprompter Pro - AI Coding Instructions

## Architecture Overview

This is a browser-based teleprompter application built as a **modular monolith** with sophisticated scroll control and external integrations. The core is a single HTML page (`teleprompter_pro.html`) with ES6 modules for major subsystems.

**Current Status**: Working on `fix/post-rollback-stabilization` branch (based on v1.5.8-stable). Main was rolled back for stability - new features are being re-introduced incrementally.

### Key Components & Data Flow

- **Core**: `teleprompter_pro.js` - main application with scroll geometry management
- **Scroll Control**: `scroll-control.js` + `scroll-helpers.js` - PID-based auto-scroll with single-writer pattern
- **Anchor Tracking**: `io-anchor.js` - IntersectionObserver-based line tracking for speech sync
- **Recording Adapters**: `recorders.js` + `adapters/` - pluggable external tool integration (OBS, Bridge HTTP)
- **Debug HUD**: `debug-tools.js` - runtime diagnostics (toggle with `~` key)

**Critical Invariant**: Only `#viewer` element scrolls. All scroll operations must go through the single-writer scheduler in `scroll-helpers.js` to prevent geometry conflicts.

## Development Patterns

### Scroll System Architecture
The app maintains strict scroll geometry control due to complex speech sync requirements:

```javascript
// ALWAYS use the scroller helpers, never direct scrollTop writes
const sh = createScrollerHelpers(() => document.getElementById('viewer'));
sh.scrollByPx(10);  // Correct
element.scrollTop = 100;  // NEVER - bypasses single-writer system
```

**Post-rollback stability rules** (see README):
- Keep `#viewer` as sole scrollable container with `overflowY: auto`
- Call `assertViewerInvariants()` after mode changes 
- Preflight `canScroll(viewer)` before auto catch-up operations
- Use controller's raw writer under lock, avoid SCROLLER for catch-up writes

### Module System & Debugging
- **Dev Mode**: Enable with `?dev=1` URL param or `localStorage.tp_dev_mode=1`
- **Debug HUD**: Press `~` to toggle real-time scroll/speech/match diagnostics
- **Boot Tracing**: `window.__TP_BOOT_TRACE` array captures initialization sequence
- **Version**: Always update `VERSION.txt` and `window.APP_VERSION` together

### Recording Adapter Pattern
Adapters in `adapters/` follow consistent interface:
```javascript
// Required methods: id, label, isAvailable(), start(), stop()
// Optional: configure(settings), test()
export function createAdapterName() {
  return {
    id: 'adapter-id',
    label: 'Display Name', 
    async isAvailable() { /* check if external tool accessible */ },
    async start() { /* trigger recording start */ },
    async stop() { /* trigger recording stop */ }
  };
}
```

## Key File Responsibilities

- `teleprompter_pro.js`: Core app initialization, speech sync logic, DOM management
- `scroll-control.js`: PID controller for auto catch-up scrolling (`startAutoCatchup()`)
- `io-anchor.js`: IntersectionObserver setup for tracking visible lines
- `recorders.js`: Registry pattern for recording adapters with settings persistence
- `debug-tools.js`: HUD system installation (`window.__tpInstallHUD()`)
- `teleprompter_pro.css`: Theme system including easter egg "savanna" theme

## Development Workflow

### Local Development
```bash
# Start dev server (Windows)
start_server.bat  # Uses npx http-server on port 5180

# Or manually:
npx http-server -a 127.0.0.1 -p 5180 -c-1
```

### Testing Checklist (from README)
After any scroll-related changes:
1. Load `teleprompter_pro.html` - confirm mouse wheel scrolling works
2. Press `~` for HUD - ensure it stays fixed without shifting layout
3. Check for no `[reject] reason=not-scrollable` logs in console
4. Verify no body/html scrollbars appear

### Version Management
- Update `VERSION.txt` first line (semver format)
- Update `window.APP_VERSION` in `teleprompter_pro.js`
- Document changes in `CHANGELOG.md`
- Build info goes in `MANIFEST.md`
- Current version: v1.5.8 (ANVIL build with virtual lines, soft advance, jitter detection)

## Integration Points

**External Tools**: Adapters integrate with OBS (WebSocket), HTTP bridges, and virtual buttons via standardized start/stop interfaces.

**Browser APIs**: Heavy use of IntersectionObserver, SpeechRecognition, MediaDevices, and requestAnimationFrame for smooth scroll performance.

**Storage**: Settings persist via localStorage with versioned keys (e.g., `tp_rec_settings_v1`).

## Current Focus Areas (v1.5.8)

**Advanced Speech Matching**: The app now features sophisticated line matching with:
- Virtual lines merging short runts to reduce jitter
- Monotonic commit system with hysteresis (requires stable hits)
- Distance-penalized ranking with rarity gating (IDF scoring)
- Junk-anchor gate v2 preventing jumps on common words
- Lost Mode recovery using 3-gram anchors when similarity drops
- Coverage-based soft advance to prevent stalls on long lines

**Jitter Detection**: Rolling standard deviation tracking with spike detection for match quality monitoring.

## Common Gotchas

- **Scroll Conflicts**: Never write `scrollTop` directly - always use `scroll-helpers.js` functions
- **Module Loading**: Use dynamic imports for optional dependencies (see `adapters/obs.js` CDN loading)
- **HUD Isolation**: Debug HUD must be position:fixed and not affect main layout
- **Speech Sync**: Line matching depends on exact DOM structure - be careful with text normalization changes
- **Virtual Lines**: The matching system now operates on virtual lines (merged short segments) - check index mapping when debugging highlighting issues