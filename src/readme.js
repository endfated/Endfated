const START = '<!-- STATUS:START -->';
const END = '<!-- STATUS:END -->';

const time = (iso) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
const eur = (p) => (p == null ? '–' : p.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));
const REASON = { blocked: 'Blockiert (Bot-Schutz)', not_found: 'Seite nicht gefunden', error: 'Shop-Fehler' };
const LABEL = { in_stock: '🟢 **Verfügbar**', out_of_stock: '🔴 Ausverkauft', unknown: '⚪ Unbekannt' };

const label = (s) => (s.status === 'unknown' && REASON[s.reason] ? `⚪ ${REASON[s.reason]}` : LABEL[s.status]);

export function renderStatusMd({ updatedAt, stores = [], disabled = [], history = [] }) {
  const rows = [...stores].sort((a, b) => a.priority - b.priority).map((s) =>
    `| [${s.name}](${s.url}) | ${label(s)} | ${eur(s.price)} | ${s.lastInStockAt ? time(s.lastInStockAt) : 'noch nie'} |`);
  const lines = [`**Zuletzt geprüft:** ${time(updatedAt)} Uhr`, ''];
  if (stores.some((s) => s.status === 'in_stock')) lines.push('> 🎉 **Mindestens ein Shop hat die PS5 Pro auf Lager – schnell sein!**', '');
  if (stores.length && stores.every((s) => s.status === 'unknown')) lines.push('> ⚠️ Kein Shop konnte geprüft werden.', '');
  lines.push('| Shop | Status | Preis | Zuletzt verfügbar |', '|---|---|---|---|', ...rows);
  if (disabled.length) lines.push('', `Nicht überwacht (Bot-Schutz, bitte selbst prüfen): ${disabled.map((s) => `[${s.name}](${s.url})`).join(' · ')}`);
  if (history.length) {
    lines.push('', '<details><summary>Letzte Änderungen</summary>', '');
    for (const h of history.slice(0, 5)) lines.push(`- ${time(h.at)}: ${h.name} ${LABEL[h.from] ?? h.from} → ${LABEL[h.to] ?? h.to}`);
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
