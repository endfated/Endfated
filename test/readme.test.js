import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStatusMd, replaceStatus } from '../src/readme.js';

const status = {
  updatedAt: '2026-11-01T15:00:00Z',
  stores: [
    { name: 'MediaMarkt', url: 'https://mm', priority: 2, status: 'out_of_stock', price: 899.99 },
    { name: 'PlayStation Direct', url: 'https://ps', priority: 1, status: 'in_stock', price: 899.99, lastInStockAt: '2026-11-01T15:00:00Z' },
    { name: 'expert', url: 'https://ex', priority: 4, status: 'unknown', reason: 'blocked', price: null },
  ],
  disabled: [{ name: 'Amazon.de', url: 'https://amz' }],
  history: [{ at: '2026-11-01T15:00:00Z', name: 'PlayStation Direct', from: 'out_of_stock', to: 'in_stock' }],
};

test('renders table sorted by priority with status labels', () => {
  const md = renderStatusMd(status);
  assert.ok(md.indexOf('PlayStation Direct') < md.indexOf('MediaMarkt'));
  assert.match(md, /🟢 \*\*Verfügbar\*\*/);
  assert.match(md, /🔴 Ausverkauft/);
  assert.match(md, /Blockiert \(Bot-Schutz\)/);
  assert.match(md, /Nicht überwacht.*\[Amazon\.de\]\(https:\/\/amz\)/);
  assert.match(md, /schnell sein/);
});

test('replaceStatus only touches the marked block', () => {
  const readme = 'A\n<!-- STATUS:START -->\nold\n<!-- STATUS:END -->\nB';
  assert.equal(replaceStatus(readme, 'new'), 'A\n<!-- STATUS:START -->\nnew\n<!-- STATUS:END -->\nB');
  assert.equal(replaceStatus('no markers', 'new'), 'no markers');
});

test('cart labels, banner only for real availability, cart column and history', () => {
  const s = (name, extra) => ({ name, url: 'https://x', priority: 1, status: 'in_stock', price: 899.99, verify: true, ...extra });
  const md = renderStatusMd({
    updatedAt: '2026-11-01T15:00:00Z',
    stores: [s('A', { cart: 'ok', lastCartOkAt: '2026-11-01T15:00:00Z' }), s('B', { cart: 'fail' }), s('C', { cart: 'blocked' }), s('D', { price: 1399, capped: true })],
    history: [
      { at: '2026-11-01T15:00:00Z', name: 'B', from: 'out_of_stock', to: 'in_stock', cart: 'fail' },
      { at: '2026-11-01T15:01:00Z', name: 'A', from: 'in_stock', to: 'in_stock', cartFrom: 'fail', cart: 'ok' },
      { at: '2026-11-01T15:02:00Z', name: 'D', from: 'in_stock', to: 'in_stock', cartFrom: 'ok', cart: null },
    ],
  });
  assert.match(md, /D\]\(https:\/\/x\) \| 🟠 Verfügbar \(Marketplace-Preis\)/);
  assert.match(md, /D · Warenkorb: ok → –/);
  assert.match(md, /🟢 \*\*Bestellbar\*\* \(Warenkorb OK\)/);
  assert.match(md, /🟡 Seite: verfügbar, Warenkorb: nein/);
  assert.match(md, /🟢 \*\*Verfügbar\*\* \(ungeprüft\)/);
  assert.match(md, /schnell sein/);
  assert.match(md, /B 🔴 Ausverkauft → 🟢 \*\*Verfügbar\*\* · Warenkorb: nein/);
  assert.match(md, /A · Warenkorb: nein → ok/);
  assert.match(md, /<br>🛒 01\.11\.26, 16:00/);
  assert.match(md, /<br>🛒 noch nie/);
  assert.match(md, /🛒 = zuletzt wirklich bestellbar/);
  const phantom = renderStatusMd({ updatedAt: '2026-11-01T15:00:00Z', stores: [s('B', { cart: 'fail' }), s('C', { cart: 'unknown' }), s('D', { price: 1399, capped: true })] });
  assert.doesNotMatch(phantom, /schnell sein/);
});
