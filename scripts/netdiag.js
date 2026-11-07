// Diagnose: which API/GraphQL requests does each product page make for availability?
// Prints the page's own xhr/fetch traffic (URL, a few request headers, body snippets) so the tracker can poll the same data source.
import { chromium } from 'playwright';
import stores from '../src/stores.js';
import { launchOptions, newContext } from '../src/check.js';

const ids = (process.env.IDS || 'mediamarkt,saturn,ps-direct').split(',');
const KEEP = ['x-operation', 'x-cacheable', 'apollographql-client-name', 'apollographql-client-version', 'x-mms-country', 'x-mms-language', 'x-mms-salesline', 'content-type', 'accept'];
const interesting = (u) => /graphql|api|availab|stock|product|3018022|inventory/i.test(u);
const browser = await chromium.launch(launchOptions());
for (const s of stores.filter((x) => ids.includes(x.id))) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const seen = [];
  page.on('response', async (res) => {
    const req = res.request();
    if (!['xhr', 'fetch'].includes(req.resourceType())) return;
    const url = req.url();
    let body = '';
    if (interesting(url)) { try { body = (await res.text()).replace(/\s+/g, ' ').slice(0, 700); } catch { body = '(no body)'; } }
    const h = Object.fromEntries(Object.entries(req.headers()).filter(([k]) => KEEP.includes(k)));
    seen.push({ m: req.method(), st: res.status(), url: url.slice(0, 400), h, post: (req.postData() || '').slice(0, 400), body });
  });
  await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log(`\n===== ${s.id} ${seen.length} xhr/fetch, ${seen.filter((r) => interesting(r.url)).length} interesting`);
  for (const r of seen) console.log(interesting(r.url) ? JSON.stringify(r) : `${r.m} ${r.st} ${r.url.slice(0, 160)}`);
  await ctx.close();
}
await browser.close();
