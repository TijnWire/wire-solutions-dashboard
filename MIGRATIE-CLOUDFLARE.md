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
