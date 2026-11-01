import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import allStores from './stores.js';
import { classify, fetchPage, pageText, httpReason } from './check.js';
import { notify } from './notify.js';

const stores = allStores.filter((s) => !s.disabled);

const STATUS_FILE = new URL('../docs/status.json', import.meta.url);
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const BLOCK_AFTER = 48;
// skip pushes for scalper/marketplace prices (UVP ~800-900 €)
const MAX_PRICE = Number(process.env.MAX_PRICE || 1000);

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
    if (r.status === 'unknown' && httpReason(http)) r.reason = httpReason(http);
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

const launch = { headless: true };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY };
const browser = await chromium.launch(launch);

const results = new Array(stores.length);
let next = 0;
const worker = async () => {
  while (next < stores.length) {
    const i = next++;
    results[i] = await checkStore(browser, stores[i]);
  }
};
await Promise.all(Array.from({ length: 3 }, worker));
await browser.close();

const now = new Date().toISOString();
const history = [...(prev.history || [])];
const out = [];
const pushes = [];

stores.forEach((s, i) => {
  const r = results[i];
  const o = old[s.id] || {};
  const streak = r.status === 'unknown' ? (o.unknownStreak || 0) + 1 : 0;
  const entry = {
    id: s.id, name: s.name, url: s.url, priority: s.priority,
    status: r.status, reason: r.reason, price: r.price,
    lastInStockAt: r.status === 'in_stock' ? now : o.lastInStockAt || null,
    note: s.note || '', unknownStreak: streak,
    known: r.status === 'unknown' ? o.known || null : r.status,
  };
  out.push(entry);
  const from = o.status;
  if (from && from !== r.status) {
    history.unshift({ at: now, id: s.id, name: s.name, from, to: r.status, price: r.price });
  }
  // compare against last known status so unknown<->in_stock flapping doesn't re-push
  if (r.status === 'in_stock' && o.known !== 'in_stock' && !(r.price > MAX_PRICE)) {
    pushes.push({
      title: `🎮 PS5 Pro verfügbar bei ${s.name}!`,
      message: `Jetzt verfügbar${r.price != null ? ` für ${r.price} €` : ''}: ${s.name}`,
      url: s.url, priority: 'urgent',
    });
  }
  if (streak === BLOCK_AFTER) {
    pushes.push({
      title: `Checker blockiert bei ${s.name}`,
      message: `${BLOCK_AFTER} Läufe in Folge unbekannt. Marker oder Blockade prüfen.`,
      url: s.url, priority: 'low',
    });
  }
});

const disabled = allStores.filter((s) => s.disabled).map(({ id, name, url }) => ({ id, name, url }));
const status = { updatedAt: now, stores: out, disabled, history: history.slice(0, 200) };

console.table(out.map(({ id, status, price }, i) => ({ id, status, price, reason: results[i].reason, http: results[i].http, title: results[i].title })));
if (dry) {
  console.log(`${pushes.length} push(es) would be sent`);
} else {
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
  await writeFile(STATUS_FILE, JSON.stringify(status, null, 2) + '\n');
  for (const p of pushes) {
    try { await notify(p); } catch (e) { console.error('notify failed:', e.message); }
  }
}
