import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachments, parsePage, rankWeapons } from '../src/wzstats.js';

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
