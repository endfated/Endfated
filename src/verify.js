import { newContext, BLOCK, findMarker } from './check.js';

// Detect only: add to cart in a throwaway context, read the cart page. No login, no checkout, no captcha solving.
// Markers are lowercase substrings; per-store overrides: consent, addToCart, addFail, cartFail, cartEmpty, cartExpect, checkoutCta, cartUrl.
const ADD_FAIL = ['konnte nicht hinzugefügt', 'nicht mehr verfügbar']; // add-to-cart error on the product page (only if it appeared after the click)
const EMPTY = ['warenkorb ist leer', 'keine artikel']; // click did not register -> unknown, never fail
const ITEM_FAIL = ['nicht mehr verfügbar', 'nicht lieferbar', 'ausverkauft', 'derzeit nicht verfügbar', 'leider nicht verfügbar']; // near the line item only
const PRODUCT = ['playstation®5 pro', 'playstation 5 pro', 'playstation5 pro', 'ps5 pro'];
const CTA = ['zur kasse', 'jetzt bestellen', 'zum bezahlen', 'weiter zur kasse'];
const CONSENT = '#pwa-consent-layer-accept-all-button';

const list = (v, d) => [].concat(v ?? d).map((m) => String(m).toLowerCase());
const clip = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 200);
const around = (t, m) => { const i = t.indexOf(m); return clip(t.slice(Math.max(0, i - 80), i + m.length + 100)); };
// first marker found -> { result, detail }, else null
const scan = (t, markers, result, prefix = '') => { const m = findMarker(t, markers); return m ? { result, detail: prefix + around(t, m) } : null; };
const visible = (loc) => loc.filter({ visible: true }).first();
const shown = (loc, timeout) => loc.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
const settle = (page, ms) => page.waitForLoadState('networkidle', { timeout: ms }).catch(() => {});
const until = async (fn, ms, step = 100) => { for (let t = 0; t < ms; t += step) { if (await fn()) return true; await new Promise((r) => setTimeout(r, step)); } return fn(); };
const bodyText = async (page) => (await page.evaluate(() => document.body?.innerText || '')).toLowerCase();
const appears = (page, markers, ms) => page.waitForFunction((ms) => {
  const t = (document.body?.innerText || '').toLowerCase();
  return ms.some((m) => t.includes(m));
}, markers, { timeout: ms }).catch(() => {});

async function flow(page, store, pause) {
  await page.goto(store.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const consent = page.locator(store.consent || CONSENT).first();
  await page.addLocatorHandler(consent, () => consent.click().catch(() => {})); // consent layer: dismissed whenever it shows up, even late
  await Promise.all([shown(consent, 3 * pause), settle(page, 3 * pause)]);
  const pdp = await bodyText(page);
  // live page says "no delivery": the cached InStock was stale
  const early = scan(pdp, BLOCK, 'blocked') || scan(pdp, list(store.outOfStock, []), 'fail', 'Seite: ');
  if (early) return early;

  const own = store.addToCart ? page.locator([].concat(store.addToCart).join(', ')) : null;
  const any = page.getByRole('button', { name: /in den warenkorb/i }); // buy box comes before the accessory carousels
  if (!(await shown(visible(own ? own.or(any) : any), 5 * pause))) return { result: 'unknown', detail: 'kein Warenkorb-Button' };
  const btn = visible(own && (await visible(own).count()) ? own : any); // store selector wins
  const links = page.getByRole('link', { name: /zum warenkorb/i }).or(page.getByRole('button', { name: /zum warenkorb/i }));
  const n0 = await links.count(); // header cart links exist before the click; only a NEW one is the success flyout
  await btn.click({ timeout: 10000 });
  if (await until(() => links.count().then((n) => n > n0), 4 * pause)) {
    await links.filter({ visible: true }).last().click({ timeout: 10000 }); // the new element: flyouts/modals are appended last
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  } else {
    await settle(page, 3 * pause); // let an in-flight add request finish before reading the cart
    // no success flyout: an add-to-cart error that appeared after the click?
    const err = scan(await bodyText(page), list(store.addFail, ADD_FAIL).filter((m) => !pdp.includes(m)), 'fail', 'Seite: ');
    if (err) return err;
    if (store.cartUrl) await page.goto(store.cartUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    else if (n0) await visible(links).click({ timeout: 10000 }); // existing header link as last resort
    else return { result: 'unknown', detail: 'kein Weg zum Warenkorb' };
  }
  const product = list(store.cartExpect, PRODUCT);
  const empty = list(store.cartEmpty, EMPTY);
  await appears(page, [...product, ...empty, ...BLOCK], 7 * pause); // the cart is a hydrated SPA
  await settle(page, 2 * pause);

  const t = await bodyText(page);
  const item = findMarker(t, product);
  const near = item ? t.slice(Math.max(0, t.indexOf(item) - 300), t.indexOf(item) + 300) : ''; // the line item, not pickup/express/footer text
  return scan(t, BLOCK, 'blocked')
    || scan(t, empty, 'unknown', 'Warenkorb leer: ')
    || (!item && { result: 'unknown', detail: clip(`${page.url().replace(/^https?:\/\/[^/]+/, '')} | ${around(t, findMarker(t, ['warenkorb', 'anmelden', 'login']) ?? t.slice(0, 1))}`) }) // where did we land, what does it say
    || scan(near, list(store.cartFail, ITEM_FAIL), 'fail')
    || (findMarker(t, list(store.checkoutCta, CTA)) ? { result: 'ok', detail: around(t, item) } : { result: 'unknown', detail: clip(`kein Kassen-Button | ${around(t, item)}`) });
}

export async function verifyCart(browser, store, { timeout = 60000, pause = 1000 } = {}) {
  let ctx, timer;
  try {
    ctx = await newContext(browser);
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    return await Promise.race([flow(page, store, pause),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`Timeout nach ${timeout} ms`)), timeout); })]);
  } catch (e) {
    return { result: 'unknown', detail: clip(String(e?.message || e).split('\n')[0]) };
  } finally {
    clearTimeout(timer);
    await ctx?.close().catch(() => {});
  }
}
