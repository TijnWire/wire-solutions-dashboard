// "Vandaag bellen" en "Vandaag SMS versturen": alle adressen van Saneren waarvan de uitvoering morgen is.
// Iemand op kantoor belt ze vandaag na én stuurt ze vandaag een herinnerings-sms (altijd een dag van
// tevoren). Op vrijdag staan ook de afspraken van zaterdag t/m maandag erbij. De vinkjes "gebeld" en
// "verstuurd" onthoudt dit apparaat.
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, MessageSquare, Phone, PhoneCall } from "lucide-react";
import { Card } from "./ui";
import { haalDossier, type Dossier } from "../lib/saneerflow";
import { haalFlowAdressen, type FlowAdres } from "../lib/saneerflowWerk";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dagLang = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });

// De dag(en) die morgen gebeld moeten zijn: morgen, en op vrijdag tot en met maandag.
export function belDagen(vandaag = new Date()): string[] {
  const uit: string[] = [];
  const d = new Date(vandaag);
  do {
    d.setDate(d.getDate() + 1);
    uit.push(iso(d));
  } while (d.getDay() === 6 || d.getDay() === 0);
  return uit;
}

type Regel = { adres: FlowAdres; datum: string; tijd: string; dossier: Dossier };
const GEBELD_KEY = "wire.saneren.gebeld";
const SMS_KEY = "wire.saneren.sms";
const lees = (key: string): Record<string, string> => { try { return JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { return {}; } };
const adresTekst = (a: FlowAdres) => `${a.straat} ${a.huisnummer}${a.toevoeging ? ` ${a.toevoeging}` : ""}`;
const telLink = (t: string) => t.replace(/[^0-9+]/g, "");

// De herinnerings-sms voor één adres.
export function smsTekst(r: { adres: FlowAdres; datum: string; tijd: string }): string {
  const dag = new Date(r.datum + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  return `Beste bewoner, herinnering: ${dag}${r.tijd ? ` vanaf ${r.tijd.replace(":", ".")} uur` : ""} komen wij voor de werkzaamheden van Stedin op ${adresTekst(r.adres)}. Wilt u ervoor zorgen dat er iemand thuis is? Met vriendelijke groet, Wire Solutions`;
}

export function SaneerBellijstMorgen({ dossiers }: { dossiers: Dossier[] }) {
  const dagen = useMemo(() => belDagen(), []);
  const [regels, setRegels] = useState<Regel[] | null>(null);
  const [gebeld, setGebeld] = useState<Record<string, string>>(() => lees(GEBELD_KEY));
  const [verstuurd, setVerstuurd] = useState<Record<string, string>>(() => lees(SMS_KEY));
  const [gekopieerd, setGekopieerd] = useState(false);

  // Alleen dossiers waarvan de uitvoering rond die dagen valt.
  const kandidaten = useMemo(
    () => dossiers.filter((d) => d.status !== "afgerond" && d.status !== "afgeboekt" &&
      dagen.some((dag) => (!d.uitvoering_van || d.uitvoering_van <= dag) && (!d.uitvoering_tot || d.uitvoering_tot >= dag))),
    [dossiers, dagen],
  );
  const sleutel = kandidaten.map((d) => d.pd_nummer).join(",");

  useEffect(() => {
    let weg = false;
    void (async () => {
      const uit: Regel[] = [];
      for (const d of kandidaten) {
        const detail = await haalDossier(d.pd_nummer);
        if (!detail) continue;
        // De dag per groep (definitieve datum), anders de uitvoeringsdag van het hele dossier.
        const datumVan = new Map(detail.clusters.map((k) => [k.id, k.definitieve_datum || d.uitvoering_van]));
        const tijdVan = new Map<string, string>(detail.clusters.map((k) => [k.id, (k as { starttijd?: string }).starttijd || ""]));
        const raak = [...datumVan.values()].some((x) => dagen.includes(x)) || (!detail.clusters.length && dagen.includes(d.uitvoering_van));
        if (!raak) continue;
        const { adressen } = await haalFlowAdressen(d.pd_nummer);
        for (const a of adressen) {
          if (a.verwijderd) continue;
          const datum = datumVan.get(a.cluster_id) || d.uitvoering_van;
          if (dagen.includes(datum)) uit.push({ adres: a, datum, tijd: tijdVan.get(a.cluster_id) ?? "", dossier: d });
        }
      }
      uit.sort((a, b) => a.datum.localeCompare(b.datum) || adresTekst(a.adres).localeCompare(adresTekst(b.adres), "nl", { numeric: true }));
      if (!weg) setRegels(uit);
    })();
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel]);

  const zet = (key: string, set: typeof setGebeld) => (id: string, aan: boolean) => {
    set((g) => {
      const n = { ...g };
      if (aan) n[id] = new Date().toISOString(); else delete n[id];
      try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* */ }
      return n;
    });
  };
  const zetGebeld = zet(GEBELD_KEY, setGebeld);
  const zetVerstuurd = zet(SMS_KEY, setVerstuurd);

  const periode = dagen.length > 1 ? `${dagLang(dagen[0])} t/m ${dagLang(dagen[dagen.length - 1])}` : dagLang(dagen[0]);
  const lijst = regels ?? [];
  const metNummer = lijst.filter((r) => r.adres.telefoon);

  const kopieerNummers = async () => {
    const nummers = [...new Set(metNummer.filter((r) => !verstuurd[r.adres.id]).map((r) => telLink(r.adres.telefoon)))].join("\n");
    try { await navigator.clipboard.writeText(nummers); setGekopieerd(true); setTimeout(() => setGekopieerd(false), 2000); } catch { /* */ }
  };

  const regelKop = (a: FlowAdres, dossier: Dossier, datum: string, tijd: string) => (
    <div className="min-w-0 flex-1">
      <div className="text-sm font-bold text-ink-900">{adresTekst(a)}</div>
      <div className="text-xs text-ink-500">{[a.bewoner, dossier.gebouw, dagen.length > 1 ? dagLang(datum) : "", tijd ? `${tijd.replace(":", ".")} uur` : ""].filter(Boolean).join(" · ")}</div>
    </div>
  );

  const laden = (tekst: string) => <div className="flex items-center gap-2 px-4 py-4 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /> {tekst}</div>;
  const leeg = <p className="px-4 py-4 text-sm text-ink-500">Er staan morgen geen afspraken voor saneren.</p>;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* Vandaag bellen */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-brand-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-brand-600" />
            <div>
              <h3 className="text-sm font-bold text-ink-900">Vandaag bellen</h3>
              <p className="text-xs text-ink-600">Afspraken van {periode} — vandaag nabellen.</p>
            </div>
          </div>
          {lijst.length > 0 && <span className="text-xs font-semibold text-ink-600">{lijst.filter((r) => gebeld[r.adres.id]).length} van {lijst.length} gebeld</span>}
        </div>
        {regels === null ? laden("Afspraken van morgen ophalen…") : lijst.length === 0 ? leeg : (
          <div className="divide-y divide-ink-100">
            {lijst.map(({ adres: a, datum, tijd, dossier }) => {
              const klaar = !!gebeld[a.id];
              return (
                <div key={a.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 ${klaar ? "bg-green-50/60" : ""}`}>
                  {regelKop(a, dossier, datum, tijd)}
                  {a.telefoon
                    ? <a href={`tel:${telLink(a.telefoon)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"><Phone className="h-4 w-4" /> {a.telefoon}</a>
                    : <span className="text-xs font-semibold text-amber-700">geen nummer</span>}
                  <button type="button" onClick={() => zetGebeld(a.id, !klaar)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${klaar ? "bg-green-600 text-white" : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}>
                    <Check className="h-4 w-4" /> {klaar ? "Gebeld" : "Gebeld?"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Vandaag SMS versturen */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-sky-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-sky-600" />
            <div>
              <h3 className="text-sm font-bold text-ink-900">Vandaag SMS versturen</h3>
              <p className="text-xs text-ink-600">Herinnering voor {periode} — altijd een dag van tevoren.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {metNummer.length > 0 && <span className="text-xs font-semibold text-ink-600">{metNummer.filter((r) => verstuurd[r.adres.id]).length} van {metNummer.length} verstuurd</span>}
            {metNummer.some((r) => !verstuurd[r.adres.id]) && (
              <button type="button" onClick={kopieerNummers} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50">
                <Copy className="h-3.5 w-3.5" /> {gekopieerd ? "Gekopieerd" : "Nummers kopiëren"}
              </button>
            )}
          </div>
        </div>
        {regels === null ? laden("Afspraken van morgen ophalen…") : lijst.length === 0 ? leeg : (
          <div className="divide-y divide-ink-100">
            {lijst.map((r) => {
              const { adres: a, datum, tijd, dossier } = r;
              const klaar = !!verstuurd[a.id];
              return (
                <div key={a.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 ${klaar ? "bg-green-50/60" : ""}`}>
                  {regelKop(a, dossier, datum, tijd)}
                  {a.telefoon ? (
                    <>
                      <a href={`sms:${telLink(a.telefoon)}?&body=${encodeURIComponent(smsTekst(r))}`} onClick={() => zetVerstuurd(a.id, true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50">
                        <MessageSquare className="h-4 w-4" /> SMS {a.telefoon}
                      </a>
                      <button type="button" onClick={() => zetVerstuurd(a.id, !klaar)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${klaar ? "bg-green-600 text-white" : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}>
                        <Check className="h-4 w-4" /> {klaar ? "Verstuurd" : "Verstuurd?"}
                      </button>
                    </>
                  ) : <span className="text-xs font-semibold text-amber-700">geen nummer</span>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
