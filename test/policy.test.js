import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePush } from '../src/policy.js';

const plain = { name: 'Shop', url: 'https://shop' };
const mm = { name: 'MediaMarkt', url: 'https://mm', verify: true };
const now = '2026-11-07T10:00:00Z';
const ago = (min) => new Date(Date.parse(now) - min * 60000).toISOString();
const inStock = (cart, extra = {}) => ({ status: 'in_stock', price: 899.99, ...(cart && { cart: { result: cart, detail: '' } }), ...extra });

test('store without verify: urgent on known transition, capped price never pushes', () => {
  assert.equal(decidePush(plain, inStock(), { known: 'out_of_stock' }, now).priority, 'urgent');
  assert.equal(decidePush(plain, inStock(), { known: 'in_stock' }, now), null);
  assert.equal(decidePush(plain, inStock(null, { price: 1400, capped: true }), {}, now), null);
  assert.equal(decidePush(plain, { status: 'out_of_stock', price: null }, {}, now), null);
});

test('verify store: cart ok -> urgent on entering ok, then 10 min cooldown', () => {
  const p = decidePush(mm, inStock('ok'), { known: 'in_stock', cart: 'fail' }, now);
  assert.equal(p.priority, 'urgent');
  assert.equal(p.kind, 'cart_ok');
  assert.match(p.title, /WIRKLICH bestellbar bei MediaMarkt/);
  assert.match(p.message, /für 899.99 €/);
  assert.equal(p.url, 'https://mm');
  assert.equal(decidePush(mm, inStock('ok'), { known: 'in_stock', cart: 'ok' }, now), null);
  assert.equal(decidePush(mm, inStock('ok'), { cart: 'blocked', pushedAt: { cart_ok: ago(5) } }, now), null);
  assert.equal(decidePush(mm, inStock('ok'), { cart: 'blocked', pushedAt: { cart_ok: ago(11) } }, now).priority, 'urgent');
  assert.equal(decidePush(mm, inStock('ok', { price: 1400, capped: true }), {}, now), null);
});

test('verify store: cart fail -> no push unless NOTIFY_PAGE_ONLY', () => {
  assert.equal(decidePush(mm, inStock('fail'), { known: 'out_of_stock' }, now), null);
  const p = decidePush(mm, inStock('fail'), { known: 'out_of_stock' }, now, { pageOnly: true });
  assert.equal(p.priority, 'low');
  assert.equal(decidePush(mm, inStock('fail'), { known: 'in_stock' }, now, { pageOnly: true }), null);
  assert.equal(decidePush(mm, inStock('fail'), { pushedAt: { page_only: ago(10) } }, now, { pageOnly: true }), null);
});

test('verify store: blocked/unknown -> high on known transition, 30 min cooldown', () => {
  const b = decidePush(mm, inStock('blocked'), { known: 'out_of_stock' }, now);
  assert.equal(b.priority, 'high');
  assert.match(b.message, /blockiert/);
  assert.match(decidePush(mm, inStock('unknown'), {}, now).message, /nicht möglich/);
  assert.equal(decidePush(mm, inStock('unknown'), { known: 'in_stock' }, now), null);
  assert.equal(decidePush(mm, inStock('blocked'), { pushedAt: { unverified: ago(20) } }, now), null);
  assert.equal(decidePush(mm, inStock('blocked'), { pushedAt: { unverified: ago(31) } }, now).priority, 'high');
});
