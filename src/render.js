// Draws the bot's pictures (tier list, category, class card) as PNG buffers.
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { attachments, CATEGORIES, MODES } from './wzstats.js';

GlobalFonts.registerFromPath(fileURLToPath(new URL('../assets/Rajdhani-Bold.ttf', import.meta.url)), 'Rajdhani');

export const TIER_COLORS = { META: 0xff3b5c, A: 0xff9f1a, B: 0xffd23f, C: 0x3ec46d, D: 0x5b8def };
export const TIER_ORDER = ['META', 'A', 'B', 'C', 'D'];
export const SLOT_LABELS = {
  apex: 'Apex', optic: 'Optique', muzzle: 'Bouche', barrel: 'Canon', underbarrel: 'Sous le canon', magazine: 'Chargeur',
  rearGrip: 'Poignée arrière', stock: 'Crosse', laser: 'Laser', ammunition: 'Munitions', fireMods: 'Mod de tir',
};
const BG = '#1e1f22', TILE = '#2b2d31', TEXT = '#ffffff', MUTED = '#949ba4';
const hex = (n) => `#${(n ?? 0x888888).toString(16).padStart(6, '0')}`;
const font = (size) => `${size}px Rajdhani`;

// Gun pictures rarely change: fetched once per URL; failures aren't cached so they're retried next time.
const images = new Map();
export function gunImage(url) {
  if (!images.has(url)) {
    images.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .then((b) => loadImage(Buffer.from(b)))
      .catch(() => { images.delete(url); return null; }));
  }
  return images.get(url);
}
const loadAll = (list, getImage) => Promise.all(list.map((w) => Promise.resolve().then(() => getImage(w.image)).catch(() => null)));

// Largest size ≤ max that fits maxW, down to min; then truncates with "…".
function fit(ctx, text, maxW, max, min = Math.round(max * 0.6)) {
  let size = max;
  for (; size > min; size -= 1) { ctx.font = font(size); if (ctx.measureText(text).width <= maxW) return { text, size }; }
  ctx.font = font(min);
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return { text: t === text ? t : `${t.trimEnd()}…`, size: min };
}
function text(ctx, str, x, y, maxW, max, color = TEXT, align = 'left') {
  const f = fit(ctx, str, maxW, max);
  ctx.font = font(f.size); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(f.text, x, y);
}
function box(ctx, x, y, w, h, color, r = 8) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
// Draws the picture scaled to fit inside the box, centred; a dim placeholder when there's no picture.
function gun(ctx, img, x, y, w, h) {
  if (!img) { box(ctx, x + w * 0.1, y + h * 0.35, w * 0.8, h * 0.3, '#3a3c42', 6); return; }
  const s = Math.min(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
}
function badge(ctx, tier, right, cy, size) {
  ctx.font = font(size);
  const w = ctx.measureText(tier).width + size;
  box(ctx, right - w, cy - size * 0.7, w, size * 1.4, hex(TIER_COLORS[tier]), 6);
  ctx.fillStyle = '#111214'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tier, right - w / 2, cy + 1);
}
const canvas = (w, h) => { const c = createCanvas(w, h); const ctx = c.getContext('2d'); ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h); return [c, ctx]; };

export async function renderTierList(weapons, mode, { getImage = gunImage } = {}) {
  const W = 1200, HEAD = 70, LABEL = 120, TW = 150, TH = 84, GAP = 8, PAD = 10;
  const cols = Math.floor((W - LABEL - PAD * 2 + GAP) / (TW + GAP));
  const imgs = new Map((await loadAll(weapons, getImage)).map((img, i) => [weapons[i].id, img]));
  const tiers = TIER_ORDER.map((t) => [t, weapons.filter((w) => w.tier === t)]).filter(([, l]) => l.length);
  const rowH = (n) => Math.ceil(n / cols) * (TH + GAP) - GAP + PAD * 2;
  const [c, ctx] = canvas(W, HEAD + tiers.reduce((h, [, l]) => h + rowH(l.length) + 4, 0));

  text(ctx, 'TIER LIST MW4', 24, HEAD / 2, 600, 40);
  text(ctx, (MODES[mode] ?? mode).toUpperCase(), W - 24, HEAD / 2, 400, 26, MUTED, 'right');
  let y = HEAD;
  for (const [tier, list] of tiers) {
    const h = rowH(list.length);
    ctx.fillStyle = hex(TIER_COLORS[tier]); ctx.fillRect(0, y, LABEL, h);
    text(ctx, tier, LABEL / 2, y + h / 2, LABEL - 16, 44, '#111214', 'center');
    list.forEach((w, i) => {
      const x = LABEL + PAD + (i % cols) * (TW + GAP), ty = y + PAD + Math.floor(i / cols) * (TH + GAP);
      box(ctx, x, ty, TW, TH, TILE, 6);
      gun(ctx, imgs.get(w.id), x + 6, ty + 4, TW - 12, 50);
      text(ctx, w.name, x + TW / 2, ty + TH - 14, TW - 10, 20, TEXT, 'center');
    });
    y += h + 4;
  }
  return c.encode('png');
}

export async function renderCategory(type, weapons, mode, { getImage = gunImage } = {}) {
  const W = 900, HEAD = 80, ROW = 116, GAP = 8;
  const imgs = await loadAll(weapons, getImage);
  const [c, ctx] = canvas(W, HEAD + weapons.length * (ROW + GAP) + 12);
  text(ctx, (CATEGORIES[type] ?? type).toUpperCase(), 24, HEAD / 2, 560, 46);
  text(ctx, (MODES[mode] ?? mode).toUpperCase(), W - 24, HEAD / 2, 300, 26, MUTED, 'right');
  weapons.forEach((w, i) => {
    const y = HEAD + i * (ROW + GAP);
    box(ctx, 12, y, W - 24, ROW, TILE);
    ctx.fillStyle = hex(TIER_COLORS[w.tier]); ctx.fillRect(12, y, 6, ROW);
    text(ctx, `${w.rank}`, 60, y + ROW / 2, 70, 56, TEXT, 'center');
    gun(ctx, imgs[i], 100, y + 8, 340, ROW - 16);
    text(ctx, w.name, 460, y + ROW / 2, W - 460 - 140, 40);
    badge(ctx, w.tier, W - 36, y + ROW / 2, 28);
  });
  return c.encode('png');
}

export async function renderClassCard(weapon, build, mode, { getImage = gunImage } = {}) {
  const W = 1100, PER = 5, GAP = 12, TH = 86;
  const parts = build ? attachments(build) : [];
  const tileRows = Math.max(1, Math.ceil(parts.length / PER));
  const [c, ctx] = canvas(W, 440 + tileRows * (TH + GAP) + 16);
  const grad = ctx.createLinearGradient(0, 0, W, c.height);
  grad.addColorStop(0, BG); grad.addColorStop(1, '#2b1a20');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, c.height);

  const color = hex(TIER_COLORS[weapon.tier]);
  text(ctx, weapon.name, 30, 52, W - 260, 62);
  badge(ctx, weapon.tier, W - 30, 52, 34);
  const info = [`#${weapon.rank} ${(CATEGORIES[weapon.type] ?? weapon.type).toUpperCase()}`,
    build?.playstyle?.replace(/_/g, ' '), (MODES[mode] ?? mode).toUpperCase()].filter(Boolean).join(' · ');
  text(ctx, info, 30, 104, W - 60, 26, MUTED);
  gun(ctx, await Promise.resolve().then(() => getImage(weapon.image)).catch(() => null), 40, 130, W - 80, 290);

  const top = 440, tw = (W - 60 - (PER - 1) * GAP) / PER;
  if (!parts.length) {
    box(ctx, 30, top, W - 60, TH, TILE, 6);
    text(ctx, 'Aucune classe publiée', W / 2, top + TH / 2, W - 100, 32, MUTED, 'center');
  }
  parts.forEach((a, i) => {
    const x = 30 + (i % PER) * (tw + GAP), y = top + Math.floor(i / PER) * (TH + GAP);
    box(ctx, x, y, tw, TH, TILE, 6);
    ctx.fillStyle = color; ctx.fillRect(x, y, tw, 4);
    text(ctx, (SLOT_LABELS[a.slot] ?? a.slot).toUpperCase(), x + 12, y + 28, tw - 24, 18, MUTED);
    text(ctx, a.name.toUpperCase(), x + 12, y + 58, tw - 24, 26);
  });
  return c.encode('png');
}
