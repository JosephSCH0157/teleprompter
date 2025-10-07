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

## Speech Recognition & Text-Matching Pipeline

### Signal → Decision Flow
**Input & Guards**: Web Speech API events (`result`, `speechstart/end`, `error`) → speech guard (mutes when sync disabled) → tail processing

**Tail Processing**: 
- Canonicalization handles confusion pairs (e.g., `enforcement ↔ forcement/salemforcement`)
- Tokenization: words split on whitespace/punct, normalized to lowercase for matching

**Similarity & Coverage**:
- `sim`: N-gram windowed similarity against line text
- `coverage`: Fraction of spoken tokens found in target line
- `suffixHits ≥ 2`: Override low coverage when tail matches line ending

**Confidence Fusion**: `(0.55*sim + 0.45*cov) * jFactor`
- `jFactor`: EMA-smoothed jitter penalty (rolling std dev of match indices)
- Spike guard: Elevates jitter threshold for ~8s after detection

**Activation Policy**: Calls `activateLine()` when:
- `cov == 1 && confOk` (perfect coverage with confidence)
- `sim ≥ 0.92 && cov ≥ 0.14` (high similarity with minimal coverage)  
- Suffix rule triggers, or timeout guard (~1.2s) expires
- Includes dedupe/debouncing via HUD bus coalescing

### Catch-up & Scroll Control
**Eligibility Gates**: Low-sim/jitter freeze, anchor visibility check, hysteresis bands, bounded-advance early exit

**Oscillation Detection**: A↔B↔A pattern within 500ms triggers freeze window

**Single Authority**: PD/ScrollManager is sole scroll writer; all operations go through `SCROLLER.request()`

## Aggressiveness Tuning System

### Probe Tiers (0-3)
| Tier | Band Width | Trigger |
|------|------------|---------|
| 0 | `[0.20, 0.50]` | Initial/reset |
| 1 | `[0.15, 0.55]` | Tier advance |
| 2 | `[0.10, 0.60]` | Continued probing |
| 3 | `[0.05, 0.65]` | Maximum width |

### Key Thresholds
- `SIM_GO = 0.82`: Direct activation threshold
- `SIM_PROBE = 0.60`: Minimum for probe consideration
- `HYSTERESIS`: Pixel buffer preventing scroll thrash
- `IN_BAND_EPS`: Sticky band tolerance

### Tuning Cookbook
- **Lags on fast readers**: Decrease `HYSTERESIS`, raise `SIM_PROBE` slightly
- **Jitters on noisy mics**: Raise `JITTER_HIGH`, slow EMA, widen early band  
- **Ping-pongs**: Increase `IN_BAND_EPS`, extend oscillation freeze
- **Stalls frequently**: Lower `SIM_GO`, check deadman counter (24 holds)
- **Over-eager**: Raise activation thresholds, tighten bands

## External Integrations & Gotchas

### OBS / Virtual Cam / Browser Source
- **Autoplay/Mic Gating**: Chrome blocks audio until user gesture - implement "start" handshake
- **Device IDs**: Persist chosen devices; handle USB re-order with fallbacks
- **Frame Timing**: Match Browser Source FPS (30/60Hz), enable "Refresh when scene active"
- **Resolution**: Use CSS `font-size`/`--viewer-line-height` instead of browser zoom

### Display Window / Bridge Adapters  
- **Hello/Ready Handshake**: Implement timeouts, retry pump; watch for ad-blocker message drops
- **RTC Camera**: ICE failures behind corporate NAT need STUN servers; handle "awaiting answer" state
- **Extension Noise**: "Message channel closed" unhandledrejection is benign - detect and silence

### File Protocol & CORS
- **DOCX Import/Workers**: Won't load with `file://` - use `http://localhost` via `start_server.bat`
- **Asset Loading**: HUD assets, worker scripts require HTTP protocol

### Mobile & IME Issues
- **VisualViewport**: Guard against resize storms; defer recompute until settled
- **Permissions**: Handle `getUserMedia` "NotReadableError" when device is busy
- **GPU Blocklist**: Can cause black camera panes - check browser flags

### Known Issues & Switches
| Flag | localStorage Key | Fixes |
|------|------------------|-------|
| `?dev=1` | `tp_dev_mode` | Enables dev UI, verbose logs |
| - | `tp_calm` | Disables nudges, gentler UX |
| - | `tp_hud_verbose` | Full HUD diagnostic output |

## HUD Usage & Debugging Recipes

### Enable Comprehensive Logging
```javascript
// Dev mode + verbose HUD
localStorage.setItem('tp_dev_mode', '1');
localStorage.setItem('tp_hud_verbose', '1');
// Filter noisy logs  
localStorage.setItem('tp_log_mute', 'catchup:|anchorIO');
localStorage.setItem('tp_log_sample', '8');
```

### Key Streams to Monitor
- `catchup:eligibility` - Decision logic: sim, cov, stale, anchorVisible
- `catchup:target` - Frontier idx & targetY movement (~2-3Hz expected)
- `scroll:attempt/progress/stalled` - Scroll execution status
- `reader:locked/unlocked` - Why scrolling is paused
- `rogue:scrollTop` - Warns about unauthorized scroll writes
- `watchdog:recenter` - Last-resort recenter triggers

### Quick Sanity Checks
1. **Speech Recognition**: Say known line → expect `match:activate` with reason `conf` or `sim+cov`
2. **Probe Behavior**: During speech, `__tpHoldStreak` should oscillate; climbing to 24 repeatedly = over-probing
3. **Scroll Stability**: Frequent `scroll:oscillation-freeze` = need wider sticky band or more hysteresis

### Troubleshooting Matrix
| Symptom | Probable Cause | Knob to Turn |
|---------|----------------|--------------|
| Lags behind speech | Low thresholds | Decrease `HYSTERESIS`, raise `SIM_PROBE` |
| Jittery on noise | Mic sensitivity | Raise `JITTER_HIGH`, slower EMA |
| Ping-pong scrolling | Narrow bands | Increase `IN_BAND_EPS`, oscillation freeze |
| Frequent stalls | High activation bar | Lower `SIM_GO`, check deadman logic |
| Over-eager jumps | Low thresholds | Raise activation thresholds, tighten bands |

## Common Gotchas

- **Scroll Conflicts**: Never write `scrollTop` directly - always use `scroll-helpers.js` functions
- **Module Loading**: Use dynamic imports for optional dependencies (see `adapters/obs.js` CDN loading)  
- **HUD Isolation**: Debug HUD must be position:fixed and not affect main layout
- **Speech Sync**: Line matching depends on exact DOM structure - be careful with text normalization changes
- **Virtual Lines**: The matching system now operates on virtual lines (merged short segments) - check index mapping when debugging highlighting issues