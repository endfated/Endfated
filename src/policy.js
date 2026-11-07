// minutes between two pushes of one kind for one store: the page flips in_stock/out_of_stock several times an hour
const COOLDOWN = { page: 0, cart_ok: 10, page_only: 30, unverified: 30 };
const TEXT = {
  page: (s, p) => ['urgent', `🎮 PS5 Pro verfügbar bei ${s.name}!`, `Jetzt verfügbar${p}: ${s.name}`],
  cart_ok: (s, p) => ['urgent', `✅ PS5 Pro WIRKLICH bestellbar bei ${s.name}!`, `Warenkorb → Kasse geht${p}. Sofort kaufen!`],
  page_only: (s) => ['low', `🟡 Nur Seite: verfügbar bei ${s.name}`, 'Warenkorb sagt nein (vermutlich Phantom-Bestand).'],
  unverified: (s, p, c) => ['high', `⚠️ PS5 Pro laut Seite verfügbar bei ${s.name}`, `Warenkorb-Check ${c === 'blocked' ? 'blockiert' : 'nicht möglich'} – selbst prüfen.`],
};

// push for one store run, or null. One rule: a push of a kind is due once per streak of that kind's state (retried next run until
// delivered, main.js stamps pushedAt only after ntfy accepted it), and never within the kind's cooldown.
// r: check result (+ r.cart for verify stores, r.capped for marketplace prices), o: previous status entry (streak starts, pushedAt)
export function decidePush(s, r, o = {}, now, { pageOnly = false, unverified = true } = {}) {
  if (r.status !== 'in_stock' || r.capped) return null;
  const c = r.cart?.result;
  const kind = !s.verify ? 'page' : c === 'ok' ? 'cart_ok' : c === 'fail' ? 'page_only' : 'unverified';
  if ((kind === 'page_only' && !pageOnly) || (kind === 'unverified' && !unverified)) return null;
  // start of the current streak: cart ok, or known in_stock (unknown<->in_stock flapping doesn't end a streak)
  const since = Date.parse((kind === 'cart_ok' ? o.cart === 'ok' && o.cartOkSince : o.known === 'in_stock' && o.inStockSince) || now);
  const last = o.pushedAt?.[kind] ? Date.parse(o.pushedAt[kind]) : -Infinity;
  if (last >= since || Date.parse(now) - last < COOLDOWN[kind] * 60000) return null;
  const [priority, title, message] = TEXT[kind](s, r.price != null ? ` für ${r.price} €` : '', c);
  return { kind, priority, title, message, url: s.url };
}
