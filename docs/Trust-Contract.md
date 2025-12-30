# Trust Contract

This one-page contract aligns with `MANIFEST.md`, which is the canonical source for repository policy and product principles. Update `MANIFEST.md` first; this file mirrors the trust rules.

## AI & API Usage Principles
Purpose: Podcaster's Forge uses AI selectively and transparently. AI exists to assist, not to obscure, automate without consent, or create hidden cost exposure for users.

1) No hidden AI usage
- AI is never invoked implicitly.
- Any action that uses an external API is clearly labeled before execution and clear about what is being sent and why.
- If an operation does not require AI, it must not use AI.

2) Bring Your Own API Key (BYOK)
- Forge supports BYOK. When BYOK is enabled: Forge does not proxy, hide, or re-package provider usage; provider limits and billing apply; Forge does not block usage for credit reasons; API refusals come from the provider, not Forge.
- Design intent: avoid artificial throttling, surprise limits, and hidden metering.

3) Forge-managed API (where applicable)
- Usage is explicitly marked.
- Scope is clearly defined.
- Behavior is deterministic and limited to the documented feature.
- Forge must not silently expand API usage beyond the documented scope.

4) API failure behavior
If an API request fails due to exhausted credits/quota, invalid key, provider outage, or permission/policy refusal, Forge will surface the provider's failure clearly (verbatim where possible), explain in plain language, and link to documentation for resolution.

5) Help & documentation
Forge includes a dedicated help section that explains which tools use AI, which actions invoke API calls, where users can obtain API keys, how to enter and rotate keys, and where to find provider billing/usage dashboards. Billing and quota questions are directed to the provider, not Forge.

6) Tool-level AI usage transparency
Each Forge tool declares whether it uses AI, which features use AI, whether AI usage is optional, and whether BYOK is supported. No tool may use AI without declaring it here.

7) Trust & ethics
Forge prioritizes user trust over monetization tricks, transparency over convenience, and explicit consent over automation. Users should never feel tricked, surprised by billing, coerced into AI usage, or confused about where costs originate. If a user must choose between a blocked request from an API provider or a silent restriction imposed by Forge, Forge chooses provider transparency.

Implementation requirement:
Any AI/API-triggering UI control must show an "AI" badge and a one-line "will call provider X" disclosure. Provider name must be visible and must match the configured key/provider.

## Pricing & Subscription Model
Purpose: Forge pricing is affordable for independent creators, sustainable for long-term development, transparent and non-manipulative, and aligned with real value delivered. Pricing must never rely on dark patterns, surprise billing, or artificial friction.

1) Trust first
- Pricing is explicit, predictable, and clearly explained.
- Trial behavior is disclosed before billing begins, with email reminders before any trial converts to paid.
- Design rule: if a user leaves because they understood the pricing, that is acceptable. If a user stays because they were confused, that is not.

2) Free trials
- Tools may offer a time-limited free trial (e.g., 15 days).
- Trials clearly explain what is included, what is not included, and when billing begins.
- Free trials exist for evaluation, not lock-in.

3) Modular tool pricing
- Tools are priced individually so users adopt only what they need.
- Current pricing targets (subject to adjustment prior to release):
  - Anvil: $15/month
  - Hammer: $15/month
  - Hearth: $15/month
  - Quench: $10/month
- Included at no additional cost: Calendar, Bar Stock, Tongs (storage and coordination layer).

4) Full Forge bundle
- Combined total is approximately $55/month for the complete Forge.
- Bundling exists for convenience, not coercion.
- Users are never penalized for choosing individual tools.
- Individual subscriptions remain first-class options.

5) Existing subscriber benefits
- Subscribers receive a new free trial for each newly released tool.
- The trial for a new tool begins only when the user activates it.
- No automatic opt-in to paid plans for newly released tools.

6) No usage-based pricing
- Forge does not meter usage by minutes, edits, exports, AI credits, or artificial caps.
- Where AI usage exists, API behavior is governed by BYOK (preferred) or clearly documented Forge-managed limits.
- Pricing is based on tool access, not hidden consumption.

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
