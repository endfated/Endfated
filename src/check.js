const BLOCK = ['captcha', 'access denied', 'are you a robot', 'unusual traffic'];

function ldObjects(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      out.push(n);
      Object.values(n).forEach(walk);
    }
  };
  for (const m of html.matchAll(re)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* ignore bad JSON */ }
  }
  return out;
}

// Main product offer = first object with availability (carousels/related items come later).
function fromJsonLd(html) {
  for (const o of ldObjects(html)) {
    if (o.availability === undefined) continue;
    const a = String(o.availability).toLowerCase();
    let status;
    if (/outofstock|soldout|discontinued/.test(a)) status = 'out_of_stock';
    else if (/instock|preorder|limitedavailability/.test(a)) status = 'in_stock';
    else continue;
    const p = parseFloat(String(o.price ?? o.lowPrice ?? '').replace(',', '.'));
    return { status, price: Number.isFinite(p) ? p : null };
  }
  return null;
}

export function classify(html, store = {}) {
  const none = { status: 'unknown', price: null };
  if (typeof html !== 'string' || html.length < 300) return none;
  const ld = fromJsonLd(html);
  if (ld) return ld;
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase();
  if (BLOCK.some((b) => text.includes(b))) return none;
  const has = (list = []) => list.some((m) => text.includes(m.toLowerCase()));
  if (has(store.outOfStock)) return { status: 'out_of_stock', price: null };
  if (has(store.inStock)) return { status: 'in_stock', price: null };
  return none;
}

export async function fetchPage(browser, url) {
  const ctx = await browser.newContext({
    locale: 'de-DE',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    return await page.content();
  } finally {
    await ctx.close();
  }
}
