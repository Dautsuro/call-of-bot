import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachments, diffSnapshots, parsePage, rankWeapons, snapshot } from '../src/wzstats.js';

const store = {
  wzStatsTierList: { mw4: { META: ['m4', 'ghost'], A: ['ak'], C: ['krait', 'gs50'] } },
  weapons: [
    { id: 'm4', name: 'M4', type: { id: 'ASSAULT_RIFLE' }, imageVersion: '1' },
    { id: 'ak', name: 'AK', type: { id: 'ASSAULT_RIFLE' }, imageVersion: '' },
    { id: 'krait', name: 'KRAIT P68', type: { id: 'PISTOL' }, imageVersion: '1' },
    { id: 'gs50', name: '.50 GS', type: { id: 'PISTOL' }, imageVersion: '1' },
  ],
};

test('parsePage reads the MW4 store from ng-state', () => {
  const html = `<html><script id="ng-state" type="application/json">${JSON.stringify({ 'store:weapons-and-tier-lists-mw4': store })}</script>`;
  assert.deepEqual(parsePage(html), store);
  assert.throws(() => parsePage('<html></html>'), /format/);
});

test('rankWeapons ranks within each category across tiers and skips unknown ids', () => {
  const r = rankWeapons(store, 'mw4');
  assert.deepEqual(r.map((w) => [w.name, w.tier, w.rank]), [
    ['M4', 'META', 1], ['AK', 'A', 2], ['KRAIT P68', 'C', 1], ['.50 GS', 'C', 2],
  ]);
  assert.equal(r[0].image, 'https://img.wzstats.gg/m4_version1/public');
  assert.equal(r[1].image, 'https://img.wzstats.gg/ak/public');
  assert.deepEqual(rankWeapons(store, 'dmzPve'), []);
});

test('attachments keeps only slots, in in-game order', () => {
  const build = {
    id: 'x', title: '', laser: { slot: 'laser', name: 'L' }, muzzle: { slot: 'muzzle', name: 'M' },
    apex: { slot: 'apex', name: 'A' }, weird: { slot: 'newSlot', name: 'N' }, cons: [],
  };
  assert.deepEqual(attachments(build).map((a) => a.name), ['A', 'M', 'L', 'N']);
});

test('diffSnapshots reports tier/rank moves, new and removed weapons, per mode', () => {
  const before = snapshot(store);
  assert.deepEqual(diffSnapshots(before, snapshot(store)), {});

  const next = structuredClone(store);
  next.wzStatsTierList.mw4 = { META: ['ak', 'm4'], C: ['krait'] }; // AK up to META #1, M4 down to #2, .50 GS gone
  next.wzStatsTierList.dmzPvp = { A: ['m4'] }; // new in another mode
  const d = diffSnapshots(before, snapshot(next));
  assert.deepEqual(d.mw4, [
    { name: 'M4', type: 'ASSAULT_RIFLE', before: { tier: 'META', rank: 1 }, after: { tier: 'META', rank: 2 } },
    { name: 'AK', type: 'ASSAULT_RIFLE', before: { tier: 'A', rank: 2 }, after: { tier: 'META', rank: 1 } },
    { name: '.50 GS', type: 'PISTOL', before: { tier: 'C', rank: 2 }, after: null },
  ]);
  assert.deepEqual(d.dmzPvp, [{ name: 'M4', type: 'ASSAULT_RIFLE', before: null, after: { tier: 'A', rank: 1 } }]);
  assert.deepEqual(Object.keys(d), ['mw4', 'dmzPvp']);
});
