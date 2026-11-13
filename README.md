# PS5 Pro Restock Tracker

📱 **Status-Link:** [github.com/endfated/Endfated](https://github.com/endfated/Endfated) – in der GitHub-App oder im Browser öffnen (eingeloggt) und als Favorit speichern. Die Tabelle aktualisiert sich bei jeder Prüfung.

<!-- STATUS:START -->
**Zuletzt geprüft:** 13.11.26, 14:32 Uhr

| Shop | Status | Preis | Zuletzt verfügbar |
|---|---|---|---|
| [PlayStation Direct](https://direct.playstation.com/de-de/buy-consoles/playstation5-pro-console-2-tb) | 🔴 Ausverkauft | 899,99 € | noch nie |
| [MediaMarkt](https://www.mediamarkt.de/de/product/_sony-playstationr5-pro-2-tb-konsole-3018022.html) | 🔴 Ausverkauft | 899,99 € | 13.11.26, 12:38<br>🛒 13.11.26, 12:38 |
| [Saturn](https://www.saturn.de/de/product/_sony-playstationr5-pro-2-tb-konsole-3018022.html) | 🔴 Ausverkauft | 899,99 € | 13.11.26, 12:38<br>🛒 noch nie |
| [expert](https://www.expert.de/shop/unsere-produkte/gaming-freizeit/sony-playstation/playstation-konsolen/11364201744-playstation-5-pro.html) | 🔴 Ausverkauft | – | noch nie |
| [Alternate](https://www.alternate.de/Sony/PlayStation-5-Pro-2-TB-E-Chassis-Spielkonsole/html/product/100160951) | 🔴 Ausverkauft | 899,99 € | noch nie |

🛒 = zuletzt wirklich bestellbar (Artikel im Warenkorb, Kasse erreichbar)

Nicht überwacht (Bot-Schutz, bitte selbst prüfen): [Amazon.de](https://www.amazon.de/dp/B0DHSV68YZ) · [Otto](https://www.otto.de/p/playstation-5-playstation-5-pro-2tb-playstation-5-pro-konsole-C1914416905/) · [Euronics](https://www.euronics.de/spiele-und-konsolen-film-und-musik/spiele-und-konsolen/playstation-5/spielekonsole/playstation-5-pro-konsole-4065465034645) · [Geizhals (aggregator)](https://geizhals.de/sony-playstation-5-pro-2tb-weiss-a3298140.html) · [Galaxus](https://www.galaxus.de/de/s1/product/sony-playstation-5-pro-2-tb-spielkonsole-49618254)

<details><summary>Letzte Änderungen</summary>

- 13.11.26, 12:40: MediaMarkt 🟢 **Verfügbar** → 🔴 Ausverkauft · Warenkorb: ok → –
- 13.11.26, 12:38: Saturn 🟢 **Verfügbar** → 🔴 Ausverkauft · Warenkorb: blockiert → –
- 13.11.26, 12:38: MediaMarkt 🔴 Ausverkauft → 🟢 **Verfügbar** · Warenkorb: ok
- 13.11.26, 12:36: Saturn 🔴 Ausverkauft → 🟢 **Verfügbar** · Warenkorb: blockiert
- 13.11.26, 06:55: MediaMarkt 🟢 **Verfügbar** → 🔴 Ausverkauft · Warenkorb: ok → –

</details>
<!-- STATUS:END -->

---

Prüft alle 20 Sekunden per GitHub Actions (Playwright/Chromium) mehrere Shops auf PS5-Pro-Verfügbarkeit, schreibt `docs/status.json`, aktualisiert die Status-Tabelle oben in dieser README und schickt bei Verfügbarkeit einen Push über [ntfy](https://ntfy.sh).

Shops und Erkennungs-Marker stehen in `src/stores.js`. Marker sind Kleinbuchstaben-Teilstrings; "ausverkauft"-Marker haben Vorrang. Captcha/Blockade-Seiten gelten als "unbekannt". Nach 48 unbekannten Läufen in Folge gibt es einen Hinweis-Push.

## Einrichtung

1. **ntfy-App** installieren (iOS/Android) und ein geheimes, schwer erratbares Topic abonnieren, z. B. `ps5pro-x7k2q9...`.
2. Im Repo unter *Settings > Secrets and variables > Actions* das Secret `NTFY_TOPIC` mit diesem Topic anlegen.
3. Tab *Actions > check > Run workflow* einmal manuell starten.

Danach läuft alles allein: Jeder Lauf prüft ~5½ Stunden lang alle 20 Sekunden und hält immer schon den nächsten Lauf in der Warteschlange bereit (Fehler der GitHub-API werden wiederholt). Zusätzlich startet der Workflow `watchdog` alle 15 Minuten die Prüfung neu, falls gar nichts läuft. Das geht nur kostenlos, weil das Repo öffentlich ist (private Repos: 2.000 Actions-Minuten/Monat).

Ohne Änderung wird der Status alle 2 Minuten neu geschrieben ("Zuletzt geprüft" ist also höchstens ~2 Min alt); geprüft wird trotzdem bei jedem Lauf, und ein Restock wird sofort gepusht.

## Lokal

```
npm i
npx playwright install chromium
npm run check -- --dry-run      # nur Tabelle, kein Schreiben, kein Push
NTFY_TOPIC=dein-topic npm run check -- --test-notify
npm test
```

Ohne `NTFY_TOPIC` werden Pushes nur geloggt. Ist `HTTPS_PROXY` gesetzt, nutzt Chromium diesen Proxy.

## Hinweise

- **Preisgrenze:** Pushes gibt es nur bis `MAX_PRICE` (Standard 1000 €), damit Scalper-/Marketplace-Angebote nicht nerven. Anpassbar als Env-Variable im Workflow.
- **Warenkorb-Check (MediaMarkt, Saturn):** Meldet die Seite „verfügbar“, legt der Tracker den Artikel in einer frischen Browser-Sitzung in den Warenkorb und prüft, ob dort „Zur Kasse“ möglich ist. Nur dann kommt der dringende Push („WIRKLICH bestellbar“, höchstens alle 10 Min pro Shop). Die Tabelle zeigt mit 🛒, wann es zuletzt wirklich bestellbar war. Verfügbar laut Seite, aber im Warenkorb nicht lieferbar = Phantom-Bestand: kein Push, nur Tabelle und Verlauf (`NOTIFY_PAGE_ONLY=1` schaltet dafür leise Pushes ein). Ist der Warenkorb-Check blockiert oder unklar, kommt ein Push mit „selbst prüfen“ (höchstens alle 30 Min pro Shop; `NOTIFY_UNVERIFIED=0` schaltet das ab). Kein Login, kein Kauf, keine Umgehung von Bot-Schutz.
- **Keine Fehlalarme:** Blockierte Seiten (Captcha, Fehler) zählen als „unbekannt“, nie als „verfügbar“. Ist ein Shop 48 Läufe (~1 Tag) in Folge unbekannt, kommt eine leise Push-Meldung – dann URL/Marker in `src/stores.js` prüfen.
- **Aktive Shops (live geprüft 01.11.2026):** PlayStation Direct, MediaMarkt, Saturn, Alternate (über Produktdaten der Seite) und expert (kein Kaufen-Button = ausverkauft).
- **Deaktiviert** (`disabled: true` in `src/stores.js`): Amazon, Otto, Euronics, Geizhals, Galaxus – sie blockieren automatische Abrufe (Bot-Schutz). Der Tracker umgeht solche Sperren bewusst nicht.
- Das Actions-Log zeigt pro Lauf eine Tabelle mit Status, Grund und HTTP-Code jedes Shops.
