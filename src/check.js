const BLOCK = ['captcha', 'access denied', 'are you a robot', 'unusual traffic'];

function ldObjects(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      if ('availability' in n) out.push(n);
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
    const a = String(o.availability).toLowerCase();
    let status;
    if (/outofstock|soldout|discontinued/.test(a)) status = 'out_of_stock';
    else if (/instock|preorder|limitedavailability/.test(a)) status = 'in_stock';
    else continue;
    const p = parseFloat(String(o.price ?? o.lowPrice ?? '').replace(',', '.'));
    return { status, price: Number.isFinite(p) ? p : null, reason: 'jsonld' };
  }
  return null;
}

export function pageText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// reason: jsonld | marker | blocked | no_signal | short
export function classify(html, store = {}) {
  const none = (reason) => ({ status: 'unknown', price: null, reason });
  if (typeof html !== 'string' || html.length < 300) return none('short');
  const ld = fromJsonLd(html);
  if (ld) return ld;
  const text = pageText(html);
  if (BLOCK.some((b) => text.includes(b))) return none('blocked');
  // outOfStock checked first: no false alarms
  for (const [status, list = []] of [['out_of_stock', store.outOfStock], ['in_stock', store.inStock]]) {
    if (list.some((m) => text.includes(m.toLowerCase()))) return { status, price: null, reason: 'marker' };
  }
  return none('no_signal');
}

export async function fetchPage(browser, url) {
  const ctx = await browser.newContext({
    locale: 'de-DE',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  try {
    // only HTML is needed: skip images/fonts/media
    await ctx.route('**/*', (r) =>
      ['image', 'font', 'media'].includes(r.request().resourceType()) ? r.abort() : r.continue());
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    return { html: await page.content(), http: res?.status() ?? null, title: await page.title() };
  } finally {
    await ctx.close();
  }
}
