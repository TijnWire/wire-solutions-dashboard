# Herstel bij dataverlies

Wat te doen als er gegevens weg zijn. Bewaar dit bij de hand — als je het nodig hebt, heb je haast.

---

## 1. Terug in de tijd (Cloudflare D1 Time Travel)

D1 bewaart **30 dagen** aan wijzigingen. Je kunt de hele database terugzetten naar elk moment
daarbinnen, zonder dat wij daar iets voor hoeven te bouwen.

**Beproefd op 28-07-2026**: op een aparte testdatabase drie rijen weggegooid en teruggehaald — werkte
binnen enkele seconden.

### Kijken waar je naartoe kunt

```powershell
npx wrangler d1 time-travel info wire-solutions
```

Dat toont het huidige *bookmark*: een merkteken van dit moment. Schrijf dat op vóórdat je iets
riskants doet, dan kun je er altijd naar terug.

### Terugzetten naar een tijdstip

```powershell
npx wrangler d1 time-travel restore wire-solutions --timestamp="2026-07-28T09:00:00Z"
```

### Terugzetten naar een bookmark

```powershell
npx wrangler d1 time-travel restore wire-solutions --bookmark=<het bookmark>
```

> **Let op:** herstellen zet de héle database terug, niet één tabel. Alles wat ná dat moment is
> ingevoerd, is weg. Draai daarom eerst `time-travel info` en schrijf het huidige bookmark op, zodat je
> de herstelactie zelf ook weer ongedaan kunt maken.

---

## 2. Eén tabel terughalen zonder de rest te raken

Time Travel kan dat niet, maar dit wel: zet de database tijdelijk terug, haal de tabel eruit, en zet
hem weer vooruit.

1. Huidig bookmark opschrijven (`time-travel info`) — dit is je weg terug.
2. Herstellen naar het gewenste moment.
3. De tabel wegschrijven naar een bestand:
   ```powershell
   npx wrangler d1 execute wire-solutions --remote --json --command "select * from bodem_adressen" > adressen-terug.json
   ```
4. Herstellen naar het bookmark uit stap 1 (je bent weer bij).
5. De rijen uit het bestand terugzetten.

---

## 3. De tweede kopie (Supabase)

De Worker schrijft elke wijziging óók naar Supabase. Die kopie is bedoeld voor het geval Cloudflare
zelf onbereikbaar is, niet voor het terughalen van één per ongeluk gewiste rij — daarvoor is Time
Travel sneller en preciezer.

Bijwerken kan met de knop **Reservekopie bijwerken** in Instellingen → Sync & back-up.

---

## 4. Migratie terugdraaien

Elke migratie heeft een tegenhanger in `cloudflare/rollback/`. Die verwijderen uitsluitend wat de
migratie heeft toegevoegd; bestaande tabellen worden nergens aangeraakt.

```powershell
npx wrangler d1 execute wire-solutions --remote --file cloudflare/rollback/schema-bodem-log.rollback.sql
```

Terugdraaien in omgekeerde volgorde van aanmaken:

1. `schema-bodem-bewaartermijn.rollback.sql`
2. `schema-bodem-log.rollback.sql`
3. `schema-bodem-adressen.rollback.sql`
4. `schema-bodem.rollback.sql`

Elk rollback-bestand vertelt bovenaan wat je kwijtraakt en hoe je dat eerst wegschrijft. Alle vier zijn
op 28-07-2026 op een lokale kopie uitgevoerd: de tabellen verdwenen en `wire_state` en `users_auth`
bleven ongemoeid.

---

## 5. Controleren dat alles nog werkt

```powershell
npm test
```

Draait de vijf kritieke paden tegen een echte Worker met een lokale database: afspraak vastleggen,
zonder bereik werken, dubbele boeking, formulier hervatten en de afscherming per medewerker.
