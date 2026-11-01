# PS5 Pro Restock Tracker

Prüft alle 30 Minuten per GitHub Actions (Playwright/Chromium) mehrere Shops auf PS5-Pro-Verfügbarkeit, schreibt `docs/status.json`, zeigt den Stand auf einer GitHub-Pages-Seite (`docs/index.html`) und schickt bei Verfügbarkeit einen Push über [ntfy](https://ntfy.sh).

Shops und Erkennungs-Marker stehen in `src/stores.js`. Marker sind Kleinbuchstaben-Teilstrings; "ausverkauft"-Marker haben Vorrang. Captcha/Blockade-Seiten gelten als "unbekannt". Nach 48 unbekannten Läufen in Folge gibt es einen Hinweis-Push.

## Einrichtung

1. **ntfy-App** installieren (iOS/Android) und ein geheimes, schwer erratbares Topic abonnieren, z. B. `ps5pro-x7k2q9...`.
2. Im Repo unter *Settings > Secrets and variables > Actions* das Secret `NTFY_TOPIC` mit diesem Topic anlegen.
3. *Settings > Pages*: Branch `master`, Ordner `/docs`. (Private Repos brauchen dafür GitHub Pro.)
4. Tab *Actions > check > Run workflow* einmal manuell starten.

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
- **Keine Fehlalarme:** Blockierte Seiten (Captcha, Fehler) zählen als „unbekannt“, nie als „verfügbar“. Ist ein Shop 48 Läufe (~1 Tag) in Folge unbekannt, kommt eine leise Push-Meldung – dann URL/Marker in `src/stores.js` prüfen.
- **Aktive Shops (live geprüft 01.11.2026):** PlayStation Direct, MediaMarkt, Saturn, Alternate (über Produktdaten der Seite) und expert (kein Kaufen-Button = ausverkauft).
- **Deaktiviert** (`disabled: true` in `src/stores.js`): Amazon, Otto, Euronics, Geizhals, Galaxus – sie blockieren automatische Abrufe (Bot-Schutz). Der Tracker umgeht solche Sperren bewusst nicht.
- Das Actions-Log zeigt pro Lauf eine Tabelle mit Status, Grund und HTTP-Code jedes Shops.
