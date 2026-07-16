import { useState } from "react";
import { Mic, Volume2, Languages, ArrowRightLeft } from "lucide-react";
import { Keuze } from "../components/Keuze";
import { Card } from "../components/ui";
import { TALEN, NL, vertaalTekst, sprekenUit } from "../lib/communicatie";

const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

/* eslint-disable @typescript-eslint/no-explicit-any */
function maakHerkenning(lang: string): any | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  return rec;
}

// ── Tab 1: Live vertaling ──
function LiveVertaling() {
  const [taalCode, setTaalCode] = useState(TALEN[0].code);
  const [nlTekst, setNlTekst] = useState("");
  const [klantTekst, setKlantTekst] = useState("");
  const [luistert, setLuistert] = useState<"nl" | "klant" | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const taal = TALEN.find((t) => t.code === taalCode)!;

  const ondersteund = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const luister = (bron: "nl" | "klant") => {
    setFout("");
    const rec = maakHerkenning(bron === "nl" ? NL.spraak : taal.spraak);
    if (!rec) {
      setFout("Spraakherkenning werkt het best in Chrome of Edge.");
      return;
    }
    setLuistert(bron);
    rec.onresult = async (e: any) => {
      const tekst = e.results[0][0].transcript as string;
      if (bron === "nl") setNlTekst(tekst);
      else setKlantTekst(tekst);
      await vertaal(bron, tekst);
    };
    rec.onerror = () => { setLuistert(null); setFout("Kon spraak niet herkennen — probeer opnieuw."); };
    rec.onend = () => setLuistert(null);
    rec.start();
  };

  const vertaal = async (bron: "nl" | "klant", tekstIn?: string) => {
    const bronTekst = bron === "nl" ? tekstIn ?? nlTekst : tekstIn ?? klantTekst;
    if (!bronTekst.trim()) return;
    setBezig(true);
    setFout("");
    try {
      if (bron === "nl") {
        const v = await vertaalTekst(bronTekst, "nl", taalCode);
        setKlantTekst(v);
        sprekenUit(v, taal.spraak);
      } else {
        const v = await vertaalTekst(bronTekst, taalCode, "nl");
        setNlTekst(v);
        sprekenUit(v, NL.spraak);
      }
    } catch {
      setFout("Vertalen lukte niet (controleer je internetverbinding).");
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Languages className="h-5 w-5 text-brand-600" />
          <span className="text-sm font-semibold text-ink-700">Taal van de klant</span>
          <div className="w-40"><Keuze value={taalCode} onChange={setTaalCode} opties={TALEN.map((t) => ({ waarde: t.code, label: t.label }))} title="Taal" /></div>
          {!ondersteund && <span className="text-xs text-amber-600">Spraak werkt het best in Chrome/Edge — typen kan altijd.</span>}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Nederlands */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink-900">🇳🇱 Nederlands (jij)</span>
            <button type="button" onClick={() => sprekenUit(nlTekst, NL.spraak)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" title="Voorlezen">
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
          <textarea value={nlTekst} onChange={(e) => setNlTekst(e.target.value)} rows={4} placeholder="Typ of spreek in het Nederlands…" className={veld + " resize-none"} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => luister("nl")} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${luistert === "nl" ? "bg-red-500 animate-pulse" : "bg-ink-800 hover:bg-ink-900"}`}>
              <Mic className="h-4 w-4" /> {luistert === "nl" ? "Luistert…" : "Spreek"}
            </button>
            <button type="button" onClick={() => vertaal("nl")} disabled={bezig} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              <ArrowRightLeft className="h-4 w-4" /> Vertaal voor klant
            </button>
          </div>
        </Card>

        {/* Klanttaal */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink-900">{taal.label} (klant)</span>
            <button type="button" onClick={() => sprekenUit(klantTekst, taal.spraak)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" title="Voorlezen">
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
          <textarea value={klantTekst} onChange={(e) => setKlantTekst(e.target.value)} rows={4} placeholder={`Typ of laat de klant spreken (${taal.label})…`} className={veld + " resize-none"} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => luister("klant")} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${luistert === "klant" ? "bg-red-500 animate-pulse" : "bg-ink-800 hover:bg-ink-900"}`}>
              <Mic className="h-4 w-4" /> {luistert === "klant" ? "Luistert…" : "Klant spreekt"}
            </button>
            <button type="button" onClick={() => vertaal("klant")} disabled={bezig} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              <ArrowRightLeft className="h-4 w-4" /> Vertaal naar Nederlands
            </button>
          </div>
        </Card>
      </div>

      {fout && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{fout}</div>}
      <p className="text-xs text-ink-400">
        Spraakherkenning en uitspreken werken in de browser. Het vertalen gebruikt nu een gratis vertaaldienst —
        in de cloud-fase vervangen we dit door Claude voor de beste kwaliteit.
      </p>
    </div>
  );
}

// ── Hoofdcomponent ──
export function Communicatie() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Communicatie</h2>
        <p className="text-sm text-ink-500">Live vertaling aan de deur — spreek en laat direct vertalen voor de bewoner.</p>
      </div>

      <LiveVertaling />
    </div>
  );
}
