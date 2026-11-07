import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { verifyCart } from '../src/verify.js';
import { launchOptions } from '../src/check.js';

const page = (body) => `<!doctype html><html><head><title>Test</title></head><body>${body}</body></html>`;
const FLY = { noflyout: 'Hinzugefügt', toast: 'Artikel konnte nicht hinzugefügt werden' };
// PDP: consent layer, static "Abholung nicht verfügbar" (must not count as fail), main button opens flyout and
// renders unrelated "ausverkauft" text shortly after the click; accessory carousel button later in the DOM
const pdp = (cart) => page(`
  <div id="consent"><button id="pwa-consent-layer-accept-all-button" onclick="this.parentNode.remove()">Alle zulassen</button></div>
  <h1>Sony PlayStation®5 Pro 2 TB</h1><p>Lieferung nach Hause 09.11.2026 - 11.11.2026 + 0,– €</p>
  <p>899,99 € inkl. MwSt. versandkostenfrei</p><p>Abholung im Markt: nicht verfügbar</p>
  <button id="main" onclick="if(document.getElementById('consent'))return;document.getElementById('fly').hidden=false;setTimeout(()=>document.getElementById('late').textContent='Zubehör ausverkauft',150)">In den Warenkorb</button>
  <div id="fly" hidden>${FLY[cart] ?? `<a href="/cart/${cart}">Zum Warenkorb</a>`}</div><p id="late"></p>
  <section><h2>Zubehör</h2><button onclick="location.href='/cart/wrong'">In den Warenkorb</button></section>`);
const item = '<h1>Warenkorb</h1><p>Sony PlayStation®5 Pro 2 TB</p><p>899,99 €</p>';
const CART = {
  ok: page(`${item}<button>Zur Kasse</button>`),
  fail: page(`${item}<p>Dieser Artikel ist nicht lieferbar</p><button>Zur Kasse</button>`),
  pickup: page(`${item}<p>Abholung im Markt: nicht verfügbar</p><p>Express-Lieferung nicht verfügbar</p><button>Zur Kasse</button>`),
  nocta: page(`${item}<p>Bitte anmelden</p>`),
  wrong: page('<h1>Warenkorb</h1><p>Sony DualSense Controller für PlayStation 5</p><p>79,99 €</p><button>Zur Kasse</button>'),
  empty: page('<h1>Dein Warenkorb ist leer</h1>'),
  blocked: page('<h1>Access Denied</h1>'),
};
const PAGES = {
  nobuy: page('<h1>Sony PlayStation®5 Pro</h1><p>Leider keine Lieferung möglich</p>'),
  blocked: page('<h1>Access Denied</h1><button>In den Warenkorb</button>'),
};

let server, base, browser;
before(async () => {
  server = http.createServer((req, res) => {
    const [, kind, arg] = req.url.split('/');
    const html = kind === 'pdp' ? pdp(arg) : kind === 'cart' ? CART[arg] : PAGES[kind];
    res.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }).end(html || 'nope');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(launchOptions());
});
after(async () => { await browser?.close(); server?.close(); });

const run = (path, extra = {}) => verifyCart(browser, { url: `${base}${path}`, ...extra }, { timeout: 20000, pause: 200 });

for (const [cart, want] of [['ok', 'ok'], ['fail', 'fail'], ['pickup', 'ok'], ['nocta', 'unknown'], ['wrong', 'unknown'], ['empty', 'unknown'], ['blocked', 'blocked']]) {
  test(`cart ${cart} -> ${want}`, async () => {
    const r = await run(`/pdp/${cart}`);
    assert.equal(r.result, want, r.detail);
    assert.ok(r.detail.length <= 200);
  });
}

test('PDP blocked -> blocked before any click', async () => {
  assert.equal((await run('/blocked')).result, 'blocked');
});

test('PDP hydrated to "keine Lieferung" -> fail; without marker -> unknown', async () => {
  const r = await run('/nobuy', { outOfStock: ['leider keine lieferung möglich'] });
  assert.equal(r.result, 'fail');
  assert.match(r.detail, /^Seite: /);
  const u = await run('/nobuy', { addToCart: '#none' });
  assert.equal(u.result, 'unknown');
  assert.equal(u.detail, 'kein Warenkorb-Button');
});

test('add-to-cart error toast -> fail; unrelated new text is ignored', async () => {
  const r = await run('/pdp/toast', { cartUrl: `${base}/cart/ok` });
  assert.equal(r.result, 'fail');
  assert.match(r.detail, /^Seite: .*konnte nicht hinzugefügt/);
});

test('no flyout -> goto cartUrl', async () => {
  const r = await run('/pdp/noflyout', { addToCart: '#main', cartUrl: `${base}/cart/ok` });
  assert.equal(r.result, 'ok', r.detail);
});

test('no flyout, no cartUrl -> unknown', async () => {
  assert.equal((await run('/pdp/noflyout')).result, 'unknown');
});

test('overall timeout -> unknown', async () => {
  const r = await verifyCart(browser, { url: `${base}/pdp/ok` }, { timeout: 50, pause: 200 });
  assert.equal(r.result, 'unknown');
  assert.match(r.detail, /Timeout/);
});
