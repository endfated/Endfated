const START = '<!-- STATUS:START -->';
const END = '<!-- STATUS:END -->';

const time = (iso) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
const eur = (p) => (p == null ? '–' : p.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));
const REASON = { blocked: 'Blockiert (Bot-Schutz)', not_found: 'Seite nicht gefunden', error: 'Shop-Fehler' };
const LABEL = { in_stock: '🟢 **Verfügbar**', out_of_stock: '🔴 Ausverkauft', unknown: '⚪ Unbekannt' };

const CART = { ok: 'ok', fail: 'nein', blocked: 'blockiert', unknown: 'unklar' };
const last = (iso) => (iso ? time(iso) : 'noch nie');

// in stock, and either no cart check for this shop or the cart check passed
const buyable = (s) => s.status === 'in_stock' && !s.capped && (!s.cart || s.cart === 'ok');

function label(s) {
  if (s.status === 'unknown' && REASON[s.reason]) return `⚪ ${REASON[s.reason]}`;
  if (s.status === 'in_stock' && s.capped) return '🟠 Verfügbar (Marketplace-Preis)';
  if (s.status !== 'in_stock' || !s.cart) return LABEL[s.status];
  if (buyable(s)) return '🟢 **Bestellbar** (Warenkorb OK)';
  return s.cart === 'fail' ? '🟡 Seite: verfügbar, Warenkorb: nein' : '🟢 **Verfügbar** (ungeprüft)';
}

export function renderStatusMd({ updatedAt, stores = [], disabled = [], history = [] }) {
  const rows = [...stores].sort((a, b) => a.priority - b.priority).map((s) =>
    `| [${s.name}](${s.url}) | ${label(s)} | ${eur(s.price)} | ${last(s.lastInStockAt)}${s.verify ? `<br>🛒 ${last(s.lastCartOkAt)}` : ''} |`);
  const lines = [`**Zuletzt geprüft:** ${time(updatedAt)} Uhr`, ''];
  if (stores.some(buyable)) lines.push('> 🎉 **Mindestens ein Shop hat die PS5 Pro auf Lager – schnell sein!**', '');
  if (stores.length && stores.every((s) => s.status === 'unknown')) lines.push('> ⚠️ Kein Shop konnte geprüft werden.', '');
  lines.push('| Shop | Status | Preis | Zuletzt verfügbar |', '|---|---|---|---|', ...rows);
  if (stores.some((s) => s.verify)) lines.push('', '🛒 = zuletzt wirklich bestellbar (Artikel im Warenkorb, Kasse erreichbar)');
  if (disabled.length) lines.push('', `Nicht überwacht (Bot-Schutz, bitte selbst prüfen): ${disabled.map((s) => `[${s.name}](${s.url})`).join(' · ')}`);
  if (history.length) {
    lines.push('', '<details><summary>Letzte Änderungen</summary>', '');
    for (const h of history.slice(0, 5)) {
      const status = h.from !== h.to ? ` ${LABEL[h.from] ?? h.from} → ${LABEL[h.to] ?? h.to}` : '';
      const cart = h.cart || h.cartFrom ? ` · Warenkorb: ${h.cartFrom ? `${CART[h.cartFrom] ?? h.cartFrom} → ` : ''}${CART[h.cart] ?? h.cart ?? '–'}` : '';
      lines.push(`- ${time(h.at)}: ${h.name}${status}${cart}`);
    }
    lines.push('', '</details>');
  }
  return lines.join('\n');
}

export function replaceStatus(readme, md) {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) return readme;
  return `${readme.slice(0, a + START.length)}\n${md}\n${readme.slice(b)}`;
}
