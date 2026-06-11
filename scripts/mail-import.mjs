// Automatische mail-import voor Wire Solutions.
// Leest de mailbox uit (IMAP), pakt Excel-bijlagen, herkent het type (nu: Klantafspraaklijst →
// Buurtaanpak), en zet de gegevens in de centrale database (Supabase) → verschijnt vanzelf in de app.
//
// Draait via .github/workflows/mail-import.yml (elke 10 min). Lokaal testen:
//   $env:IMAP_USER="..."; $env:IMAP_PASS="..."; $env:BOT_EMAIL="..."; $env:BOT_PASS="..."; node scripts/mail-import.mjs
//
// Benodigde secrets (GitHub → repo Settings → Secrets and variables → Actions):
//   IMAP_HOST   (standaard imap.hostnet.nl)   IMAP_USER  = mailadres van de mailbox
//   IMAP_PASS   = wachtwoord van die mailbox
//   BOT_EMAIL   = een @wiresolutions.nl-app-account (bv. mail@wiresolutions.nl)   BOT_PASS = wachtwoord
//   MAIL_AFZENDERS (optioneel) = komma-lijst van toegestane afzenders, bv. "stedin.nl,fues.nl"

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://buauptxdaiuvqazhlrhk.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1YXVwdHhkYWl1dnFhemhscmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTQ0ODAsImV4cCI6MjA5NjQ5MDQ4MH0.OeQlHefazX6XLdAoOQtJEWs9lUqctjP3rC4_L7byn_4";

const need = (k, def) => { const v = process.env[k] ?? def; if (!v) { console.error("Ontbrekende secret:", k); process.exit(1); } return v; };
const IMAP_HOST = process.env.IMAP_HOST || "imap.hostnet.nl";
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);
const IMAP_USER = need("IMAP_USER");
const IMAP_PASS = need("IMAP_PASS");
const BOT_EMAIL = need("BOT_EMAIL");
const BOT_PASS = need("BOT_PASS");
const AFZENDERS = (process.env.MAIL_AFZENDERS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// ── Klantafspraaklijst → BuurtAdres[] (zelfde logica als src/lib/buurtaanpak.ts) ──
function parseAdresDeel(raw, postcode, soort, gedeeld, id) {
  let s = (raw || "").trim();
  if (!s || /geen werkzaamheden/i.test(s)) return null;
  s = s.replace(/(\s*\bok\b)+\s*$/i, "").trim();
  if (!s) return null;
  const m = s.match(/^(.*?[A-Za-zÀ-ÿ.])\s*(\d+[A-Za-z]?)(?![A-Za-z])(.*)$/);
  let straat = s, huisnummer = "", bijz = "";
  if (m) { straat = m[1].trim(); huisnummer = m[2].replace(/\s+/g, ""); bijz = m[3].replace(/^[\s/,-]+/, "").trim(); }
  return { id, straat, huisnummer, postcode: (postcode || "").trim(), soort, datum: gedeeld.datum, telefoon: gedeeld.telefoon, bijzonderheid: bijz, bevestigd: gedeeld.bevestigd, uitgevoerd: gedeeld.uitgevoerd };
}
function parseKlantafspraaklijst(rijen) {
  const out = [];
  rijen.forEach((cols, i) => {
    const datum = (cols[1] || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return;
    const gedeeld = { datum, telefoon: (cols[7] || "").trim(), bevestigd: /ja/i.test(cols[8] || ""), uitgevoerd: /ja/i.test(cols[9] || "") };
    const heledag = []; let n = 0;
    for (const [aCol, pCol] of [[2, 3], [4, 5]]) {
      const a = parseAdresDeel(cols[aCol] || "", cols[pCol] || "", "heledag", gedeeld, `${datum}-h${n}-${i}`);
      if (a) { out.push(a); heledag.push({ straat: a.straat, postcode: a.postcode }); n++; }
    }
    for (const stuk of (cols[6] || "").split("/")) {
      const a = parseAdresDeel(stuk, "", "kort", gedeeld, `${datum}-k${n}-${i}`);
      if (a) { a.postcode = a.postcode || (heledag.find((h) => h.straat.toLowerCase() === a.straat.toLowerCase())?.postcode ?? ""); out.push(a); n++; }
    }
  });
  return out;
}

// Excel-buffer → rijen (strings; datum als ISO).
async function leesRijen(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const rijen = [];
  ws.eachRow((row) => {
    const cols = [];
    for (let c = 1; c <= 11; c++) {
      const v = row.getCell(c).value;
      cols.push(v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "object" ? String(v.text ?? v.result ?? "") : String(v));
    }
    rijen.push(cols);
  });
  return rijen;
}

// Herkent het type aan de koprij. (Brieven/TAUW volgen zodra ik een voorbeeld-Excel heb.)
function herkenType(rijen) {
  const kop = (rijen[0] || []).join(" | ").toLowerCase();
  if (kop.includes("adres") && kop.includes("postcode") && (kop.includes("tot 09") || kop.includes("aftakker"))) return "klantafspraaklijst";
  return null;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { error: loginErr } = await supabase.auth.signInWithPassword({ email: BOT_EMAIL, password: BOT_PASS });
  if (loginErr) { console.error("Supabase-login mislukt:", loginErr.message); process.exit(1); }

  const client = new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: true, auth: { user: IMAP_USER, pass: IMAP_PASS }, logger: false });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  let verwerkt = 0;
  try {
    for await (const msg of client.fetch({ seen: false }, { source: true, envelope: true })) {
      const parsed = await simpleParser(msg.source);
      const afzender = (parsed.from?.value?.[0]?.address || "").toLowerCase();
      const onderwerp = parsed.subject || "";
      if (AFZENDERS.length && !AFZENDERS.some((a) => afzender.includes(a))) continue; // niet van een toegestane afzender
      const xlsx = (parsed.attachments || []).filter((a) => /\.xlsx$/i.test(a.filename || "") || /spreadsheet/i.test(a.contentType || ""));
      if (!xlsx.length) continue;

      for (const bijlage of xlsx) {
        try {
          const rijen = await leesRijen(bijlage.content);
          const type = herkenType(rijen);
          if (type === "klantafspraaklijst") {
            const adressen = parseKlantafspraaklijst(rijen);
            if (!adressen.length) { console.log(`– ${bijlage.filename}: geen adressen herkend`); continue; }
            const naam = (bijlage.filename || onderwerp || "Buurtaanpak").replace(/\.[^.]+$/, "").replace(/klantafspraaklijst/i, "").trim() || "Buurtaanpak";
            const id = `ba-mail-${Date.now().toString(36)}`;
            const nieuw = { id, aangemaakt: new Date().toISOString(), naam: naam.charAt(0).toUpperCase() + naam.slice(1), regio: "", opdrachtgever: "Stedin / FUES", adressen };
            // Mergen: huidige slice ophalen, nieuw project erbij, terugschrijven.
            const { data: rij } = await supabase.from("wire_state").select("data").eq("key", "buurtaanpak").maybeSingle();
            const huidig = Array.isArray(rij?.data) ? rij.data : [];
            await supabase.from("wire_state").upsert({ key: "buurtaanpak", data: [nieuw, ...huidig], updated_at: new Date().toISOString() }, { onConflict: "key" });
            console.log(`✓ ${bijlage.filename}: buurtaanpak "${nieuw.naam}" met ${adressen.length} adressen toegevoegd`);
            verwerkt++;
          } else {
            console.log(`? ${bijlage.filename}: type niet herkend (kop: ${(rijen[0] || []).join(" | ").slice(0, 80)})`);
          }
        } catch (e) {
          console.log(`! ${bijlage.filename}: ${e.message}`);
        }
      }
      // Mail als gelezen markeren zodat 'ie niet opnieuw verwerkt wordt.
      await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  console.log(`Klaar. ${verwerkt} bijlage(n) verwerkt.`);
}

main().catch((e) => { console.error("Fout:", e); process.exit(1); });
