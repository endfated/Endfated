import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import allStores from './stores.js';
import { classify, fetchPage, pageText, httpReason, launchOptions } from './check.js';
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
    const { html, http, title } = await fetchPage(browser, s.url);
    const r = classify(html, s);
    const hr = httpReason(http);
    if (r.status === 'unknown' && hr) r.reason = hr;
    r.capped = r.status === 'in_stock' && r.price > MAX_PRICE; // marketplace price: no cart check, no push, no state change
    Object.assign(r, { http, title: title.slice(0, 50) });
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
await Promise.all(Array.from({ length: 3 }, worker));
// cart check for in-stock verify stores: in parallel, outside the worker pool
await Promise.all(stores.map(async (s, i) => {
  const r = results[i];
  if (r.status !== 'in_stock' || !s.verify || r.capped) return;
  r.cart = await verifyCart(browser, s);
  console.log(`[${s.id}] cart=${r.cart.result} ${r.cart.detail}`);
}));
await browser.close();

const now = new Date().toISOString();
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
  const cart = r.cart?.result ?? null;
  const entry = {
    id: s.id, name: s.name, url: s.url, priority: s.priority,
    status: r.status, reason: r.reason, price: r.price, capped: !!r.capped,
    lastInStockAt: r.status === 'in_stock' ? now : o.lastInStockAt || null,
    note: s.note || '', unknownStreak: streak, known,
    cart, cartDetail: r.cart?.detail ?? null, verify: !!s.verify, lastCartOkAt: cart === 'ok' ? now : o.lastCartOkAt || null,
    // streak starts: one push per streak and kind, retried until delivered (policy.js)
    inStockSince: known === 'in_stock' ? (o.known === 'in_stock' && o.inStockSince) || now : null,
    cartOkSince: cart === 'ok' ? (o.cart === 'ok' && o.cartOkSince) || now : null,
    pushedAt: o.pushedAt || {},
  };
  out.push(entry);
  const from = o.status ?? r.status, cartFrom = o.cart ?? null;
  if (from !== r.status || bucket(cartFrom) !== bucket(entry.cart)) {
    history.unshift({ at: now, id: s.id, name: s.name, from, to: r.status, price: r.price, cartFrom, cart: entry.cart });
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

console.table(out.map(({ id, status, price, reason }, i) => ({ id, status, price, reason, http: results[i].http, title: results[i].title })));
// checks run every minute: commit on a real change, else at most every 2 min (keeps "Zuletzt geprüft" fresh, history smaller)
const sig = (list) => JSON.stringify((list || []).map((s) => [s.id, s.status, s.price, s.reason, bucket(s.cart)]));
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
