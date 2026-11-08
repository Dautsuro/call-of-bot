// Data source: the wzstats.gg MW4 meta page embeds its tier lists in Angular's ng-state JSON,
// and the per-weapon builds come from the same public API the page calls.
const PAGE = 'https://wzstats.gg/mw4/meta';
const API = 'https://app.wzstats.gg/wz2/weapons/builds/wzstats/with-attachments/weapon';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (call-of-bot)' };

export const MODES = { mw4: 'Multijoueur', mw4Resurgence: 'Résurgence', dmzPvp: 'DMZ PvP', dmzPve: 'DMZ PvE' };
export const CATEGORIES = {
  ASSAULT_RIFLE: "Fusil d'assaut", SMG: 'Mitraillette', SHOTGUN: 'Fusil à pompe', LMG: 'Mitrailleuse',
  MARKSMAN_RIFLE: 'Fusil tactique', SNIPER_RIFLE: 'Sniper', PISTOL: 'Pistolet', LAUNCHER: 'Lanceur', MELEE: 'Mêlée',
};
const SLOTS = ['apex', 'optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'rearGrip', 'stock', 'laser', 'ammunition', 'fireMods'];

export function parsePage(html) {
  const m = html.match(/<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/);
  const store = m && JSON.parse(m[1])['store:weapons-and-tier-lists-mw4'];
  if (!store?.wzStatsTierList?.mw4) throw new Error('wzstats.gg a changé de format (tier list introuvable)');
  return store;
}

// Flattens one tier list into ranked weapons: [{ id, name, type, tier, rank }], rank = position within its category.
export function rankWeapons(store, mode) {
  const byId = Object.fromEntries(store.weapons.map((w) => [w.id, w]));
  const counts = {};
  return Object.entries(store.wzStatsTierList[mode] ?? {}).flatMap(([tier, ids]) =>
    ids.filter((id) => byId[id]).map((id) => {
      const w = byId[id];
      const type = w.type.id;
      counts[type] = (counts[type] ?? 0) + 1;
      return { id, name: w.name, type, tier, rank: counts[type], image: imageUrl(w) };
    }));
}

const imageUrl = (w) => `https://img.wzstats.gg/${w.id}${w.imageVersion ? `_version${w.imageVersion}` : ''}/public`;

// Attachments of a build in in-game slot order: [{ slot, name }].
export function attachments(build) {
  return Object.values(build)
    .filter((v) => v && typeof v === 'object' && v.slot && v.name)
    .sort((a, b) => rankSlot(a.slot) - rankSlot(b.slot))
    .map(({ slot, name }) => ({ slot, name }));
}
const rankSlot = (s) => (SLOTS.includes(s) ? SLOTS.indexOf(s) : SLOTS.length);

async function get(url, as) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`wzstats.gg a répondu ${res.status}`);
  return res[as]();
}

export const fetchStore = async () => parsePage(await get(PAGE, 'text'));

export async function fetchBuilds(weaponId, mode) {
  const q = new URLSearchParams({ game: 'mw4', 'buildTypes[]': mode, addConversionKit: 'true', language: 'en', addNewBuilds: 'true' });
  return (await get(`${API}/${encodeURIComponent(weaponId)}/?${q}`, 'json')).builds ?? [];
}
