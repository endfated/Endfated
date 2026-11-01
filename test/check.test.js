import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, httpReason } from '../src/check.js';

const store = { inStock: ['in den warenkorb'], outOfStock: ['nicht vorrätig'] };
const pad = '<p>' + 'x '.repeat(200) + '</p>';
const ld = (o) => `<html><head><script type="application/ld+json">${JSON.stringify(o)}</script></head><body>${pad}</body></html>`;

test('JSON-LD InStock + price', () => {
  const r = classify(ld({ '@type': 'Product', offers: { '@type': 'Offer', availability: 'https://schema.org/InStock', price: '759.99' } }), store);
  assert.deepEqual(r, { status: 'in_stock', price: 759.99, reason: 'jsonld' });
});

test('JSON-LD OutOfStock', () => {
  const r = classify(ld({ '@graph': [{ '@type': 'Product', offers: [{ availability: 'http://schema.org/OutOfStock', price: 700 }] }] }), store);
  assert.equal(r.status, 'out_of_stock');
});

test('JSON-LD PreOrder counts as in_stock', () => {
  const r = classify(ld({ offers: { availability: 'https://schema.org/PreOrder' } }), store);
  assert.equal(r.status, 'in_stock');
});

test('marker: outOfStock wins over inStock', () => {
  const html = `<html><body>${pad}<button>In den Warenkorb</button><p>Nicht vorrätig</p></body></html>`;
  assert.equal(classify(html, store).status, 'out_of_stock');
});

test('marker: inStock only', () => {
  const html = `<html><body>${pad}<button>In den Warenkorb</button></body></html>`;
  assert.equal(classify(html, store).status, 'in_stock');
});

test('captcha -> unknown', () => {
  const html = `<html><body>${pad}<h1>Please solve this CAPTCHA</h1><button>In den Warenkorb</button></body></html>`;
  assert.equal(classify(html, store).reason, 'blocked');
});

test('very short html -> unknown', () => {
  assert.equal(classify('<html></html>', store).status, 'unknown');
});

const buyOnly = { ...store, missingBuyMeansOut: true, expectText: 'PlayStation®5 Pro' };

test('missingBuyMeansOut: product page without buy button -> out_of_stock', () => {
  const html = `<html><body>${pad}<h1>PlayStation®5 Pro</h1><a>Warenkorb 0</a></body></html>`;
  assert.equal(classify(html, buyOnly).status, 'out_of_stock');
  assert.equal(classify(html, store).status, 'unknown');
});

test('missingBuyMeansOut: unexpected page stays unknown (streak alarm still works)', () => {
  const html = `<html><body>${pad}<h1>Seite nicht gefunden</h1></body></html>`;
  assert.equal(classify(html, buyOnly).reason, 'no_signal');
});

test('missingBuyMeansOut: block page and JSON-LD take precedence', () => {
  const blocked = `<html><body>${pad}<h1>PlayStation®5 Pro</h1>captcha</body></html>`;
  assert.equal(classify(blocked, buyOnly).reason, 'blocked');
  const r = classify(ld({ offers: { availability: 'https://schema.org/InStock' } }), buyOnly);
  assert.equal(r.status, 'in_stock');
});

test('httpReason mapping', () => {
  assert.equal(httpReason(403), 'blocked');
  assert.equal(httpReason(429), 'blocked');
  assert.equal(httpReason(404), 'not_found');
  assert.equal(httpReason(503), 'error');
  assert.equal(httpReason(200), null);
});
