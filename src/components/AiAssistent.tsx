import { useMemo, useRef, useState, useEffect } from "react";
import { Sparkles, X, Send, Loader2, ArrowRight, Bot } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { NAV, magZien } from "../lib/nav";
import { vraagAssistent, aiResterend, AI_CAP_PER_DAG, type ChatBericht, type Pagina } from "../lib/ai";

// Zwevende AI-assistent: stel een vraag → de bot navigeert je naar de juiste pagina of stelt een
// verduidelijkende vraag. Kostenbewust: goedkoop model + harde dag-cap (zie lib/ai.ts).
export function AiAssistent() {
  const { currentUser, instellingen } = useApp();
  const { navigeer } = useNav();
  const [open, setOpen] = useState(false);
  const [invoer, setInvoer] = useState("");
  const [berichten, setBerichten] = useState<ChatBericht[]>([]);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [resterend, setResterend] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const apiKey = instellingen.claudeKey ?? "";
  const paginas: Pagina[] = useMemo(
    () => (currentUser ? NAV.filter((n) => magZien(currentUser, n)).map((n) => ({ key: n.key, label: n.label, groep: n.group })) : []),
    [currentUser]
  );

  useEffect(() => { if (currentUser) setResterend(aiResterend(currentUser.id)); }, [currentUser, open]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [berichten, bezig]);

  if (!currentUser) return null;

  const verstuur = async () => {
    const tekst = invoer.trim();
    if (!tekst || bezig) return;
    const nieuw: ChatBericht[] = [...berichten, { rol: "user", tekst }];
    setBerichten(nieuw);
    setInvoer("");
    setFout("");
    setBezig(true);
    const res = await vraagAssistent(apiKey, paginas, nieuw, currentUser.id);
    setBezig(false);
    setResterend(aiResterend(currentUser.id));
    if (res.soort === "navigatie") {
      const label = paginas.find((p) => p.key === res.navKey)?.label ?? res.navKey;
      setBerichten([...nieuw, { rol: "assistant", tekst: `Ik breng je naar ${label}. ${res.uitleg}` }]);
      navigeer(res.navKey);
    } else if (res.soort === "vraag") {
      setBerichten([...nieuw, { rol: "assistant", tekst: res.vraag }]);
    } else {
      setFout(res.fout);
    }
  };

  return (
    <>
      {/* Zwevende knop */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-cardhover transition hover:bg-brand-700 sm:bottom-6 sm:right-6"
          title="AI-assistent"
          aria-label="AI-assistent openen"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Chatpaneel */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:bottom-6 sm:right-6">
          <div className="mx-auto flex h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-ink-200 bg-white shadow-cardhover sm:h-[32rem] sm:rounded-2xl">
            <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><Sparkles className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink-900">AI-assistent</div>
                <div className="text-[11px] text-ink-400">Nog {resterend} van {AI_CAP_PER_DAG} vandaag</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" title="Sluiten" aria-label="Sluiten"><X className="h-5 w-5" /></button>
            </div>

            <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
              {berichten.length === 0 && (
                <div className="rounded-xl bg-ink-50 p-3 text-sm text-ink-600">
                  <p className="flex items-center gap-1.5 font-semibold text-ink-800"><Bot className="h-4 w-4 text-brand-600" /> Waar kan ik je heen brengen?</p>
                  <p className="mt-1 text-xs text-ink-500">Stel een vraag zoals <span className="italic">"waar maak ik een factuur?"</span> of <span className="italic">"laat de openstaande verlofaanvragen zien"</span>. Ik breng je naar de juiste pagina.</p>
                </div>
              )}
              {berichten.map((m, i) => (
                <div key={i} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.rol === "user" ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-800"}`}>{m.tekst}</div>
                </div>
              ))}
              {bezig && <div className="flex justify-start"><div className="inline-flex items-center gap-2 rounded-2xl bg-ink-100 px-3.5 py-2 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /> Aan het nadenken…</div></div>}
              {fout && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{fout}</div>}
              {!apiKey && (
                <button type="button" onClick={() => { setOpen(false); navigeer("instellingen"); }} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                  Stel eerst de Claude-sleutel in bij Instellingen <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="border-t border-ink-100 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={invoer}
                  onChange={(e) => setInvoer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void verstuur(); }}
                  disabled={bezig || resterend <= 0 || !apiKey}
                  placeholder={resterend <= 0 ? "Dag-limiet bereikt" : "Stel je vraag…"}
                  className="min-w-0 flex-1 rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50"
                />
                <button type="button" onClick={() => void verstuur()} disabled={bezig || resterend <= 0 || !apiKey || !invoer.trim()} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40" title="Versturen" aria-label="Versturen"><Send className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
