import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import allStores from './stores.js';
import { classify, fetchHtml, fetchPage, pageText, httpReason, launchOptions } from './check.js';
import { verifyCart } from './verify.js';
import { decidePush } from './policy.js';
import { notify } from './notify.js';
import { renderStatusMd, replaceStatus } from './readme.js';

const stores = allStores.filter((s) => !s.disabled);

const STATUS_FILE = new URL('../docs/status.json', import.meta.url);
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const BLOCK_AFTER = 48;
// skip pushes for scalper/marketplace prices (UVP ~800-900 €)
const MAX_PRICE = Number(process.env.MAX_PRICE || 1000);
const pageOnly = process.env.NOTIFY_PAGE_ONLY === '1'; // also push (low) when only the page says in stock
const unverified = process.env.NOTIFY_UNVERIFIED !== '0'; // push (high) when the cart check is blocked/unclear

if (args.includes('--test-notify')) {
  await notify({ title: '🎮 Test', message: 'PS5 Pro Tracker: Testnachricht', priority: 'default' });
  process.exit(0);
}

let prev = { stores: [], history: [] };
try { prev = JSON.parse(await readFile(STATUS_FILE, 'utf8')); } catch { /* first run */ }
const old = Object.fromEntries((prev.stores || []).map((s) => [s.id, s]));

async function checkStore(browser, s) {
  try {
    // fast path: server-rendered HTML; full render when the shop challenges plain requests or the HTML gives no stock signal
    let via = 'html', html = '', http = null, title = '', r = { status: 'unknown' };
    if (!s.render) {
      ({ html, http, title } = await fetchHtml(browser, s.url).catch((e) => ({ html: '', http: null, title: e.message.split('\n')[0] })));
      r = classify(html, s);
      if (r.status === 'unknown') console.log(`[${s.id}] html fetch: http=${http} ${r.reason} "${title.slice(0, 60)}"`);
    }
    // a challenge/429 means back off this round, not hit the shop a second time with a full render
    const pushedBack = r.reason === 'blocked' || [403, 429].includes(http);
    if (r.status === 'unknown' && !pushedBack) {
      via = 'browser';
      ({ html, http, title } = await fetchPage(browser, s.url, (h) => classify(h, s).status !== 'unknown'));
      r = classify(html, s);
    }
    const hr = httpReason(http);
    if (r.status === 'unknown' && hr) r.reason = hr;
    r.capped = r.status === 'in_stock' && r.price > MAX_PRICE; // marketplace price: no cart check, no push, no state change
    Object.assign(r, { http, via, title: title.slice(0, 50) });
    if (r.reason === 'no_signal') {
      // diagnose: text around availability words, to tune markers
      const t = pageText(html);
      const hits = [...t.matchAll(/.{0,60}(verfügbar|lieferbar|vorrätig|warenkorb|ausverkauft).{0,60}/g)].slice(0, 8);
      console.log(`[${s.id}] no_signal:\n  ${hits.map((m) => m[0]).join('\n  ') || t.slice(0, 300)}`);
    }
    return r;
  } catch (e) {
    console.error(`${s.id}: ${e.message.split('\n')[0]}`);
    return { status: 'unknown', price: null, reason: 'error' };
  }
}

const browser = await chromium.launch(launchOptions());

const results = new Array(stores.length);
let next = 0;
const worker = async () => {
  while (next < stores.length) {
    const i = next++;
    results[i] = await checkStore(browser, stores[i]);
  }
};
await Promise.all(Array.from({ length: 5 }, worker)); // all shops at once: one check takes ~3 s
const now = new Date().toISOString();
// cart check for in-stock verify stores: in parallel, outside the worker pool. Re-verified at most every RECHECK_CART
// seconds while the page stays in stock (one add-to-cart per round would look like a bot); in between the last result carries over.
const RECHECK_CART = 60 * 1000;
await Promise.all(stores.map(async (s, i) => {
  const r = results[i], o = old[s.id] || {};
  if (r.status !== 'in_stock' || !s.verify || r.capped) return;
  if (o.cart && o.cartCheckedAt && Date.parse(now) - Date.parse(o.cartCheckedAt) < RECHECK_CART) return;
  r.cart = await verifyCart(browser, s);
  console.log(`[${s.id}] cart=${r.cart.result} ${r.cart.detail}`);
}));
await browser.close();

// blocked and unknown both mean "unverified": no history row or commit for flapping between them
const bucket = (c) => (c === 'blocked' || c === 'unknown' ? 'unverified' : c);
const history = [...(prev.history || [])];
const out = [];
const pushes = [];

stores.forEach((s, i) => {
  const r = results[i];
  const o = old[s.id] || {};
  const streak = r.status === 'unknown' ? (o.unknownStreak || 0) + 1 : 0;
  const known = r.status === 'unknown' || r.capped ? o.known || null : r.status;
  // cart result: fresh from this round, else carried over while the known status stays in stock (throttled or blocked round)
  const carry = !r.cart && known === 'in_stock' && !r.capped;
  const cart = r.cart?.result ?? (carry ? o.cart ?? null : null);
  const cartDetail = r.cart?.detail ?? (carry ? o.cartDetail ?? null : null);
  if (!r.cart && cart) r.cart = { result: cart, detail: cartDetail }; // decidePush sees the effective cart state
  const entry = {
    id: s.id, name: s.name, url: s.url, priority: s.priority,
    status: r.status, reason: r.reason, via: r.via ?? null, capped: !!r.capped,
    price: r.status === 'unknown' ? o.price ?? null : r.price, // a blocked check keeps the last price (no commit churn)
    lastInStockAt: r.status === 'in_stock' ? now : o.lastInStockAt || null,
    note: s.note || '', unknownStreak: streak, known,
    cart, cartDetail, cartCheckedAt: r.cart && !carry ? now : carry ? o.cartCheckedAt ?? null : null,
    verify: !!s.verify, lastCartOkAt: r.cart && !carry && cart === 'ok' ? now : o.lastCartOkAt || null,
    // streak starts: one push per streak and kind, retried until delivered (policy.js)
    inStockSince: known === 'in_stock' ? (o.known === 'in_stock' && o.inStockSince) || now : null,
    cartOkSince: cart === 'ok' ? (o.cart === 'ok' && o.cartOkSince) || now : null,
    pushedAt: o.pushedAt || {},
  };
  out.push(entry);
  // history follows the last KNOWN status: a blocked/failed check is noise, not a stock change
  const from = o.known ?? known, cartFrom = o.cart ?? null;
  if (known && (from !== known || bucket(cartFrom) !== bucket(entry.cart))) {
    history.unshift({ at: now, id: s.id, name: s.name, from, to: known, price: r.price, cartFrom, cart: entry.cart });
  }
  const p = decidePush(s, r, o, now, { pageOnly, unverified });
  if (p) pushes.push({ ...p, entry });
  if (streak === BLOCK_AFTER) {
    pushes.push({
      title: `Checker blockiert bei ${s.name}`,
      message: `${BLOCK_AFTER} Läufe in Folge unbekannt. Marker oder Blockade prüfen.`,
      url: s.url, priority: 'low',
    });
  }
});

// pushes first: pushedAt is stamped only for delivered pushes, so a failed push is retried next minute instead of being lost
if (!dry) {
  for (const p of pushes) {
    try {
      await notify(p);
      if (p.entry) p.entry.pushedAt = { ...p.entry.pushedAt, [p.kind]: now };
    } catch (e) { console.error('notify failed:', e.message); }
  }
}
const disabled = allStores.filter((s) => s.disabled).map(({ id, name, url }) => ({ id, name, url }));
const status = { updatedAt: now, stores: out, disabled, history: history.slice(0, 200) };

console.table(out.map(({ id, status, price, reason }, i) => ({ id, status, price, reason, http: results[i].http, via: results[i].via, title: results[i].title })));
// checks run every 20 s: commit on a real change, else at most every 2 min (keeps "Zuletzt geprüft" fresh, history smaller)
const sig = (list) => JSON.stringify((list || []).map((s) => [s.id, s.known, s.price, bucket(s.cart)])); // known: blocked checks don't force a commit
const changed = pushes.length > 0 || sig(out) !== sig(prev.stores);
const stale = !prev.updatedAt || Date.parse(now) - Date.parse(prev.updatedAt) >= 110 * 1000; // <2 min: checks drift by ±1 s
if (dry) {
  console.log(`${pushes.length} push(es) would be sent`);
} else if (!changed && !stale) {
  console.log('no change, status file left as is');
} else {
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
  await writeFile(STATUS_FILE, JSON.stringify(status, null, 2) + '\n');
  const README = new URL('../README.md', import.meta.url);
  await writeFile(README, replaceStatus(await readFile(README, 'utf8'), renderStatusMd(status)));
}
