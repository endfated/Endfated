// priority: 1 = highest (PS Direct)
// NOTE: all URLs came from web search results (search-engine index); live fetch was blocked in the
// build sandbox (proxy 403 / DNS), so markers are UNVERIFIED against live HTML. Test in real env.
export default [
  { id: 'ps-direct', name: 'PlayStation Direct', priority: 1,
    url: 'https://direct.playstation.com/de-de/buy-consoles/playstation5-pro-console-2-tb',
    inStock: ['in den warenkorb'], outOfStock: ['derzeit nicht vorrätig'],
    note: 'URL from search; page text "Derzeit nicht vorrätig" seen when OOS; max 1 per order; queue/bot protection likely' },
  { id: 'mediamarkt', name: 'MediaMarkt', priority: 2,
    url: 'https://www.mediamarkt.de/de/product/_sony-playstationr5-pro-2-tb-konsole-3018022.html',
    inStock: ['in den warenkorb'], outOfStock: ['leider keine lieferung möglich'],
    note: 'URL from search, unverified live; OOS text seen in index; "In den Warenkorb" may appear on carousels; likely bot-blocked' },
  { id: 'saturn', name: 'Saturn', priority: 3,
    url: 'https://www.saturn.de/de/product/_sony-playstationr5-pro-2-tb-konsole-3018022.html',
    inStock: ['in den warenkorb'], outOfStock: ['leider keine lieferung möglich'],
    note: 'Same article no. 3018022 as MediaMarkt; JSON-LD OutOfStock seen; likely bot-blocked' },
  { id: 'expert', name: 'expert', priority: 4,
    url: 'https://www.expert.de/shop/unsere-produkte/gaming-freizeit/sony-playstation/playstation-konsolen/11364201744-playstation-5-pro.html',
    inStock: ['in den warenkorb'], outOfStock: ['derzeit nicht verfügbar', 'nicht lieferbar'], missingBuyMeansOut: true,
    note: 'No JSON-LD; buy button only shown when in stock (verified live 2026-11-01)' },
  { id: 'amazon', disabled: true, // bot protection blocks automated checks (verified 2026-11-01)
    name: 'Amazon.de', priority: 5,
    url: 'https://www.amazon.de/dp/B0DHSV68YZ',
    inStock: ['in den einkaufswagen'], outOfStock: ['derzeit nicht verfügbar'],
    note: 'ASIN unverified (alt: B0FRYBZR91 CFI-7121, B0DM8SFRJV); check seller = Amazon; captcha likely' },
  { id: 'otto', disabled: true, // bot protection blocks automated checks (verified 2026-11-01)
    name: 'Otto', priority: 6,
    url: 'https://www.otto.de/p/playstation-5-playstation-5-pro-2tb-playstation-5-pro-konsole-C1914416905/',
    inStock: ['in den warenkorb'], outOfStock: ['derzeit nicht verfügbar', 'ausverkauft'],
    note: 'Marketplace-priced (~1389+ EUR), unverified markers; Otto also lists bundles' },
  { id: 'alternate', name: 'Alternate', priority: 7,
    url: 'https://www.alternate.de/Sony/PlayStation-5-Pro-2-TB-E-Chassis-Spielkonsole/html/product/100160951',
    inStock: ['in den warenkorb'], outOfStock: ['nicht lieferbar', 'derzeit nicht verfügbar'],
    note: 'URL from search (2 variants of listing exist: .../Sony-Interactive-Entertainment/...); markers guessed' },
  { id: 'euronics', disabled: true, // bot protection blocks automated checks (verified 2026-11-01)
    name: 'Euronics', priority: 8,
    url: 'https://www.euronics.de/spiele-und-konsolen-film-und-musik/spiele-und-konsolen/playstation-5/spielekonsole/playstation-5-pro-konsole-4065465034645',
    inStock: ['in den warenkorb'], outOfStock: ['nicht verfügbar'],
    note: 'URL from search; markers guessed, unverified' },
  { id: 'geizhals', disabled: true, // bot protection blocks automated checks (verified 2026-11-01)
    name: 'Geizhals (aggregator)', priority: 9,
    url: 'https://geizhals.de/sony-playstation-5-pro-2tb-weiss-a3298140.html',
    inStock: ['sofort lieferbar', 'auf lager'], outOfStock: ['keine angebote'],
    note: 'Aggregator; shows offers incl. marketplace sellers at inflated prices; markers guessed' },
  { id: 'galaxus', name: 'Galaxus', priority: 5,
    url: 'https://www.galaxus.de/de/s1/product/sony-playstation-5-pro-2-tb-spielkonsole-49618254',
    inStock: ['in den warenkorb'], outOfStock: ['momentan nicht an lager', 'nicht lieferbar', 'ausverkauft'],
    note: 'Swiss retailer, trusted in DE; URL from search, markers unverified' },
];
