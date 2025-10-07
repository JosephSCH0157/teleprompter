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

**Input Taps & Guards**:
- Web Speech API events: `result` (interim/final), `speechstart`, `speechend`, `error`, `nomatch`
- Speech guard: `speechGuard.mute()` when sync disabled via UI toggle; `speechGuard.unmute()` on re-enable
- Error paths: Handle `network`, `no-speech`, `aborted`, `audio-capture` gracefully with retry logic

**Tail Processing**:
- **Canonicalization**: Normalize confusion pairs before matching:
  - `enforcement` ↔ `forcement`/`salemforcement`  
  - `constitutional` ↔ `tuition`/`institutional`
  - Custom mappings in `confusionPairs` object
- **Tokenization**: Split on `\s+` and punct, normalize to lowercase, filter empty strings
- **Stop Words**: Common words (`the`, `and`, `so`) marked as junk tokens for anchor gating

**Similarity & Coverage**:
- **sim**: N-gram windowed similarity using sliding window over line text
- **coverage**: `matchedTokens.length / spokenTokens.length` - fraction of spoken tokens found in target line
- **suffixHits**: Count of spoken tail tokens matching line ending; `≥ 2` overrides low coverage for end-of-line detection

**Confidence Fusion**: 
- Formula: `(0.55 * sim + 0.45 * cov) * jFactor`
- **jFactor**: EMA-smoothed jitter penalty from rolling std dev of `bestIdx - currentIdx`
- **Spike Guard**: After jitter spike detected, elevate threshold for ~8s to prevent false activations
- **Jitter Estimation**: Rolling window std dev with 0.85 EMA decay, spike at `> JITTER_HIGH` threshold

**Activation Policy**: Calls `activateLine(idx, reason)` when:
- `cov == 1.0 && confidence > confThreshold` (perfect coverage + confidence check)
- `sim ≥ 0.92 && cov ≥ 0.14` (high similarity even with minimal coverage)
- `suffixHits ≥ 2 && sim ≥ suffixFloor` (suffix rule for line endings)
- Timeout guard: ~1.2s elapsed without activation → force with best candidate
- **Dedupe**: HUD bus coalescing prevents duplicate activations within 50ms window

### Catch-up & Scroll Control

**Eligibility Gates**:
- **Low-Sim Freeze**: Block when recent similarity < `SIM_FREEZE` threshold
- **Jitter Freeze**: Block during jitter spike recovery window
- **Anchor Visibility**: Require current anchor visible in viewport before allowing scroll
- **Hysteresis Bands**: Sticky zones around current position prevent micro-oscillations  
- **Bounded Advance**: Early exit if jump > `MAX_ADVANCE_LINES` to prevent runaway scrolling

**Oscillation Detection**:
- Pattern: A↔B↔A line transitions within 500ms window triggers freeze
- **Freeze Window**: 2-3 second cooldown after oscillation detected
- **History Buffer**: Track last N scroll targets with timestamps for pattern matching

**Single Authority Pattern**:
- **PD Controller**: `PIDController` in `scroll-control.js` is sole scroll writer
- **SCROLLER.request()**: All scroll operations must go through request queue in `scroll-helpers.js`
- **Lock Mechanism**: Raw writer operations use mutex to prevent concurrent scroll writes
- **Rejection Logging**: `[reject] reason=not-scrollable` when viewer element not ready

## Aggressiveness Tuning System

### Probe Tiers (0-3)
| Tier | Band Width | Advance Trigger | Reset Trigger |
|------|------------|-----------------|---------------|
| 0 | `[0.20, 0.50]` | 3 successful probes | User intervention |
| 1 | `[0.15, 0.55]` | 4 successful probes | 2 failed activations |
| 2 | `[0.10, 0.60]` | 5 successful probes | Jitter spike |
| 3 | `[0.05, 0.65]` | Maximum aggression | Oscillation detected |

### Key Thresholds & Gates
- **SIM_GO = 0.82**: Direct activation threshold (bypass probe system)
- **SIM_PROBE = 0.60**: Minimum similarity for probe consideration  
- **Deadman Counter**: 24 consecutive holds triggers fallback nudge
- **Stale Criteria**: >2.5s without activation marks line as stale
- **Lead Lines**: Look-ahead window of 2-3 lines for early activation

### Hysteresis & Stability
- **HYSTERESIS**: 48px scroll buffer preventing micro-bouncing
- **IN_BAND_EPS**: 12px sticky band tolerance around target position
- **Oscillation Window**: 500ms history for A↔B↔A detection
- **Stability Check**: Require 150ms dwell time before new scroll

### Fallback Nudge System
- **Step Size**: 24px incremental scroll when similarity insufficient
- **SIM_OK Threshold**: 0.72 minimum for nudge eligibility  
- **JITTER_HIGH Gate**: 0.35 jitter threshold blocks nudging
- **Cooldown Windows**:
  - `USER_FREEZE`: 3s after manual scroll intervention
  - `LOWSIM_FREEZE`: 2s after sustained low similarity

### Programmatic Scroll Gates
- **beginProgrammaticScroll()**: 250ms TTL for batch scroll operations
- **__tpCanProgrammaticScroll()**: Checks user activity, jitter state, anchor visibility
- **Throttle Logic**: Max 8 commits/sec to prevent scroll spam

### Tuning Cookbook
- **Lags on fast readers**: Decrease `HYSTERESIS` to 32px, raise `SIM_PROBE` to 0.65
- **Jitters on noisy mics**: Raise `JITTER_HIGH` to 0.45, slow EMA to 0.90, widen Tier 0 to `[0.15, 0.55]`
- **Ping-pongs**: Increase `IN_BAND_EPS` to 18px, extend oscillation freeze to 750ms
- **Stalls frequently**: Lower `SIM_GO` to 0.78, check deadman at 18 holds, reduce stale timeout to 2.0s
- **Over-eager jumps**: Raise all thresholds by 0.05, tighten Tier 3 to `[0.08, 0.62]`, increase dwell time to 200ms

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
| `?calm=1` | `tp_calm` | Disables nudges, gentler UX |
| - | `tp_hud_verbose` | Full HUD diagnostic output |
| - | `tp_log_mute` | Silence noisy log tags |
| - | `tp_log_sample` | Sample rate for high-frequency logs |
| - | `tp_disable_autoplay_guard` | Skip Chrome autoplay detection |
| - | `tp_force_stun_servers` | Override RTC server config |
| - | `tp_ime_resize_guard` | Mobile keyboard resize protection |

## HUD Usage & Debugging Recipes

### Enable Comprehensive Logging
```javascript
// Dev mode + verbose HUD
localStorage.setItem('tp_dev_mode', '1');
localStorage.setItem('tp_hud_verbose', '1');
// Filter noisy logs  
localStorage.setItem('tp_log_mute', 'catchup:|anchorIO');
localStorage.setItem('tp_log_sample', '8');
// Advanced filtering
localStorage.setItem('tp_quiet_tags', 'scroll:micro,match:interim');
localStorage.setItem('tp_focus_tags', 'activation,jitter,oscillation');
```

### Key Streams to Monitor
- `catchup:eligibility` - Decision logic: sim, cov, stale, anchorVisible
- `catchup:target` - Frontier idx & targetY movement (~2-3Hz expected)
- `scroll:attempt/progress/stalled` - Scroll execution status
- `reader:locked/unlocked` - Why scrolling is paused
- `rogue:scrollTop` - Warns about unauthorized scroll writes
- `watchdog:recenter` - Last-resort recenter triggers
- `match:candidate` vs `match:commit` - Ranking vs final decisions
- `jitter:spike` - When jitter threshold exceeded
- `oscillation:detected` - A↔B↔A pattern caught
- `nudge:fallback` - When similarity insufficient for activation

### Quick Sanity Checks
1. **Speech Recognition**: Say known line → expect `match:activate` with reason `conf` or `sim+cov`
2. **Probe Behavior**: During speech, `__tpHoldStreak` should oscillate; climbing to 24 repeatedly = over-probing
3. **Scroll Stability**: Frequent `scroll:oscillation-freeze` = need wider sticky band or more hysteresis
4. **Jitter Health**: `window.__tpJitterMeter` should stay < 0.35; spikes indicate mic issues
5. **Coverage Quality**: Watch `match:candidate` logs for `cov` values; consistent < 0.3 suggests tokenization issues

### Diagnostic Commands
```javascript
// Runtime inspection
window.__tpGetMatchState()     // Current similarity, coverage, jitter
window.__tpGetScrollState()    // Position, target, locks, freezes
window.__tpGetProbeState()     // Current tier, band, hold streak
window.__tpDumpAnchorState()   // Visible lines, IO entries
window.__tpTestTokenizer('your phrase here')  // Debug tokenization

// Emergency controls
window.__tpForceActivate(lineIdx)  // Override guards
window.__tpResetJitter()           // Clear jitter history
window.__tpClearFreezes()          // Unblock all freeze states
```

### Troubleshooting Matrix
| Symptom | Probable Cause | Knob to Turn |
|---------|----------------|--------------|
| Lags behind speech | Low thresholds | Decrease `HYSTERESIS`, raise `SIM_PROBE` |
| Jittery on noise | Mic sensitivity | Raise `JITTER_HIGH`, slower EMA |
| Ping-pong scrolling | Narrow bands | Increase `IN_BAND_EPS`, oscillation freeze |
| Frequent stalls | High activation bar | Lower `SIM_GO`, check deadman logic |
| Over-eager jumps | Low thresholds | Raise activation thresholds, tighten bands |
| No speech events | Autoplay blocked | Click anywhere, check `getUserMedia` perms |
| Camera black/frozen | Device conflicts | Check `NotReadableError`, try device cycling |
| Display bridge timeout | Network/CORS | Enable dev mode, check handshake logs |

## Common Gotchas

- **Scroll Conflicts**: Never write `scrollTop` directly - always use `scroll-helpers.js` functions
- **Module Loading**: Use dynamic imports for optional dependencies (see `adapters/obs.js` CDN loading)  
- **HUD Isolation**: Debug HUD must be position:fixed and not affect main layout
- **Speech Sync**: Line matching depends on exact DOM structure - be careful with text normalization changes
- **Virtual Lines**: The matching system now operates on virtual lines (merged short segments) - check index mapping when debugging highlighting issues