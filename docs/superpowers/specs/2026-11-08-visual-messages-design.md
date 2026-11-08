# Visual bot messages: design

## Why

The bot works but its messages are "full of text, no images, bulky, and the buttons aren't user friendly" (user). The friend's original request included "afficher une image de la classe avec les accessoires". Goal: the bot's answers should look like a gaming tool, mostly pictures, with as little text and as few messages as possible.

## Goals

- `/tierlist` (no category): **one drawn picture** of the whole tier list, tiermaker style: one row per tier (META, A, B, C, D) with a coloured tier label on the left and every weapon in that tier shown as a tile (gun picture and name). Under the picture: one dropdown "Voir la classe d'une arme…" and a row of category buttons.
- `/tierlist categorie:X`: **one drawn picture** of that category, ranked 1, 2, 3… with a big gun picture per row, the weapon name and a coloured tier badge (mockup "B · One category at a time"). Under it: category buttons that **switch the same message** to another category (no new message), and the class dropdown.
- **Class card** (posted when a weapon is picked in a dropdown or via `/classe`): **one drawn picture**: weapon name big, tier badge, a line "#rank CATEGORY · PLAYSTYLE · MODE", the gun picture large in the middle, the attachments as tiles below (slot label small, attachment name bold), in the same style as the tier list.
- Fewer messages: navigating categories edits the existing message; nothing spams the channel.

## Non-goals

- No change to what data is shown or where it comes from (wzstats.gg scraping, 5-minute cache, 4 modes, ranking rules stay as they are).
- No change to the 30-minute tier list watcher's alert messages (they stay text embeds).
- No per-attachment images (wzstats has no reliable attachment pictures).
- No extra builds per weapon: the class card shows the main build only, as today.

## Anti-goals

- Anything your friend can't install with plain `npm install` on Windows (no Chromium download, no native compilation).
- Pictures that look different or broken depending on the PC's fonts.
- Text-heavy embeds coming back as the main view.

## Constraints

- discord.js v14, Node ≥ 20.6, ESM; the friend runs the bot themselves with `npm start`.
- Discord: max 10 attachments per message, 25 options per dropdown, 5 component rows, 5 buttons per row, interactions must be acknowledged within 3 s (deferring is fine).
- Gun images: `https://img.wzstats.gg/<id>[_version<n>]/public`, PNG 1366×409, already given by `rankWeapons` as `image`.
- 35 weapons today across 9 categories (max 9 per category).

## Approaches considered

1. **`@napi-rs/canvas`** (picked): draw the pictures with a 2D canvas API. One dependency with prebuilt binaries for Windows/macOS/Linux, fast, no browser. Cost: layout is hand-positioned code.
2. `satori` + `@resvg/resvg-js`: describe cards as HTML/CSS-like trees, render to SVG then PNG. Easier layout, but two dependencies and fiddlier image/font loading.
3. Puppeteer (headless Chromium screenshot): easiest layout, but ~150 MB download, slow start, most fragile on the friend's PC. Rejected.

The user asked me to pick; I picked 1 for being the lightest to install and run.

## Decided

- Rendering with `@napi-rs/canvas`; a free bold font (OFL, e.g. Rajdhani or Oswald) is bundled in the repo (`assets/`) and registered at startup, so pictures look the same everywhere.
- Colours: keep the current tier colours (META `#ff3b5c`, A `#ff9f1a`, B `#ffd23f`, C `#3ec46d`, D `#5b8def`) on a dark Discord-like background, as in the mockups.
- `/tierlist` global → picture + class dropdown(s) + category buttons. `/tierlist categorie:X` → category picture + category buttons + class dropdown. Clicking a category button **updates the same message** (picture and components) to that category. The dropdowns post the class card as a new public message (as today).
- Category buttons: one per category that has weapons (9 today: 2 rows of 5), short labels (AR, SMG, Pompe, LMG, Tactique, Sniper, Pistolet, Lanceur, Mêlée), the active one highlighted. Plus a "Tout" button to go back to the global picture (my call: needed to get back from a category). With max 5 rows: category buttons take 2 rows, class dropdown(s) the rest.
- Global view dropdowns: the weapons don't fit in one dropdown (35 > 25), so keep the current split into dropdowns of 25. Category view: a single dropdown with that category's weapons.
- `/classe` → the class card picture (one message).
- `/meta` → one message with the class card pictures of every META weapon (7 today, ≤ 10 attachments per message; more than 10 → follow-up message).
- **Shared navigation** (user): anyone in the channel can click the category buttons, and it edits the one shared message for everyone. No ownership check.
- Switching view replaces the whole view: picture, dropdown(s) and buttons. From the global view, picking a category swaps the 2 global dropdowns for that category's single dropdown; "Tout" restores the global picture and dropdowns. The old picture is replaced, not stacked (my call).
- Class card with no published build: the tile area shows "Aucune classe publiée" (my call). Info line: French category in caps, playstyle with underscores replaced, mode, e.g. "#4 FUSIL D'ASSAUT · VERSATILE · MULTIJOUEUR" (my call).
- The bundled font must support French accents (é, ê), "·", "#" and "'" (my call).
- Each picture is sent as a message attachment (PNG). Keep a minimal text/embed only if needed for Discord (e.g. a link to wzstats in the message is optional, builder's call).

## Left to the builder

- Exact sizes, spacing, font sizes and how the picture handles a tier with many weapons (wrap tiles onto extra lines) or long names (shrink or truncate).
- Fetching gun images: download once and cache them in memory (they rarely change); a failed image should draw a placeholder, not fail the whole picture.
- How the category-button customIds are encoded (must carry mode and category; old buttons/dropdowns from previously posted messages should keep working or fail gracefully).
- Whether the picture code lives in a new `src/render.js` (suggested) and how it is tested (at least: renders a PNG buffer for each picture type from fixture data without network; a manual look at the real output before shipping).
- Slot labels in French as today (`SLOT_LABELS`), shortened where needed to fit a tile.
- README update (new look, screenshots optional).
