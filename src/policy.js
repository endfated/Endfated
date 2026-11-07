// minutes between two pushes of one kind for one store: the page flips in_stock/out_of_stock several times an hour
const COOLDOWN = { cart_ok: 10, unverified: 30, page_only: 30 };
const cool = (o, kind, now) => { const t = o.pushedAt?.[kind]; return !!t && Date.parse(now) - Date.parse(t) < COOLDOWN[kind] * 60000; };

// push for one store run, or null. r: check result (+ r.cart for verify stores), o: previous status entry, now: ISO time
export function decidePush(s, r, o = {}, now, maxPrice = Infinity, { pageOnly = false } = {}) {
  if (r.status !== 'in_stock' || r.price > maxPrice) return null;
  const price = r.price != null ? ` für ${r.price} €` : '';
  const fresh = o.known !== 'in_stock'; // last known status: unknown<->in_stock flapping doesn't re-push
  const push = (kind, priority, title, message) => ({ kind, title, message, url: s.url, priority });
  if (!s.verify) return fresh ? push('page', 'urgent', `🎮 PS5 Pro verfügbar bei ${s.name}!`, `Jetzt verfügbar${price}: ${s.name}`) : null;
  const c = r.cart?.result;
  if (c === 'ok') return o.cartOk || cool(o, 'cart_ok', now) ? null : push('cart_ok', 'urgent', `✅ PS5 Pro WIRKLICH bestellbar bei ${s.name}!`, `Warenkorb → Kasse geht${price}. Sofort kaufen!`);
  if (!fresh) return null;
  if (c === 'fail') return pageOnly && !cool(o, 'page_only', now) ? push('page_only', 'low', `🟡 Nur Seite: verfügbar bei ${s.name}`, 'Warenkorb sagt nein (vermutlich Phantom-Bestand).') : null;
  if (cool(o, 'unverified', now)) return null;
  return push('unverified', 'high', `⚠️ PS5 Pro laut Seite verfügbar bei ${s.name}`, `Warenkorb-Check ${c === 'blocked' ? 'blockiert' : 'nicht möglich'} – selbst prüfen.`);
}
