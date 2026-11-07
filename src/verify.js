import { newContext, BLOCK } from './check.js';

// Detect only: add to cart in a throwaway context, read the cart page. No login, no checkout, no captcha solving.
// Markers are lowercase substrings; per-store overrides: consent, addToCart, cartFail, cartEmpty, cartExpect, checkoutCta, cartUrl.
const ADD_FAIL = ['konnte nicht hinzugefügt', 'nicht mehr verfügbar']; // add-to-cart error on the product page (only if it appeared after the click)
const EMPTY = ['warenkorb ist leer', 'keine artikel']; // click did not register -> unknown, never fail
const ITEM_FAIL = ['nicht mehr verfügbar', 'nicht lieferbar', 'ausverkauft', 'derzeit nicht verfügbar', 'leider nicht verfügbar']; // near the line item only
const PRODUCT = ['playstation®5 pro', 'playstation 5 pro', 'playstation5 pro', 'ps5 pro'];
const CTA = ['zur kasse', 'jetzt bestellen', 'zum bezahlen', 'weiter zur kasse'];
const CONSENT = '#pwa-consent-layer-accept-all-button';

const list = (v, d) => [].concat(v ?? d).map((m) => String(m).toLowerCase());
const hit = (t, markers) => markers.find((m) => t.includes(m));
const clip = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 200);
const around = (t, m) => { const i = t.indexOf(m); return clip(t.slice(Math.max(0, i - 80), i + m.length + 100)); };
const shown = (loc, timeout) => loc.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
const settle = (page, ms) => page.waitForLoadState('networkidle', { timeout: ms }).catch(() => {});
const bodyText = async (page) => (await page.evaluate(() => document.body?.innerText || '')).toLowerCase();

async function flow(page, store, pause) {
  await page.goto(store.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const consent = page.locator(store.consent || CONSENT).first();
  if (await shown(consent, 3 * pause)) await consent.click().catch(() => {});
  await settle(page, 3 * pause); // let the page hydrate before reading it
  const pdp = await bodyText(page);
  const block = hit(pdp, BLOCK);
  if (block) return { result: 'blocked', detail: around(pdp, block) };
  // the live page says "no delivery": the cached InStock was stale
  const oos = hit(pdp, list(store.outOfStock, []));
  if (oos) return { result: 'fail', detail: `Seite: ${around(pdp, oos)}` };

  const btns = [...[].concat(store.addToCart ?? []).map((sel) => page.locator(sel)), page.getByRole('button', { name: /in den warenkorb/i })];
  let btn = null;
  for (const [i, l] of btns.entries()) {
    const cand = l.filter({ visible: true }).first(); // buy box comes before the accessory carousels
    if (await shown(cand, i === btns.length - 1 ? 5 * pause : 2 * pause)) { btn = cand; break; }
  }
  if (!btn) return { result: 'unknown', detail: 'kein Warenkorb-Button' };
  await btn.click({ timeout: 10000 });
  await page.waitForTimeout(2 * pause);

  const link = page.getByRole('link', { name: /zum warenkorb/i }).or(page.getByRole('button', { name: /zum warenkorb/i })).filter({ visible: true }).first();
  if (await shown(link, 3 * pause)) {
    await link.click({ timeout: 10000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  } else {
    const after = await bodyText(page);
    const err = list(store.cartFail, ADD_FAIL).find((m) => after.includes(m) && !pdp.includes(m));
    if (err) return { result: 'fail', detail: `Seite: ${around(after, err)}` };
    if (!store.cartUrl) return { result: 'unknown', detail: 'kein Weg zum Warenkorb' };
    await page.goto(store.cartUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  }
  await page.waitForTimeout(2 * pause);
  await settle(page, 7 * pause);

  const t = await bodyText(page);
  const b = hit(t, BLOCK);
  if (b) return { result: 'blocked', detail: around(t, b) };
  const empty = hit(t, list(store.cartEmpty, EMPTY));
  if (empty) return { result: 'unknown', detail: `Warenkorb leer: ${around(t, empty)}` };
  const item = hit(t, list(store.cartExpect, PRODUCT));
  if (!item) return { result: 'unknown', detail: clip(`${await page.title()} | ${t.slice(0, 150)}`) };
  const i = t.indexOf(item);
  const near = t.slice(Math.max(0, i - 300), i + 300); // the line item, not pickup/express/footer text elsewhere
  const f = hit(near, list(store.cartFail, ITEM_FAIL));
  if (f) return { result: 'fail', detail: around(near, f) };
  if (hit(t, list(store.checkoutCta, CTA))) return { result: 'ok', detail: around(t, item) };
  return { result: 'unknown', detail: clip(`kein Kassen-Button | ${around(t, item)}`) };
}

export async function verifyCart(browser, store, { timeout = 60000, pause = 1000 } = {}) {
  let ctx, timer, expired = false;
  const expire = new Promise((_, rej) => { timer = setTimeout(() => { expired = true; rej(new Error(`Timeout nach ${timeout} ms`)); }, timeout); });
  try {
    return await Promise.race([(async () => {
      ctx = await newContext(browser);
      if (expired) return null; // finally already ran: close here
      const page = await ctx.newPage();
      page.setDefaultTimeout(15000);
      return flow(page, store, pause);
    })().finally(() => expired && ctx?.close().catch(() => {})), expire]);
  } catch (e) {
    return { result: 'unknown', detail: clip(String(e?.message || e).split('\n')[0]) };
  } finally {
    clearTimeout(timer);
    await ctx?.close().catch(() => {});
  }
}
