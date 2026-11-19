// "Morgen bellen": alle adressen van Saneren waarvan de uitvoering morgen is, onder één kopje, zodat
// iemand op kantoor ze een dag van tevoren kan nabellen. Op vrijdag staan ook de afspraken van
// zaterdag t/m maandag erbij. Het vinkje "gebeld" onthoudt dit apparaat.
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Phone, PhoneCall } from "lucide-react";
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

type Regel = { adres: FlowAdres; datum: string; dossier: Dossier };
const GEBELD_KEY = "wire.saneren.gebeld";
const leesGebeld = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(GEBELD_KEY) ?? "{}"); } catch { return {}; } };

export function SaneerBellijstMorgen({ dossiers }: { dossiers: Dossier[] }) {
  const dagen = useMemo(() => belDagen(), []);
  const [regels, setRegels] = useState<Regel[] | null>(null);
  const [gebeld, setGebeld] = useState<Record<string, string>>(leesGebeld);

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
        const raak = [...datumVan.values()].some((x) => dagen.includes(x)) || (!detail.clusters.length && dagen.includes(d.uitvoering_van));
        if (!raak) continue;
        const { adressen } = await haalFlowAdressen(d.pd_nummer);
        for (const a of adressen) {
          const datum = datumVan.get(a.cluster_id) || d.uitvoering_van;
          if (dagen.includes(datum)) uit.push({ adres: a, datum, dossier: d });
        }
      }
      uit.sort((a, b) => a.datum.localeCompare(b.datum) || `${a.adres.straat} ${a.adres.huisnummer}`.localeCompare(`${b.adres.straat} ${b.adres.huisnummer}`, "nl", { numeric: true }));
      if (!weg) setRegels(uit);
    })();
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel]);

  const zetGebeld = (id: string, aan: boolean) => {
    setGebeld((g) => {
      const n = { ...g };
      if (aan) n[id] = new Date().toISOString(); else delete n[id];
      try { localStorage.setItem(GEBELD_KEY, JSON.stringify(n)); } catch { /* */ }
      return n;
    });
  };

  const aantalGebeld = (regels ?? []).filter((r) => gebeld[r.adres.id]).length;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-brand-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-5 w-5 text-brand-600" />
          <div>
            <h3 className="text-sm font-bold text-ink-900">Morgen bellen</h3>
            <p className="text-xs text-ink-600">Afspraken van {dagen.length > 1 ? `${dagLang(dagen[0])} t/m ${dagLang(dagen[dagen.length - 1])}` : dagLang(dagen[0])} — een dag van tevoren nabellen.</p>
          </div>
        </div>
        {regels && regels.length > 0 && <span className="text-xs font-semibold text-ink-600">{aantalGebeld} van {regels.length} gebeld</span>}
      </div>
      {regels === null ? (
        <div className="flex items-center gap-2 px-4 py-4 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /> Afspraken van morgen ophalen…</div>
      ) : regels.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-500">Er staan morgen geen afspraken voor saneren.</p>
      ) : (
        <div className="divide-y divide-ink-100">
          {regels.map(({ adres: a, datum, dossier }) => {
            const klaar = !!gebeld[a.id];
            return (
              <div key={a.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 ${klaar ? "bg-green-50/60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-ink-900">{`${a.straat} ${a.huisnummer}${a.toevoeging ? ` ${a.toevoeging}` : ""}`}</div>
                  <div className="text-xs text-ink-500">{[a.bewoner, dossier.gebouw, dagen.length > 1 ? dagLang(datum) : ""].filter(Boolean).join(" · ")}</div>
                </div>
                {a.telefoon
                  ? <a href={`tel:${a.telefoon.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"><Phone className="h-4 w-4" /> {a.telefoon}</a>
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
  );
}
