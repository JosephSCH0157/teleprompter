---
build: anvil-1.7.8
commit: main
date: 2025-12-20
---

# ANVIL Manifest

**Entry points**
- App shell: `teleprompter_pro.html`
- Main bundle: `dist/index.js` (from `src/index.ts`)
- Styles: `teleprompter_pro.css`
- Display shell: `display.html` (mirror-only; no TS bundle)
- Recorder bridge (compat): `recorders.js` (from TS build:compat)
- ASR hook bundle: `dist/index-hooks/asr.js`
- Forge login: `login.html` + `dist/forge/login.js`
- Forge account: `account.html` + `dist/forge/account.js`
- Forge config injector: `forge-config.js`

**Authoritative root layout (source of truth)**
- This section is authoritative. Update here first and mirror README to match.
- Source + build: `src/` is the main TypeScript source; `dist/` is built output.
- Runtime / transitional modules at root: `asr/`, `speech/`, `hud/`, `settings/`, `controllers/`, `hotkeys/`, `wiring/`, `adapters/`, `boot/`, `legacy/`, `vendor/`.
- Shared types (migration anchor): **types.ts** (`src/state/types.ts`) contains shared TypeScript types exported for use across legacy and new TS modules during the migration.
- App entrypoints + static assets: HTML (`teleprompter_pro.html`, `display.html`, `index.html`), CSS (`teleprompter_pro.css`), plus `assets/` and `favicon2.png`.
- Tooling / scripts: `tools/`, `scripts/`, `.husky/`, plus helper scripts (`dev-start.ps1`, `dev-stop.ps1`, `ps_static_server.ps1`, `start_server.bat`).
- Tests / docs: `tests/`, `fixtures/`, `docs/`, plus `README.md`, `CHANGELOG.md`, `MANIFEST.md`.
- Project config + generated listings: `package.json`, `tsconfig.json`, ESLint configs, `netlify.toml`, `.github/`, `.vscode/`, `.netlify/`, `node_modules/`, and generated trees (`filetree.txt`, `project_tree.txt`).

**Where new code goes**
- New features & logic -> `src/` (TypeScript only). If it is net-new or being actively evolved, it starts life here.
- Bridges / shims only -> root runtime folders (e.g. `asr/`, `speech/`, `hud/`) only when adapting legacy code to TS or wiring into `src/`. No greenfield logic outside `src/`.

**Migration legend**
- TS-native (target state): `src/`, `dist/`, `src/state/types.ts`
- Transitional (runtime-critical, migrating or wrapping legacy behavior): `asr/`, `speech/`, `hud/`, `settings/`, `controllers/`, `hotkeys/`, `wiring/`, `adapters/`, `boot/`
- Legacy / frozen (no new logic): `legacy/`, `vendor/`

**AI & API Usage Principles**
Purpose:
Podcaster's Forge uses AI selectively and transparently. AI exists to assist, not to obscure, automate without consent, or create hidden cost exposure for users.

Core principles:
1) No hidden AI usage
- AI is never invoked implicitly.
- Any action that uses an external API is clearly labeled before execution and clear about what is being sent and why.
- If an operation does not require AI, it must not use AI.

2) Bring Your Own API Key (BYOK)
- Forge supports BYOK. When BYOK is enabled:
  - Forge does not proxy, hide, or re-package provider usage.
  - API limits, billing, quotas, and exhaustion are controlled by the provider.
  - Forge does not block usage for credit reasons.
  - If the API refuses a request, the refusal comes from the provider, not Forge.
- Design intent: avoid artificial throttling, surprise limits, and hidden metering.

3) Forge-managed API (where applicable)
- Usage is explicitly marked.
- Scope is clearly defined.
- Behavior is deterministic and limited to the documented feature.
- Forge must not silently expand API usage beyond the documented scope.

4) API failure behavior
If an API request fails due to exhausted credits/quota, invalid key, provider outage, or permission/policy refusal, Forge will:
- Surface the provider's failure clearly (verbatim where possible).
- Explain what happened in plain language.
- Link to documentation for resolving the issue.
- Forge will not present failures as "you are out of credits" unless Forge itself is enforcing a limit (avoided by design where possible).

5) Help & documentation
Forge includes a dedicated help section that explains:
- Which tools use AI.
- Which actions invoke API calls.
- Where users can obtain API keys.
- How to enter and rotate keys.
- Where to find provider billing and usage dashboards.
For all billing or quota questions, users are directed to the API provider, not Forge.

6) Tool-level AI usage transparency
Each Forge tool must declare:
- Whether it uses AI.
- Which features use AI.
- Whether AI usage is optional.
- Whether BYOK is supported.

Example declarations:
- Anvil: AI optional; ASR may use AI depending on mode.
- Hammer: AI used for transcription, segmentation, optional content generation.
- Hearth: AI required for script generation.
- Quench: AI optional for metadata and thumbnails.
No tool may use AI without declaring it here.

7) Trust & ethics
Forge prioritizes user trust over monetization tricks, transparency over convenience, and explicit consent over automation.
Users should never feel tricked, surprised by billing, coerced into AI usage, or confused about where costs originate.
If a user must choose between a blocked request from an API provider or a silent restriction imposed by Forge, Forge chooses provider transparency.

Non-goals:
- Forge is not an AI credit marketplace.
- Forge does not resell AI usage in opaque bundles.
- Forge does not meter AI usage secretly.
- Forge does not optimize revenue by obscuring cost sources.

Status:
- This policy is active.
- Applies to all current and future Forge tools.
- Enforced at the MANIFEST and implementation level.

Implementation requirement (optional but useful):
Any AI/API-triggering UI control must show an "AI" badge and a one-line "will call provider X" disclosure. Provider name must be visible (OpenAI, Anthropic, etc.) and must match the configured key/provider.

**Pricing & Subscription Model**
Purpose:
Podcaster's Forge pricing is designed to be affordable for independent creators, sustainable for long-term development, transparent and non-manipulative, and aligned with real value delivered. Pricing must never rely on dark patterns, surprise billing, or artificial friction.

Core pricing principles:
1) Trust first
- No user should ever feel tricked, rushed, or gamed.
- Pricing is explicit, predictable, and clearly explained.
- Trial behavior is disclosed before billing begins.
- Email reminders are sent before any trial converts to paid.
- Design rule: if a user leaves because they understood the pricing, that is acceptable. If a user stays because they were confused, that is not.

2) Free trials
- Tools may offer a time-limited free trial (e.g., 15 days).
- Trials clearly explain what is included, what is not included, and when billing begins.
- Users are notified via email before trial expiration.
- Free trials exist for evaluation, not lock-in.

3) Modular tool pricing
- Forge tools are priced individually, allowing users to adopt only what they need.
- Current pricing targets (subject to adjustment prior to release):
  - Anvil: $15/month
  - Hammer: $15/month
  - Hearth: $15/month
  - Quench: $10/month
- Included at no additional cost: Calendar, Bar Stock, Tongs (storage and coordination layer).
- This modular approach avoids bloated all-or-nothing plans, respects different creator workflows, and allows Forge to grow without forcing upgrades.

4) Full Forge bundle
- When all tools are combined, the effective total is approximately $55/month for the complete Forge.
- Bundling exists for convenience, not coercion.
- Users are never penalized for choosing individual tools.
- Individual subscriptions remain first-class options.

5) Existing subscriber benefits
- Users subscribed to a Forge tool receive a new free trial for each newly released tool.
- The trial for a new tool begins only when the user activates it.
- No automatic opt-in to paid plans for newly released tools.
- Existing users are rewarded for trust and longevity, not punished for inertia.

6) No usage-based pricing
- Forge does not meter usage by minutes, edits, exports, AI credits, or artificial caps.
- Where AI usage exists, API behavior is governed by BYOK (preferred) or clearly documented Forge-managed limits.
- Forge pricing is based on tool access, not hidden consumption.

7) Annual plans
- Annual plans may be offered at a discount (e.g., about 2 months free).
- Annual billing exists to reward commitment and reduce monthly overhead for users.
- Annual plans are always optional.

Non-goals:
- Forge is not priced to compete feature-for-feature with incumbents.
- Forge does not chase enterprise pricing models.
- Forge does not optimize revenue via confusion or friction.
- Forge does not bundle AI costs invisibly into subscriptions.

Status:
- Pricing model is conceptually locked.
- Final dollar amounts may be adjusted prior to public launch.
- These principles are not subject to change.

Optional enforcement note:
Any pricing-related UI must pass a plain-English test: a first-time creator should be able to explain Forge pricing accurately after reading it once.

**Runtime modules (TS source of truth)**
- HUD: `src/hud/*` (loader/controller/toggle)
- Rendering + ingest: `src/render-script.ts`, `src/features/script-ingest.ts`
- Display sync: `src/features/display-sync.ts`
- Scroll brain/router: `src/scroll/*`
- Recorder registry/backends: `src/recording/*`
- Forge auth/profile: `src/forge/*`
- Easter eggs (TS): `src/ui/eggs.ts`

**Legacy kept for compatibility (quarantined)**
- Legacy HUD/debug and ASR stub: `legacy/debug-tools.legacy.js`, `legacy/debug-seed.legacy.js`, `legacy/asr-bridge-speech.legacy.js`
- Legacy eggs: `legacy/eggs.legacy.js`
- Archived pre-TS scroll/rehearsal helpers: `legacy/features/*.js`, `legacy/scroll/scroll-brain.js`
- Other JS stubs still shipped for back-compat: `obs.js`, `hotkey.js`, `bridge.js`, `events.js`, `help.js`, `ui-sanitize.js`, `asr-types.js`
- Generated logic helpers: `src/build-logic/*.js` (output of `npm run build:logic`)

**Generated modules**
- `src/build-logic/**` — compiled from `src/logic/**` via `npm run build:logic` (do not edit)

**Notes**
- `ui-sanitize.js` is intentionally commented out in `teleprompter_pro.html`.
- Display window no longer loads the main TS bundle; it hydrates via `tp_display` snapshots.
- Forge config is injected via `forge-config.js` (sets `window.__forgeSupabaseUrl/__forgeSupabaseAnonKey`).
- Dev/QA: HUD/diagnostics temporarily disabled (no `#hud-root`; HUD boot gated; hudLog is console-only) while HUD v2 is redesigned.
- Settings invariants: single overlay (`#settingsBody`), `mountSettings` rebuilds + wires once, `wireSettingsDynamic` guarded by `data-tpSettingsWired`, every card stores a `data-wired` flag, mic/cam selects use the helpers added in `src/ui/settings/wire.ts`, closing Settings is purely visual, and `npm run gate` (which rewrites `tools/ui_crawl_report.json`) must pass before landing.
