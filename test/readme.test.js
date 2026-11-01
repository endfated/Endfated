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
