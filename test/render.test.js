import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GlobalFonts, loadImage } from '@napi-rs/canvas';
import { renderCategory, renderClassCard, renderTierList } from '../src/render.js';

const noImg = { getImage: async () => null };
const w = (i, tier, type = 'ASSAULT_RIFLE', name = `GUN ${i}`) =>
  ({ id: `g${i}`, name, type, tier, rank: i + 1, image: `https://x/${i}` });
const isPng = (buf) => Buffer.isBuffer(buf) && buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
const height = async (buf) => (await loadImage(buf)).height;

test('font with French glyphs is registered', () => {
  assert.ok(GlobalFonts.has('Rajdhani'));
});

test('renderTierList returns a PNG', async () => {
  const list = [w(0, 'META'), w(1, 'META'), w(2, 'A'), w(3, 'C', 'PISTOL', 'FSS CARBON EDGE 1095 TRÈS LONG NOM'), w(4, 'C')];
  assert.ok(isPng(await renderTierList(list, 'mw4', noImg)));
});

test('renderTierList grows with weapon count', async () => {
  const small = await renderTierList([0, 1, 2].map((i) => w(i, 'A')), 'mw4', noImg);
  const big = await renderTierList(Array.from({ length: 30 }, (_, i) => w(i, 'A')), 'mw4', noImg);
  assert.ok(await height(big) > await height(small));
});

test('renderTierList survives image failure', async () => {
  const getImage = async (url) => { if (url.endsWith('/1')) throw new Error('404'); return null; };
  assert.ok(isPng(await renderTierList([w(0, 'META'), w(1, 'A')], 'mw4', { getImage })));
});

test('renderCategory returns a PNG that grows with weapons', async () => {
  const nine = await renderCategory('SNIPER_RIFLE', Array.from({ length: 9 }, (_, i) => w(i, 'B', 'SNIPER_RIFLE')), 'mw4', noImg);
  const two = await renderCategory('SNIPER_RIFLE', [w(0, 'META', 'SNIPER_RIFLE'), w(1, 'A', 'SNIPER_RIFLE')], 'mw4', noImg);
  assert.ok(isPng(nine) && isPng(two));
  assert.ok(await height(nine) > await height(two));
});

test('renderClassCard returns a PNG, with or without a build', async () => {
  const att = (slot, name) => ({ slot, name, attachmentId: name });
  const five = { playstyle: 'LONG_RANGE', muzzle: att('muzzle', 'FSS IS300'), barrel: att('barrel', 'B'), stock: att('stock', 'S'),
    laser: att('laser', 'L'), ammunition: att('ammunition', '5.56 NATO OVERPRESSURED') };
  assert.ok(isPng(await renderClassCard(w(0, 'META'), five, 'mw4', noImg)));
  assert.ok(isPng(await renderClassCard(w(0, 'META'), { ...five, apex: att('apex', 'M4 Hurricane') }, 'dmzPvp', noImg)));
  assert.ok(isPng(await renderClassCard(w(0, 'D'), undefined, 'mw4', noImg)));
});
