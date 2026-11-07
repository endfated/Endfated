import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePush } from '../src/policy.js';

const plain = { name: 'Shop', url: 'https://shop' };
const mm = { name: 'MediaMarkt', url: 'https://mm', verify: true };
const now = '2026-11-07T10:00:00Z';
const ago = (min) => new Date(Date.parse(now) - min * 60000).toISOString();
const inStock = (cart, extra = {}) => ({ status: 'in_stock', price: 899.99, ...(cart && { cart: { result: cart, detail: '' } }), ...extra });
// previous entry: in a known-in_stock streak since `min` minutes, cart streak likewise
const streak = (min, cart) => ({ known: 'in_stock', inStockSince: ago(min), cart, cartOkSince: cart === 'ok' ? ago(min) : null });

test('store without verify: urgent once per in_stock streak, capped price never pushes', () => {
  assert.equal(decidePush(plain, inStock(), { known: 'out_of_stock' }, now).priority, 'urgent');
  assert.equal(decidePush(plain, inStock(), {}, now).kind, 'page');
  // streak continues and the push was delivered -> nothing; unknown runs in between keep the streak (known stays in_stock)
  assert.equal(decidePush(plain, inStock(), { ...streak(5), pushedAt: { page: ago(5) } }, now), null);
  // push failed last minute (no pushedAt) -> retried
  assert.equal(decidePush(plain, inStock(), streak(1), now).priority, 'urgent');
  // new streak after out_of_stock -> push again (no cooldown for plain stores)
  assert.equal(decidePush(plain, inStock(), { known: 'out_of_stock', pushedAt: { page: ago(2) } }, now).priority, 'urgent');
  assert.equal(decidePush(plain, inStock(null, { price: 1400, capped: true }), {}, now), null);
  assert.equal(decidePush(plain, { status: 'out_of_stock', price: null }, {}, now), null);
});

test('verify store: cart ok -> urgent once per ok streak, retried until delivered, 10 min cooldown', () => {
  const p = decidePush(mm, inStock('ok'), streak(30, 'fail'), now);
  assert.equal(p.priority, 'urgent');
  assert.equal(p.kind, 'cart_ok');
  assert.match(p.title, /WIRKLICH bestellbar bei MediaMarkt/);
  assert.match(p.message, /für 899.99 €/);
  assert.equal(p.url, 'https://mm');
  assert.equal(decidePush(mm, inStock('ok'), { ...streak(3, 'ok'), pushedAt: { cart_ok: ago(3) } }, now), null); // delivered
  assert.equal(decidePush(mm, inStock('ok'), { ...streak(3, 'ok'), pushedAt: { cart_ok: ago(60) } }, now).priority, 'urgent'); // not yet for this streak
  assert.equal(decidePush(mm, inStock('ok'), { ...streak(30, 'blocked'), pushedAt: { cart_ok: ago(5) } }, now), null); // cooldown
  assert.equal(decidePush(mm, inStock('ok'), { ...streak(30, 'blocked'), pushedAt: { cart_ok: ago(11) } }, now).priority, 'urgent');
  assert.equal(decidePush(mm, inStock('ok', { price: 1400, capped: true }), {}, now), null);
});

test('verify store: cart fail -> no push unless NOTIFY_PAGE_ONLY', () => {
  assert.equal(decidePush(mm, inStock('fail'), { known: 'out_of_stock' }, now), null);
  const p = decidePush(mm, inStock('fail'), { known: 'out_of_stock' }, now, { pageOnly: true });
  assert.equal(p.priority, 'low');
  assert.equal(decidePush(mm, inStock('fail'), { ...streak(5, 'fail'), pushedAt: { page_only: ago(5) } }, now, { pageOnly: true }), null);
  assert.equal(decidePush(mm, inStock('fail'), { known: 'out_of_stock', pushedAt: { page_only: ago(10) } }, now, { pageOnly: true }), null);
});

test('verify store: blocked/unknown -> high once per in_stock streak, 30 min cooldown', () => {
  const b = decidePush(mm, inStock('blocked'), { known: 'out_of_stock' }, now);
  assert.equal(b.priority, 'high');
  assert.match(b.message, /blockiert/);
  assert.match(decidePush(mm, inStock('unknown'), {}, now).message, /nicht möglich/);
  assert.equal(decidePush(mm, inStock('unknown'), { ...streak(5, 'blocked'), pushedAt: { unverified: ago(5) } }, now), null);
  assert.equal(decidePush(mm, inStock('blocked'), { known: 'out_of_stock', pushedAt: { unverified: ago(20) } }, now), null);
  assert.equal(decidePush(mm, inStock('blocked'), { known: 'out_of_stock', pushedAt: { unverified: ago(31) } }, now).priority, 'high');
  assert.equal(decidePush(mm, inStock('blocked'), { known: 'out_of_stock' }, now, { unverified: false }), null);
});
