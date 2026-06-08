import { useState } from "react";
import {
  Mic,
  Volume2,
  Languages,
  MessageCircle,
  Bell,
  Send,
  Bot,
  Plus,
  Trash2,
  Phone,
  ArrowRightLeft,
  CheckCircle2,
  X,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { Keuze } from "../components/Keuze";
import { Card } from "../components/ui";
import { adresVanAfspraak, datumLabel } from "../lib/afspraak";
import {
  TALEN,
  NL,
  vertaalTekst,
  sprekenUit,
  waUrl,
  smsUrl,
  vulSjabloon,
} from "../lib/communicatie";
import type { Afspraak, FaqItem } from "../lib/types";

const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

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

// ── Tab 2: WhatsApp & SMS ──
type Kanaal = "wa" | "sms";

// Stuurt de geselecteerde berichten één voor één (gepersonaliseerd) — met voortgang.
function VerstuurWachtrij({
  lijst,
  kanaal,
  berichtVoor,
  onSluit,
}: {
  lijst: Afspraak[];
  kanaal: Kanaal;
  berichtVoor: (a: Afspraak) => string;
  onSluit: () => void;
}) {
  const [i, setI] = useState(0);
  const klaar = i >= lijst.length;
  const a = lijst[i];
  const openHuidige = () => {
    const url = kanaal === "wa" ? waUrl(a.telefoon, berichtVoor(a)) : smsUrl(a.telefoon, berichtVoor(a));
    window.open(url, "_blank");
    setI((n) => n + 1);
  };
  const pct = Math.round((Math.min(i, lijst.length) / lijst.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onSluit} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink-900">{kanaal === "wa" ? "WhatsApp versturen" : "SMS versturen"}</h3>
          <button type="button" onClick={onSluit} className="text-ink-400 hover:text-ink-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-4">
          <div className="mb-1 text-xs text-ink-500">{Math.min(i, lijst.length)} / {lijst.length} geopend</div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} /></div>
        </div>
        {klaar ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
            <p className="text-sm text-ink-700">Alle {lijst.length} berichten zijn geopend om te versturen.</p>
            <button type="button" onClick={onSluit} className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Klaar</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-ink-200 p-3">
              <div className="text-sm font-semibold text-ink-900">{a.klantNaam || "Klant"}</div>
              <div className="text-xs text-ink-500">{adresVanAfspraak(a)} · {a.telefoon || "geen nummer"}</div>
              <div className="mt-2 rounded bg-ink-50 p-2 text-xs text-ink-600">{berichtVoor(a)}</div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={openHuidige} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700">
                {kanaal === "wa" ? <MessageCircle className="h-4 w-4" /> : <Phone className="h-4 w-4" />} Openen & volgende
              </button>
              <button type="button" onClick={() => setI((n) => n + 1)} className="rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-50">Overslaan</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Berichten() {
  const { afspraken, comm, currentUser, updateComm } = useApp();
  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer";
  const mijn = isLeiding ? afspraken : afspraken.filter((a) => a.toegewezenAan === currentUser?.id);

  const locaties = [...new Set(mijn.map((a) => a.locatie))];
  const [locatie, setLocatie] = useState(locaties[0] ?? "");
  const [periode, setPeriode] = useState<"vandaag" | "week" | "alles">("week");
  const [type, setType] = useState<"herinnering" | "bevestiging" | "status">("herinnering");
  const [x, setX] = useState("5");
  const [y, setY] = useState("7");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [wachtrij, setWachtrij] = useState<{ kanaal: Kanaal; lijst: Afspraak[] } | null>(null);

  const velden = (af: Afspraak) => ({
    klant: af.klantNaam || "klant", datum: af.datum ? datumLabel(af.datum) : "", tijd: af.tijd || "",
    adres: adresVanAfspraak(af), x, y,
  });
  const sjabloon = type === "bevestiging" ? comm.sjabloonBevestiging : type === "herinnering" ? comm.sjabloonHerinnering : comm.sjabloonStatus;
  const berichtVoor = (af: Afspraak) => vulSjabloon(sjabloon, velden(af));

  const vandaagISO = new Date().toISOString().slice(0, 10);
  const overWeek = new Date(Date.now() + 7 * 86400000);
  const inPeriode = (af: Afspraak) => {
    if (periode === "alles") return true;
    if (!af.datum) return false;
    if (periode === "vandaag") return af.datum === vandaagISO;
    const d = new Date(`${af.datum}T${af.tijd || "12:00"}`);
    return d >= new Date(vandaagISO + "T00:00") && d <= overWeek;
  };

  const adressen = mijn.filter((a) => a.locatie === locatie && inPeriode(a));
  const alleGeselecteerd = adressen.length > 0 && adressen.every((a) => sel.has(a.id));
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAlle = () => setSel(alleGeselecteerd ? new Set() : new Set(adressen.map((a) => a.id)));
  const geselecteerd = adressen.filter((a) => sel.has(a.id));

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-brand-600" />
            <h3 className="text-sm font-bold text-ink-900">Herinneringen versturen per project</h3>
          </div>
          {isLeiding && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-600">
              <input type="checkbox" checked={comm.herinneringAan} onChange={(e) => updateComm({ herinneringAan: e.target.checked })} className="h-4 w-4 accent-brand-600" />
              Automatische 24u-herinnering {comm.herinneringAan ? "aan" : "uit"}
            </label>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Project / locatie</label>
            <Keuze value={locatie} onChange={(w) => { setLocatie(w); setSel(new Set()); }} opties={locaties.length === 0 ? [{ waarde: "", label: "Geen projecten" }] : locaties.map((l) => ({ waarde: l, label: l }))} title="Project" />
          </div>
          <div>
            <label className={labelCls}>Periode</label>
            <div className="flex gap-1.5">
              {([["vandaag", "Vandaag"], ["week", "Deze week"], ["alles", "Alles"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => { setPeriode(k); setSel(new Set()); }} className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold ${periode === k ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Soort bericht</label>
            <div className="flex gap-1.5">
              {([["herinnering", "Herinner."], ["bevestiging", "Bevestig."], ["status", "Status"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setType(k)} className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold ${type === k ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {type === "status" && (
          <div className="flex items-end gap-2">
            <div><label className={labelCls}>Gesproken</label><input value={x} onChange={(e) => setX(e.target.value)} inputMode="numeric" className="w-20 rounded-lg border border-ink-200 px-3 py-2 text-sm" /></div>
            <span className="pb-2 text-ink-400">van</span>
            <div><label className={labelCls}>Totaal buren</label><input value={y} onChange={(e) => setY(e.target.value)} inputMode="numeric" className="w-20 rounded-lg border border-ink-200 px-3 py-2 text-sm" /></div>
          </div>
        )}

        {/* Selecteerbare adressen */}
        <div className="rounded-xl border border-ink-200">
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
              <input type="checkbox" checked={alleGeselecteerd} onChange={toggleAlle} className="h-4 w-4 accent-brand-600" />
              {sel.size > 0 ? `${sel.size} geselecteerd` : "Alles selecteren"}
            </label>
            <span className="text-xs text-ink-400">{adressen.length} adres{adressen.length === 1 ? "" : "sen"}</span>
          </div>
          <div className="scrollbar-thin max-h-64 divide-y divide-ink-100 overflow-y-auto">
            {adressen.length === 0 ? (
              <p className="p-4 text-center text-sm text-ink-400">Geen adressen voor deze periode.</p>
            ) : (
              adressen.map((a) => (
                <label key={a.id} className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${sel.has(a.id) ? "bg-brand-50" : "hover:bg-ink-50"}`}>
                  <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} className="h-4 w-4 accent-brand-600" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-900">{a.klantNaam || "—"} · {a.straat} {a.huisnummer}</div>
                    <div className="text-xs text-ink-500">{a.datum ? datumLabel(a.datum) : "geen datum"}{a.tijd ? ` om ${a.tijd}` : ""} · {a.telefoon || "geen nummer"}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={sel.size === 0} onClick={() => setWachtrij({ kanaal: "wa", lijst: geselecteerd })} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
            <MessageCircle className="h-4 w-4" /> WhatsApp ({sel.size})
          </button>
          <button type="button" disabled={sel.size === 0} onClick={() => setWachtrij({ kanaal: "sms", lijst: geselecteerd })} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40">
            <Phone className="h-4 w-4" /> SMS ({sel.size})
          </button>
        </div>
        <p className="text-xs text-ink-400">
          Elk bericht wordt gepersonaliseerd geopend om te versturen. Volledig automatisch (zonder tikken) kan met de WhatsApp Business-API in de cloud-fase.
        </p>
      </Card>

      {/* Sjablonen (leiding) */}
      {isLeiding && (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-bold text-ink-900">Sjablonen</h3>
          <p className="text-xs text-ink-500">Gebruik {"{klant} {datum} {tijd} {adres} {x} {y}"} als invulvelden.</p>
          <div><label className={labelCls}>Bevestiging</label><textarea value={comm.sjabloonBevestiging} onChange={(e) => updateComm({ sjabloonBevestiging: e.target.value })} rows={2} className={veld + " resize-none"} /></div>
          <div><label className={labelCls}>Herinnering</label><textarea value={comm.sjabloonHerinnering} onChange={(e) => updateComm({ sjabloonHerinnering: e.target.value })} rows={2} className={veld + " resize-none"} /></div>
          <div><label className={labelCls}>Statusupdate</label><textarea value={comm.sjabloonStatus} onChange={(e) => updateComm({ sjabloonStatus: e.target.value })} rows={2} className={veld + " resize-none"} /></div>
        </Card>
      )}

      {wachtrij && (
        <VerstuurWachtrij lijst={wachtrij.lijst} kanaal={wachtrij.kanaal} berichtVoor={berichtVoor} onSluit={() => setWachtrij(null)} />
      )}
    </div>
  );
}

// ── Tab 3: AI-chat & FAQ ──
function zoekAntwoord(vraag: string, faq: FaqItem[]): FaqItem | null {
  const woorden = vraag.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  let best: FaqItem | null = null;
  let score = 0;
  for (const f of faq) {
    const fw = f.vraag.toLowerCase();
    const s = woorden.filter((w) => fw.includes(w)).length;
    if (s > score) { score = s; best = f; }
  }
  return score > 0 ? best : null;
}

function AiChat() {
  const { comm, currentUser, updateComm } = useApp();
  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer";
  const [berichten, setBerichten] = useState<{ van: "klant" | "bot"; tekst: string; door?: boolean }[]>([
    { van: "bot", tekst: "Hallo! Ik ben de assistent van Wire Solutions. Waarmee kan ik u helpen?" },
  ]);
  const [invoer, setInvoer] = useState("");
  const [nieuwV, setNieuwV] = useState("");
  const [nieuwA, setNieuwA] = useState("");

  const stuur = (tekst: string) => {
    if (!tekst.trim()) return;
    const match = zoekAntwoord(tekst, comm.faq);
    const antwoord = match
      ? match.antwoord
      : `Daar kan ik u helaas niet direct mee helpen. Ik verbind u door met onze planner.`;
    setBerichten((b) => [...b, { van: "klant", tekst }, { van: "bot", tekst: antwoord, door: !match }]);
    setInvoer("");
  };

  const voegFaqToe = () => {
    if (!nieuwV.trim() || !nieuwA.trim()) return;
    updateComm({ faq: [...comm.faq, { id: "fq-" + Date.now(), vraag: nieuwV.trim(), antwoord: nieuwA.trim() }] });
    setNieuwV(""); setNieuwA("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Chat */}
      <Card className="flex flex-col p-0">
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
          <Bot className="h-5 w-5 text-brand-600" />
          <span className="text-sm font-bold text-ink-900">AI-chat (voorbeeld)</span>
        </div>
        <div className="scrollbar-thin h-80 space-y-2.5 overflow-y-auto p-4">
          {berichten.map((m, i) => (
            <div key={i} className={`flex ${m.van === "klant" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.van === "klant" ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-800"}`}>
                {m.tekst}
                {m.door && (
                  <a href={waUrl(comm.fallbackTelefoon, "Hallo, ik heb een vraag over mijn afspraak.")} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-700">
                    <Phone className="h-3.5 w-3.5" /> Doorschakelen naar planner: {comm.fallbackTelefoon}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-ink-100 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {comm.faq.slice(0, 3).map((f) => (
              <button key={f.id} type="button" onClick={() => stuur(f.vraag)} className="rounded-full bg-ink-100 px-2.5 py-1 text-xs text-ink-600 hover:bg-ink-200">{f.vraag}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={invoer} onChange={(e) => setInvoer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && stuur(invoer)} placeholder="Typ een vraag…" className={veld} />
            <button type="button" onClick={() => stuur(invoer)} className="rounded-lg bg-brand-600 px-3.5 py-2 text-white hover:bg-brand-700" title="Versturen">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* FAQ + doorschakeling */}
      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-bold text-ink-900">Doorschakelnummer (afspraakmaker)</h3>
          <p className="text-xs text-ink-500">Als de chat een vraag niet kan beantwoorden, wordt naar dit nummer doorgeschakeld.</p>
          <input value={comm.fallbackTelefoon} onChange={(e) => updateComm({ fallbackTelefoon: e.target.value })} disabled={!isLeiding} className={veld + (isLeiding ? "" : " bg-ink-50")} placeholder="06 …" />
        </Card>

        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-bold text-ink-900">Standaardvragen</h3>
          {comm.faq.map((f) => (
            <div key={f.id} className="rounded-lg border border-ink-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-900">{f.vraag}</div>
                  <div className="text-xs text-ink-500">{f.antwoord}</div>
                </div>
                {isLeiding && (
                  <button type="button" onClick={() => updateComm({ faq: comm.faq.filter((x) => x.id !== f.id) })} className="shrink-0 rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {isLeiding && (
            <div className="space-y-2 border-t border-ink-100 pt-3">
              <input value={nieuwV} onChange={(e) => setNieuwV(e.target.value)} placeholder="Nieuwe vraag" className={veld} />
              <textarea value={nieuwA} onChange={(e) => setNieuwA(e.target.value)} placeholder="Antwoord" rows={2} className={veld + " resize-none"} />
              <button type="button" onClick={voegFaqToe} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                <Plus className="h-4 w-4" /> Vraag toevoegen
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Hoofdcomponent ──
export function Communicatie() {
  const [tab, setTab] = useState<"vertaling" | "berichten" | "chat">("vertaling");
  const tabs = [
    { key: "vertaling", label: "Live vertaling", icon: Languages },
    { key: "berichten", label: "WhatsApp & SMS", icon: MessageCircle },
    { key: "chat", label: "AI-chat & FAQ", icon: Bot },
  ] as const;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Communicatie</h2>
        <p className="text-sm text-ink-500">Live vertaling aan de deur, WhatsApp/SMS naar klanten en een AI-chat met doorschakeling.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-ink-200">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "vertaling" && <LiveVertaling />}
      {tab === "berichten" && <Berichten />}
      {tab === "chat" && <AiChat />}
    </div>
  );
}
