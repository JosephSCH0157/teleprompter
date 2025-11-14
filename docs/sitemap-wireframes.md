# Anvil (Teleprompter) — Sitemap & Low‑Fi Wireframes

> Scope: present app (Anvil v1.7.x) + near‑term pages. Focused on current working features: mapped folder, editor → render, display window, Settings/Help overlays, HUD, media controls.

---

## Sitemap (Information Architecture)

### Mermaid Sitemap

```mermaid
flowchart TD
  A[Home / App Shell]
  A --> TP[Teleprompter (Main)]
  TP --> STG[Settings Overlay]
  STG --> STG_G[General]
  STG --> STG_M[Media]
  STG --> STG_R[Recording]
  STG --> STG_A[Advanced]
  TP --> HELP[Help / Shortcuts]
  TP --> DISP[Display Window (?display=1)]
  TP --> SCRIPTS[Scripts Sidebar]
  SCRIPTS --> MAP[Mapped Folder Picker]
  SCRIPTS --> UP[Upload (.txt/.docx)]
  SCRIPTS --> SAVE[Save / Save As / Download]
```

- **Landing / Marketing** _(future/optional)_
  - Hero (value prop, Try Anvil)
  - Features (Teleprompter, Display, ASR/Hybrid, Mapped Folder)
  - Pricing _(future)_
  - Docs / Changelog / Support

- **App / Teleprompter** (`teleprompter_pro.html`)
  - **Top chips bar** (Draft, Mic, Display, Speech, Scroll, CamRTC, Mode, Auto state)
  - **Left Sidebar**
    - Present Mode toggle
    - Picture‑in‑Picture
    - Catch Up
    - Pre‑roll, Match aggressiveness, Motion smoothness
    - Reset timer
    - Load sample / Normalize / Clear
    - **Scripts**
      - `#scriptSelectSidebar` (mapped folder select)
      - Folder… (choose + recheck)
      - “Mirror” checkbox (viewer)

    - **Speakers** (name, color, wrap → S1)

  - **Main Viewer**
    - Script viewport with **Anchor line**
    - HUD dock (bottom‑right)

  - **Overlays**
    - **Settings** (tabs: General, Media, Recording, Advanced)
    - **Help / Shortcuts** (tag guide, normalize tip)

  - **Secondary Windows**
    - **Display** (popup or `?display=1`) — minimal viewer + hydrate via BroadcastChannel

- **Docs** _(future)_
- **Account / Sign‑in** _(future)_
- **Support / Changelog** _(future)_

---

## Wireframes (ASCII, low‑fi)

### 1) Landing (future)

```
┌───────────────────────────────────────────────────────────────┐
│  ANVIL — Teleprompter for Creators                             │
│  [Try Anvil]  [Docs]  [Pricing]  [Changelog]                   │
│                                                               │
│  Hero: "Write once. Read smooth. Record smarter."              │
│  [Start in your Browser]                                       │
│                                                               │
│  ▸ Features: Teleprompter • Display Window • Hybrid Scroll     │
│             Mapped Folder • HUD • Shortcuts                    │
│                                                               │
│  Footer: © Creator’s Forge | Support | Terms                   │
└───────────────────────────────────────────────────────────────┘
```

### 2) App — Main Frame

```
┌────────────────────────────── Top Chips / Status ──────────────────────────────┐
│ Draft ▾ | Mic: unknown | Display: closed | Speech: idle | Scroll: idle | Mode ▾│
│ Auto: Paused | Settings | Help | HUD                                           │
└────────────────────────────────────────────────────────────────────────────────┘
┌────────────── Sidebar ──────────────┐  ┌──────────── Script Viewer ───────────┐
│ Present Mode [ ]                    │  │                                       │
│ Picture‑in‑Picture [ ]              │  │                ─────────               │
│ Catch Up                            │  │                Anchor ↑                │
│ Pre‑roll  [ 3 ]                     │  │               (scroll)                 │
│ Match     [ Normal ▾ ]              │  │                                       │
│ Motion    [ Balanced ▾ ]            │  │                                       │
│ Reset timer   00:00                 │  │                                       │
│ [Load sample] [Normalize] [Clear]   │  │                           [HUD dock]  │
│ Scripts  [Select ▾] (Folder… Recheck)│ │                                       │
│ Speakers ▸ Name/Color/Wrap → S1     │  │                                       │
└─────────────────────────────────────┘  └───────────────────────────────────────┘
```

**Notes**

- `#editor` sits off‑canvas or behind—render writes to `#script` as `.line` nodes.
- BroadcastChannel(`tp-doc`) mirrors `{name,text}` to Display.

### 3) Settings Overlay (Tabs)

```
┌──────────────── Settings (dialog) ────────────────┐
│ [General] [Media] [Recording] [Advanced]     (×) │
│                                                   │
│ General:                                          │
│  ▸ Scripts Folder: [Select ▾] [Folder…] [Recheck] │
│  ▸ Mirror [ ]  ▸ Size (%)  [ 28 ]                 │
│                                                   │
│ Media:                                            │
│  ▸ Camera: [ deviceId ▾ ]  [Start] [PiP]         │
│  ▸ Mic:    [ Request ] [Release]                  │
│                                                   │
│ Recording:                                        │
│  ▸ Start speech sync [disabled until mic]         │
│                                                   │
│ Advanced:                                         │
│  ▸ Dev flags, HUD prod, test hooks                │
└───────────────────────────────────────────────────┘
```

### 4) Help / Shortcuts Overlay

```
┌─────────────── Help / Shortcuts ───────────────┐
│  Keys: Arrow, Home/End, Esc, etc.              │
│  Tag Guide: [s1]…[/s1], [note]…[/note], color… │
│  [Normalize Script]                            │
│                                          (×)   │
└────────────────────────────────────────────────┘
```

### 5) Display Window

```
┌──────────────────── Display (minimal) ────────────────────┐
│  Script Viewer only, anchored, large type                 │
│  (hydrates via BroadcastChannel on open)                  │
└───────────────────────────────────────────────────────────┘
```

---

## Interaction & Tech Notes (current build)

- **Selectors:** Prefer `data-action` + tolerant legacy ids. Emergency delegator gated to dev/CI.
- **Overlays:** `toggleOverlay(name)` sets `body[data-smoke-open]`, freezes scroll, emits `tp:<name>:open/close`, runs `ensureSettingsTabsWiring()`.
- **Tabs:** role="tablist"/"tab"/"tabpanel"; ArrowLeft/Right/Home/End; aria‑selected/tabindex maintained.
- **Mapped Folder:** select → read (txt/md) or Mammoth(ArrayBuffer) for .docx → dispatch `tp:script-load {name,text}`.
- **Render:** `renderScript(text)` → `#script .line` + `tp:script:rendered`.
- **Display:** `?display=1` or `display.html`; sends `hello` → main replies with `{name,text}` snapshot.
- **Media (fallbacks):** request/stop mic; start/stop camera; PiP from preview.

---

## Success Criteria (checklist)

- [ ] Settings + Help always open via buttons **and** `__tpOpen()`.
- [ ] Tabs switch via click + keys; only 1 tabpanel visible.
- [ ] Selecting a script renders and broadcasts; Display hydrates.
- [ ] Upload .docx shows readable text (Mammoth) and renders.
- [ ] Present toggle sets `html.tp-present` + `data-smoke-present`.

---

## Next Wireframe Iteration (optional)

- Add **Docs** page layout (left nav, right content, code samples).
- Add **Pricing** card grid (free/dev vs pro tiers).
- Add **Account** (sign‑in/profile) placeholders for future.
