import { useEffect, useState } from "react";
import { ShieldCheck, Trash2, CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import { Card, Bevestig } from "./ui";
import { sbBodemBewaartermijn, sbBodemAfronden, sbBodemWisGegevens, type BodemBewaartermijn } from "../lib/supabase";

// Bewaartermijn voor de persoonsgegevens van bewoners.
// ─────────────────────────────────────────────────────────────────────────────
// Naam, telefoonnummer en e-mailadres mogen niet langer bewaard worden dan nodig. "Nodig" loopt tot het
// onderzoek is uitgevoerd en verantwoord richting de opdrachtgever. Daarna wist de server ze vanzelf.
//
// Wat blijft staan: het adres, de uitkomst, de datum en het tijdblok. Daarmee kun je later nog
// verantwoorden wát er is afgesproken, zonder dat je nog weet wíé daar woonde.

const knop = "inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40";

const datumNL = (iso: string) => {
  if (!iso) return "";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${Number(d[2])}-${Number(d[1])}-${d[0]}` : iso;
};

export function BodemBewaartermijnKaart({ projectId, magWissen, aantalMetGegevens }: {
  projectId: string;
  magWissen: boolean;          // alleen de eigenaar en HR
  aantalMetGegevens: number;   // hoeveel adressen nog een naam of telefoonnummer hebben
}) {
  const [info, setInfo] = useState<BodemBewaartermijn | null>(null);
  const [bezig, setBezig] = useState(false);
  const [vraagWissen, setVraagWissen] = useState(false);
  const [melding, setMelding] = useState("");

  const laad = () => { void sbBodemBewaartermijn(projectId).then(setInfo); };
  useEffect(laad, [projectId]);

  const afronden = async (ongedaan: boolean) => {
    setBezig(true);
    setMelding("");
    try {
      const r = await sbBodemAfronden(projectId, ongedaan);
      if (!r.ok) setMelding(r.error ?? "Niet gelukt.");
      laad();
    } finally { setBezig(false); }
  };

  const wissen = async () => {
    setVraagWissen(false);
    setBezig(true);
    try {
      const r = await sbBodemWisGegevens(projectId);
      setMelding(r.ok
        ? `Gewist: ${r.adressen ?? 0} adressen en ${r.afspraken ?? 0} afspraken. Adres, uitkomst en tijdblok zijn bewaard.`
        : `Niet gelukt: ${r.error ?? "onbekende fout"}`);
      laad();
    } finally { setBezig(false); }
  };

  const afgerond = !!info?.afgerondOp;
  const gewist = !!info?.gewistOp;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
            <ShieldCheck className="h-4 w-4 text-ink-400" /> Persoonsgegevens
          </h3>
          <p className="text-sm text-ink-500">
            Namen en telefoonnummers van bewoners worden {info?.maanden ?? 6} maanden na afronding
            automatisch gewist. Adres, uitkomst en tijdblok blijven bewaard.
          </p>
        </div>
        {bezig && <Loader2 className="h-4 w-4 animate-spin text-ink-400" />}
      </div>

      <div className={`rounded-lg px-3 py-2 text-sm ${gewist ? "bg-green-50 text-green-800" : afgerond ? "bg-brand-50 text-brand-800" : "bg-ink-50 text-ink-600"}`}>
        {gewist ? (
          <>Persoonsgegevens zijn gewist op <span className="font-semibold">{datumNL(info!.gewistOp)}</span>.</>
        ) : afgerond ? (
          <>Project afgerond op <span className="font-semibold">{datumNL(info!.afgerondOp)}</span> — de gegevens
            worden automatisch gewist op <span className="font-semibold">{datumNL(info!.wistOp)}</span>.</>
        ) : (
          <>Dit project loopt nog. De bewaartermijn begint zodra je het afrondt.
            {aantalMetGegevens > 0 && ` Op dit moment staan er van ${aantalMetGegevens} adressen persoonsgegevens.`}</>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!afgerond ? (
          <button type="button" onClick={() => void afronden(false)} disabled={bezig} className={knop}>
            <CheckCircle2 className="h-4 w-4" /> Project afronden
          </button>
        ) : !gewist && (
          <button type="button" onClick={() => void afronden(true)} disabled={bezig} className={knop}>
            <RotateCcw className="h-4 w-4" /> Toch weer openzetten
          </button>
        )}
        {magWissen && aantalMetGegevens > 0 && (
          <button
            type="button"
            onClick={() => setVraagWissen(true)}
            disabled={bezig}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> Nu wissen
          </button>
        )}
      </div>

      {melding && <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">{melding}</div>}

      <Bevestig
        open={vraagWissen}
        titel="Persoonsgegevens wissen"
        tekst={`Van ${aantalMetGegevens} adressen worden de naam, het telefoonnummer en het e-mailadres definitief gewist. Het adres, de uitkomst, de datum en het tijdblok blijven staan, zodat je het werk kunt blijven verantwoorden. Dit kan niet ongedaan gemaakt worden.`}
        bevestigLabel="Definitief wissen"
        onBevestig={() => void wissen()}
        onAnnuleer={() => setVraagWissen(false)}
      />
    </Card>
  );
}
