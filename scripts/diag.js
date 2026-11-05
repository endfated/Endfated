// Diagnose: what exactly do MediaMarkt/Saturn report? Prints JSON-LD offers + buy-area text, several rounds.
import { chromium } from 'playwright';
import stores from '../src/stores.js';
import { fetchPage, pageText } from '../src/check.js';

const ids = (process.env.IDS || 'mediamarkt,saturn').split(',');
const browser = await chromium.launch({ headless: true });
for (let round = 0; round < Number(process.env.ROUNDS || 6); round++) {
  for (const s of stores.filter((x) => ids.includes(x.id))) {
    const { html, http } = await fetchPage(browser, s.url);
    const lds = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    const offers = [];
    for (const raw of lds) {
      try {
        const walk = (n) => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { if ('availability' in n) offers.push(n); Object.values(n).forEach(walk); } };
        walk(JSON.parse(raw));
      } catch {}
    }
    const t = pageText(html);
    const hits = [...t.matchAll(/.{0,50}(in den warenkorb|nicht verfügbar|ausverkauft|online verfügbar|lieferbar|abholung|marktplatz|verkauf und versand durch).{0,50}/g)].map((m) => m[0]).slice(0, 8);
    console.log(`\n=== ${new Date().toISOString()} ${s.id} http=${http}`);
    console.log('offers:', JSON.stringify(offers.map((o) => ({ av: o.availability, price: o.price, seller: o.seller?.name, url: o.url, type: o['@type'], cond: o.itemCondition })), null, 0));
    console.log('text:', hits.join(' | '));
  }
  await new Promise((r) => setTimeout(r, 30000));
}
await browser.close();
