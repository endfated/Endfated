import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePush } from '../src/policy.js';

const plain = { name: 'Shop', url: 'https://shop' };
const mm = { name: 'MediaMarkt', url: 'https://mm', verify: true };
const now = '2026-11-07T10:00:00Z';
const ago = (min) => new Date(Date.parse(now) - min * 60000).toISOString();
const inStock = (cart, price = 899.99) => ({ status: 'in_stock', price, ...(cart && { cart: { result: cart, detail: '' } }) });

test('store without verify: urgent on known transition, price cap', () => {
  assert.equal(decidePush(plain, inStock(), { known: 'out_of_stock' }, now, 1000).priority, 'urgent');
  assert.equal(decidePush(plain, inStock(), { known: 'in_stock' }, now, 1000), null);
  assert.equal(decidePush(plain, inStock(null, 1400), {}, now, 1000), null);
  assert.equal(decidePush(plain, { status: 'out_of_stock', price: null }, {}, now, 1000), null);
});

test('verify store: cart ok -> urgent once, then cooldown', () => {
  const p = decidePush(mm, inStock('ok'), { known: 'in_stock', cartOk: false }, now, 1000);
  assert.equal(p.priority, 'urgent');
  assert.equal(p.kind, 'cart_ok');
  assert.match(p.title, /WIRKLICH bestellbar bei MediaMarkt/);
  assert.match(p.message, /für 899.99 €/);
  assert.equal(p.url, 'https://mm');
  assert.equal(decidePush(mm, inStock('ok'), { known: 'in_stock', cartOk: true }, now, 1000), null);
  assert.equal(decidePush(mm, inStock('ok'), { cartOk: false, pushedAt: { cart_ok: ago(5) } }, now, 1000), null);
  assert.equal(decidePush(mm, inStock('ok'), { cartOk: false, pushedAt: { cart_ok: ago(11) } }, now, 1000).priority, 'urgent');
  assert.equal(decidePush(mm, inStock('ok', 1400), {}, now, 1000), null);
});

test('verify store: cart fail -> no push unless NOTIFY_PAGE_ONLY', () => {
  assert.equal(decidePush(mm, inStock('fail'), { known: 'out_of_stock' }, now, 1000), null);
  const p = decidePush(mm, inStock('fail'), { known: 'out_of_stock' }, now, 1000, { pageOnly: true });
  assert.equal(p.priority, 'low');
  assert.equal(decidePush(mm, inStock('fail'), { known: 'in_stock' }, now, 1000, { pageOnly: true }), null);
  assert.equal(decidePush(mm, inStock('fail'), { pushedAt: { page_only: ago(10) } }, now, 1000, { pageOnly: true }), null);
});

test('verify store: blocked/unknown -> high on known transition, 30 min cooldown', () => {
  const b = decidePush(mm, inStock('blocked'), { known: 'out_of_stock' }, now, 1000);
  assert.equal(b.priority, 'high');
  assert.match(b.message, /blockiert/);
  assert.match(decidePush(mm, inStock('unknown'), {}, now, 1000).message, /nicht möglich/);
  assert.equal(decidePush(mm, inStock('unknown'), { known: 'in_stock' }, now, 1000), null);
  assert.equal(decidePush(mm, inStock('blocked'), { pushedAt: { unverified: ago(20) } }, now, 1000), null);
  assert.equal(decidePush(mm, inStock('blocked'), { pushedAt: { unverified: ago(31) } }, now, 1000).priority, 'high');
});
