# Visual Bot Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bot's text embeds with drawn pictures: a tier list picture, a per-category picture, and a class card picture, with shared in-place navigation.

**Architecture:** New `src/render.js` draws PNG buffers with `@napi-rs/canvas` from the data `src/wzstats.js` already produces (`rankWeapons`, `attachments`). `src/index.js` sends those buffers as attachments and builds the components (category buttons, class dropdowns); category buttons edit the same message.

**Tech Stack:** Node ≥ 20.6 ESM, discord.js v14, `@napi-rs/canvas`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-08-visual-messages-design.md`

## Global Constraints

- Install must stay plain `npm install` on Windows: only new dependency is `@napi-rs/canvas` (prebuilt binaries). No Chromium, no native compilation.
- Bundled font: `assets/Rajdhani-Bold.ttf` (OFL, from `https://github.com/google/fonts/raw/main/ofl/rajdhani/Rajdhani-Bold.ttf`) plus its `assets/OFL.txt`; registered with `GlobalFonts.registerFromPath` under family `Rajdhani`. Must render é, ê, "·", "#", "'".
- Tier colours: META `#ff3b5c`, A `#ff9f1a`, B `#ffd23f`, C `#3ec46d`, D `#5b8def`; background dark (`#1e1f22` / tiles `#2b2d31`), as in the mockups.
- Discord limits: ≤ 10 attachments/message, ≤ 25 options/dropdown, ≤ 5 component rows, ≤ 5 buttons/row.
- User-facing text stays French. Data, cache, modes and the 30-min watcher's text embeds are unchanged.
- Navigation is shared: anyone can click; no ownership check.

## Review Focus

1. A gun image that fails to load (404, network) → that tile draws a placeholder; the picture still renders. (Task 1 test)
2. Long names (`FSS CARBON EDGE 1095`, `5.56 NATO OVERPRESSURED`) → shrunk or truncated to fit their tile, never overflowing into neighbours. (Task 1/2 tests: render does not throw; manual look in Task 4)
3. A tier with many weapons (A has 12 today) → tiles wrap onto extra lines and the picture grows taller. (Task 1 test: 30-weapon tier gives taller image than 3-weapon tier)
4. A category button clicked while wzstats is down → the shared message is **not** overwritten by an error; the clicker gets a private (ephemeral) error. (Task 3 test via harness)
5. Components from messages posted by older versions (`class:<mode>:<weaponId>` buttons, `class:<mode>:menu<i>` dropdowns) → still post the class card. (Task 3 harness)

---

### Task 1: Renderer foundation + tier list picture

**Files:**
- Create: `src/render.js`, `assets/Rajdhani-Bold.ttf`, `assets/OFL.txt`, `test/render.test.js`
- Modify: `package.json` (add `@napi-rs/canvas`), `src/index.js` (import `TIER_COLORS` from render.js instead of defining it)

**Interfaces:**
- Consumes: ranked weapon objects from `rankWeapons` (`{ id, name, type, tier, rank, image }`), `CATEGORIES`, `MODES` from `src/wzstats.js`.
- Produces:
  - `export const TIER_COLORS` (same numbers as today) and `export const TIER_ORDER = ['META','A','B','C','D']`
  - `export async function renderTierList(weapons, mode, { getImage = gunImage } = {}) → Promise<Buffer>` (PNG)
  - `export async function gunImage(url) → Promise<Image|null>`: fetches and decodes once, caches in a module `Map` by URL, returns `null` on any failure (and does not cache the failure).
  - `getImage` option exists so tests inject images without network.

- [ ] **Step 1:** `npm install @napi-rs/canvas`; download the font + OFL into `assets/`.
- [ ] **Step 2: Write failing tests** in `test/render.test.js`:
  - `renderTierList returns a PNG`: fixture of 5 weapons across META/A/C, `getImage: async () => null` → result is a Buffer starting with bytes `89 50 4E 47`.
  - `renderTierList grows with weapon count`: decode heights with `loadImage` from `@napi-rs/canvas`; a tier of 30 weapons yields a taller image than a tier of 3.
  - `renderTierList survives image failure`: `getImage` that throws for one URL and returns null for others → still returns a PNG (renderer must catch per image).
  - `font supports French`: `GlobalFonts.has('Rajdhani')` is true after importing render.js.
- [ ] **Step 3:** Run `npm test` → the new tests FAIL (module missing).
- [ ] **Step 4:** Implement in `src/render.js`. Layout per the spec's mockup A: one row per tier present (in `TIER_ORDER`), coloured label column on the left with the tier text, tiles (gun picture contained, name below, shrink font to fit tile width, then truncate with "…") wrapping onto extra lines; fixed canvas width (~1200 px), height computed from rows. Placeholder for null image: a dim rounded rect.
- [ ] **Step 5:** Run `npm test` → all PASS.
- [ ] **Step 6:** Commit `feat: tier list picture renderer`.

### Task 2: Category picture + class card picture

**Files:**
- Modify: `src/render.js`, `test/render.test.js`

**Interfaces:**
- Consumes: Task 1 helpers; `attachments(build)` from wzstats.js.
- Produces:
  - `export async function renderCategory(type, weapons, mode, { getImage } = {}) → Promise<Buffer>`: `weapons` already filtered to `type`, ranked.
  - `export async function renderClassCard(weapon, build, mode, { getImage } = {}) → Promise<Buffer>`: `build` may be `undefined`.
  - `export const SLOT_LABELS` (moved from index.js, unchanged values; render may use shortened forms like `Poignée arr.` when the label doesn't fit).

- [ ] **Step 1: Write failing tests:**
  - `renderCategory returns a PNG` for 9 weapons; height for 9 > height for 2.
  - `renderClassCard returns a PNG` for a build with 5 attachments and for one with an `apex` + 5.
  - `renderClassCard without a build` (`build` undefined) returns a PNG (draws "Aucune classe publiée").
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Category (mockup B of the tier list screen): title = French category name, one row per weapon: big rank number, gun picture (~340×100), name, tier badge in tier colour. Class card (mockup B of the class screen): name big top-left, tier badge top-right, info line `#<rank> <CATEGORY IN CAPS> · <playstyle with _ → space> · <MODE IN CAPS>`, gun picture large centred, attachments as tiles (≤ 5 per row, wrap) with small slot label + bold name, top border in tier colour.
- [ ] **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: category and class card pictures`.

### Task 3: Wire pictures and navigation into the bot

**Files:**
- Modify: `src/index.js`
- Test: harness `scratchpad/harness.mjs` (outside repo: stubs `Client.prototype.login`, captures the `interactionCreate` handler, feeds fake interactions on live data), plus `node --check`.

**Interfaces:**
- Consumes: `renderTierList`, `renderCategory`, `renderClassCard`, `SLOT_LABELS`, `TIER_COLORS`.
- Produces (customIds):
  - `view:<mode>:<TYPE|ALL>` category / "Tout" buttons.
  - `class:<mode>:menu<i>` dropdowns (value = weapon id) and legacy `class:<mode>:<weaponId>` buttons: both post a class card.
  - `function tierView(weapons, mode, type|null) → Promise<{ files, components, embeds: [] }>`: the single builder used by `/tierlist` and by `view:` clicks.

- [ ] **Step 1:** `tierView`: global → `renderTierList` + dropdowns of 25 weapons (as today) + category buttons; category → `renderCategory` + one dropdown + category buttons. Category buttons: one per category that has weapons in this mode, in `CATEGORIES` order, short labels `{ ASSAULT_RIFLE:'AR', SMG:'SMG', SHOTGUN:'Pompe', LMG:'LMG', MARKSMAN_RIFLE:'Tactique', SNIPER_RIFLE:'Sniper', PISTOL:'Pistolet', LAUNCHER:'Lanceur', MELEE:'Mêlée' }`, plus `Tout`; active one `ButtonStyle.Primary`, others `Secondary`. Rows: buttons first (≤ 2 rows of 5), then dropdowns; total ≤ 5 rows. File name `tierlist.png`.
- [ ] **Step 2:** `/tierlist` → `editReply(await tierView(...))`. `view:` click → `deferUpdate()` then `editReply({ ...view, attachments: [] })` so the old picture is replaced. On error during a `view:` click → `followUp({ content, ephemeral: true })`, never edit the shared message.
- [ ] **Step 3:** `showClass` → `renderClassCard(weapon, build, mode)` sent as `classe.png` (no embed). `/meta` → one class card per META weapon, ≤ 10 files per message (`editReply` then `followUp`). Remove `classEmbed` and the old per-category buttons code.
- [ ] **Step 4:** Harness run on live data, expect: `/tierlist` = 1 message with 1 file + 2 button rows + 2 dropdowns; `view:mw4:SNIPER_RIFLE` updates with 1 file + 1 dropdown; `view:mw4:ALL` back to global; dropdown pick and legacy `class:mw4:krait-p68-mw4` button each post 1 file; `/classe arme:m4` 1 file; `/meta` 7 files; a `view:` click with `fetchStore` forced to throw → ephemeral followUp, no editReply. Save the PNGs from the harness to the scratchpad.
- [ ] **Step 5:** `npm test` + `node --check src/index.js` pass. Commit `feat: send pictures and in-place category navigation`.

### Task 4: Look check, README, finish

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Open the PNGs saved by the harness and compare against the approved mockups (tier list rows, category rows, class card tiles); fix spacing/overflow issues in `render.js`, re-run tests.
- [ ] **Step 2:** README: describe the new look (pictures, category buttons, shared navigation) and that `npm install` now also installs `@napi-rs/canvas`.
- [ ] **Step 3:** Reviewer subagent on the whole diff; fix findings; `npm test`; commit and push (new files were added → ask the user before pushing, per their git rules).
