import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { fetchHtml, launchOptions, classify } from '../src/check.js';

test('fetchHtml: server-rendered HTML, status and title without rendering', async () => {
  const ld = JSON.stringify({ '@type': 'Product', offers: { availability: 'https://schema.org/InStock', price: '899.99' } });
  const server = http.createServer((req, res) => {
    if (req.url === '/gone') return res.writeHead(404).end('nope');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(`<html><head><title>PS5 Pro | Shop</title><script type="application/ld+json">${ld}</script></head><body>${'x '.repeat(200)}</body></html>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(launchOptions());
  try {
    const page = await fetchHtml(browser, `${base}/p`);
    assert.equal(page.http, 200);
    assert.equal(page.title, 'PS5 Pro | Shop');
    assert.deepEqual(classify(page.html), { status: 'in_stock', price: 899.99, reason: 'jsonld' });
    assert.equal((await fetchHtml(browser, `${base}/gone`)).http, 404);
  } finally {
    await browser.close();
    server.close();
  }
});
