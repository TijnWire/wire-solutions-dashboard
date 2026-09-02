# Migratie: Supabase → Cloudflare (Workers + D1)

De centrale database draait niet meer op Supabase, maar op een **Cloudflare Worker** met een **D1-database**
(SQLite). Cloudflare pauzeert niet, dus de terugkerende "database ligt eruit"-storing is voorbij.

De app blijft local-first: alles werkt lokaal door, ook als de database even weg is. Realtime is vervangen
door de bestaande poll (elke 2s) — wijzigingen van collega's verschijnen nog steeds binnen enkele seconden.

> **Kosten:** alles past op de gratis Cloudflare-laag voor een team dat overdag werkt.

---

## Wat is er gebouwd

| Bestand | Wat |
|---|---|
| `cloudflare/worker.ts` | De hele API: eigen JWT-auth + alle data/verlof/rollen/admin-routes |
| `cloudflare/schema.sql` | De D1-tabellen (wire_state, users_auth, app_roles, admin_audit, verlof_beslissingen) |
| `wrangler.toml` | Worker-config (D1-binding) |
| `src/lib/supabase.ts` | Praat nu met de Worker i.p.v. Supabase (zelfde functienamen, rest van de app onveranderd) |
| `scripts/mail-import.mjs` | De mail-bot schrijft nu naar de Worker |

De oude `supabase/`-map laat ik staan voor het geval je wilt terugvallen — die wordt niet meer gebruikt.

---

## Stappenplan (± 15 min, één keer)

Draai alles vanuit de projectmap `c:\Projects\Wire Solutions` in **PowerShell**.

### 1. Pakketten installeren (haalt Wrangler binnen)
```powershell
npm install
```

### 2. Inloggen bij Cloudflare (opent je browser)
```powershell
npx wrangler login
```

### 3. De database aanmaken
```powershell
npx wrangler d1 create wire-solutions
```
Dit print een blokje met een **`database_id`**. Kopieer die id en zet 'm in **`wrangler.toml`** op de regel
`database_id = "PLAK-HIER-DE-DATABASE-ID"`. *(Of plak 'm hier in de chat, dan doe ik het.)*

### 4. Een geheim voor de tokens instellen
Genereer een willekeurige sleutel:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```
Zet 'm als secret (plak de uitkomst als het om een waarde vraagt):
```powershell
npx wrangler secret put JWT_SECRET
```

### 5. De Worker deployen
```powershell
npx wrangler deploy
```
Onderaan verschijnt de URL, bijv. **`https://wire-solutions-api.<jouw-naam>.workers.dev`**.
Bewaar die — die heb je bij stap 7 nodig. *(Of plak 'm hier, dan vul ik 'm overal in.)*

### 6. De tabellen aanmaken in de database
```powershell
npm run cf:schema
```

### 7. De Worker-URL in de app zetten
Vul de URL uit stap 5 in op **één** plek: in `src/lib/supabase.ts`, de regel
`export const CLOUD_API_URL = "https://PLAK-HIER-DE-WORKER-URL";`
*(Zeg het maar als je wilt dat ik dit + het committen voor je doe zodra je de URL hebt.)*

### 8. Testen dat de database werkt (vóór je live gaat)
Vervang `<URL>` door je Worker-URL:
```powershell
$U="<URL>"
curl.exe -s -X POST "$U/auth/signup" -H "content-type: application/json" -d '{\"email\":\"test@wiresolutions.nl\",\"wachtwoord\":\"testtest\"}'
```
Je hoort een `{"token":"...","email":"..."}` terug te krijgen. Krijg je dat, dan werkt de database. ✅

### 9. Live zetten
```powershell
git add -A
git commit -m "Centrale database: Supabase -> Cloudflare (Workers + D1)"
git push
```
Vercel bouwt automatisch de nieuwe frontend.

---

## De data overzetten (gaat vanzelf)

Je hoeft niks te exporteren. De app is local-first, dus:

1. Log **op het kantoor-apparaat met de meest complete gegevens als eerste in** op de nieuwe versie.
   De app uploadt dan al jullie gegevens vanzelf naar de nieuwe database.
2. Laat daarna de andere apparaten inloggen — hun gegevens worden er per record bij samengevoegd
   (niks raakt kwijt; de "leeg mag gevuld niet overschrijven"-bescherming zit er nog op).
3. Elk account maakt zichzelf bij de eerste login opnieuw aan (self-healing) — **wachtwoorden hoef je
   niet over te zetten**, iedereen logt gewoon in met hetzelfde wachtwoord als altijd.

> Belangrijk: log als **eigenaar** als eerste in. Zodra de gebruikerslijst één keer is gesynct, weet de
> database wie eigenaar is en wie verlof mag goedkeuren (dat leidt de Worker automatisch af).

---

## De mail-import-bot (als je die gebruikt)

Zet in GitHub → repo **Settings → Secrets and variables → Actions** één secret erbij:

- **`CLOUD_API_URL`** = je Worker-URL uit stap 5

De bestaande secrets (`BOT_EMAIL`, `BOT_PASS`, `IMAP_*`) blijven staan. Het bot-account maakt zichzelf
bij de eerste run aan.

---

## Handig

- **Live meekijken met de database:** `npx wrangler tail`
- **Snel iets in de database checken:** `npx wrangler d1 execute wire-solutions --remote --command "select key, updated_at from wire_state"`
- **Terugrollen naar Supabase:** `git revert` van de migratie-commit (de oude Supabase-code staat er nog).

---

## Beveiligingsupdate (branch `security-fixes`) — wat je moet draaien om het te activeren

Deze update sluit vijf gaten. De code werkt meteen na deploy; drie punten vragen éénmalig een handeling.

### A. Nieuwe database-tabel voor het intrekken van sessies (verplicht)
Zonder deze tabel houdt een verwijderde medewerker tot 30 dagen toegang. De Worker maakt hem niet zelf aan:
```powershell
npx wrangler d1 execute wire-solutions --remote --file cloudflare/schema-token-revocaties.sql
```
> De code is fail-safe: ontbreekt de tabel, dan blijft alles gewoon werken (er wordt alleen nog niets
> ingetrokken). Terugrollen kan met `cloudflare/rollback/schema-token-revocaties.rollback.sql`.

### B. AI aanzetten via OpenRouter (goedkoop) — server-side, sleutel nooit op een toestel
De AI (PDF-scan, formulier-scan, assistent) draait via **OpenRouter** met een goedkoop, multimodaal
model in plaats van het dure Claude Opus. Zet je OpenRouter-sleutel als **secret** op de Worker:
```powershell
npx wrangler secret put OPENROUTER_KEY
```
Optioneel het model kiezen (standaard `google/gemini-2.5-flash` — kan vision, PDF én tool-calling):
```powershell
npx wrangler secret put OPENROUTER_MODEL
# waarde bijv.:  google/gemini-2.5-flash        (goede kwaliteit, zeer goedkoop)
#          of:  google/gemini-2.5-flash-lite    (nog goedkoper)
#          of:  openai/gpt-4o-mini              (alternatief)
```
Deploy daarna (`npx wrangler deploy`). Er hoeft **niets** meer in de app zelf te worden ingevuld — de
scan-knoppen en de assistent werken zodra de secret staat en de gebruiker is ingelogd.

**Zo zet je credit op OpenRouter:**
1. Maak een account op https://openrouter.ai
2. Ga naar **Credits** en zet een bedrag op (bv. €10 is voor dit dashboard heel lang genoeg).
3. Ga naar **Keys → Create key**, kopieer de sleutel en gebruik die bij `wrangler secret put OPENROUTER_KEY`.
4. Tip: stel bij de key een **maandelijkse limiet** in, dan kan het nooit uit de hand lopen.

> Kosten ter vergelijking: Gemini Flash is grofweg **50–150× goedkoper** dan Claude Opus voor dit soort
> extractiewerk. Een PDF met adressen scannen kost hiermee doorgaans een fractie van een cent.
> Zolang `OPENROUTER_KEY` niet staat, geeft de app een nette melding "AI staat nog niet aan" — er breekt
> niets, alleen de AI-functies wachten tot de sleutel er is.

### C. CORS beperken tot je eigen domein (optioneel, aanbevolen)
```powershell
npx wrangler secret put ALLOWED_ORIGINS
# waarde bijv.:  https://wire-solutions-dashboard.vercel.app
```
Zonder deze secret blijft het gedrag ongewijzigd (`*`).

### Wat er verder automatisch in zit (geen actie nodig)
- **Geen wachtwoord meer op het toestel.** De app bewaarde het echte wachtwoord in de browser (alleen
  base64). Dat is eruit: gekoppeld blijven gaat nu via automatische sessie-verlenging (`/auth/verleng`).
  Wie de app 30 dagen niet opent, logt één keer opnieuw in — z'n e-mailadres staat alvast ingevuld.
- **Kwetsbare pakketten bijgewerkt** (o.a. een PDF.js-lek waarmee een besmette PDF code kon uitvoeren —
  relevant voor de mail-bot). `xlsx` naar de officiële gepatchte SheetJS-release.
- **Sessies worden ingetrokken** bij account verwijderen, wachtwoord-reset door een beheerder, en
  e-mailwijziging.

> Eén bekende, bewust NIET geforceerde: `vite`/`esbuild` (dev-server) hebben een moderate/high advisory
> waarvan de fix een major-upgrade naar Vite 8 vereist. Dat raakt alleen de lokale ontwikkelserver, niet
> de productie-build — daarom laten staan tot een apart, getest upgrade-moment.
