import { existsSync } from 'node:fs';

// bot-protection pages -> reported as 'blocked', never as a stock status
export const BLOCK = [
  'captcha', 'access denied', 'are you a robot', 'unusual traffic', '403 forbidden',
  'nur einen moment', 'just a moment', 'enable javascript and cookies',
  'um mit dem einkauf fortzufahren',
];

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

export const findMarker = (text, markers) => markers.find((m) => text.includes(m));

export function pageText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// HTTP error -> reason (only used when the page itself gave no stock signal)
export function httpReason(code) {
  if ([401, 403, 429].includes(code)) return 'blocked';
  if ([404, 410].includes(code)) return 'not_found';
  return code >= 400 ? 'error' : null;
}

// reason: jsonld | marker | no_buy_button | blocked | no_signal | short
export function classify(html, store = {}) {
  const none = (reason) => ({ status: 'unknown', price: null, reason });
  if (typeof html !== 'string' || html.length < 300) return none('short');
  const ld = fromJsonLd(html);
  if (ld) return ld;
  const text = pageText(html);
  if (findMarker(text, BLOCK)) return none('blocked');
  // outOfStock checked first: no false alarms
  for (const [status, list = []] of [['out_of_stock', store.outOfStock], ['in_stock', store.inStock]]) {
    if (findMarker(text, list.map((m) => m.toLowerCase()))) return { status, price: null, reason: 'marker' };
  }
  // shops that only show a buy button when in stock
  // only if this is clearly the product page (else a broken/changed page would hide as 'sold out')
  if (store.missingBuyMeansOut && store.expectText && text.includes(store.expectText.toLowerCase())) return { status: 'out_of_stock', price: null, reason: 'no_buy_button' };
  return none('no_signal');
}

// same UA/locale for every visit; only HTML/JS needed: skip images/fonts/media
export async function newContext(browser) {
  const ctx = await browser.newContext({
    locale: 'de-DE',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  await ctx.route('**/*', (r) =>
    ['image', 'font', 'media'].includes(r.request().resourceType()) ? r.abort() : r.continue());
  return ctx;
}

// Chrome preinstalled on GitHub runners, else Playwright's own browser; proxy when set
export function launchOptions() {
  const o = { headless: true };
  const p = process.env.CHROMIUM_PATH || ['/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((x) => existsSync(x));
  if (p) o.executablePath = p;
  if (process.env.HTTPS_PROXY) o.proxy = { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }; // local test server stays direct
  return o;
}

// plain HTML fetch through the browser context (cookies, no rendering): ~1 s instead of ~5 s. The shops render
// JSON-LD and the buy box on the server, so this is the same data the full page shows; main.js falls back to fetchPage
// when the HTML gives no signal (challenge page, JS-only content).
export async function fetchHtml(browser, url) {
  const ctx = await newContext(browser);
  try {
    const res = await ctx.request.get(url, { timeout: 15000, maxRedirects: 5, headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'de-DE,de;q=0.9' } });
    const html = await res.text();
    return { html, http: res.status(), title: (html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? '').trim() };
  } finally {
    await ctx.close();
  }
}

// full render; `ready(html)` true -> return at once (server-rendered JSON-LD), else wait 3 s for client-side content
export async function fetchPage(browser, url, ready = () => false) {
  const ctx = await newContext(browser);
  try {
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    let html = await page.content();
    if (!ready(html)) { await page.waitForTimeout(3000); html = await page.content(); }
    return { html, http: res?.status() ?? null, title: await page.title() };
  } finally {
    await ctx.close();
  }
}
