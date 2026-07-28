import { useMemo, useState } from "react";
import { Users, Wand2, CalendarRange, MapPin, RotateCcw, Check, Clock, Loader2 } from "lucide-react";
import { Card } from "./ui";
import { verdeelOverTeam, dagenVanVenster, dagLabel, voortgangVan, sorteerRoute, TIJDSLOTS, STANDAARD_WERKDAGEN, DAGNAMEN } from "../lib/bodemonderzoek";
import { sbBodemPlanning } from "../lib/supabase";
import type { TauwAdres, TauwOpdracht, TauwSlot, User } from "../lib/types";

// Voorbereiding van een bodemonderzoek-ronde, voor de beheerder.
// ─────────────────────────────────────────────────────────────────────────────
// Hier zet de beheerder klaar wat het personeel aan de deur nodig heeft: van wie de opdracht komt,
// binnen welke periode bewoners een moment mogen kiezen, wie er meelopen, en wie welke adressen doet.
// Het verdelen gebeurt op looproute (postcode → straat → huisnummers), waarbij een straat nooit over
// twee mensen wordt gesplitst — zie lib/bodemonderzoek.ts.

const knopKlein = "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40";
const knopPrimair = "inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40";

// ── Het resultaat van de ronde ── de scheiding waar het om draait: wie wil erbij zijn (en wanneer),
// en bij wie mag de aannemer zo de tuin in. Voor de beheerder, om de aannemer mee aan te sturen.
export function BodemAfspraken({ opdracht, users }: { opdracht: TauwOpdracht; users: User[] }) {
  const [tab, setTab] = useState<"ja" | "nee" | "open">("ja");
  const naamVan = (id?: string) => (id ? users.find((u) => u.id === id)?.naam ?? "Onbekend" : "—");

  const ja = opdracht.adressen
    .filter((a) => a.afgerond && a.aanwezig === "ja")
    .sort((a, b) => (a.datum + (a.tijdslot ?? "")).localeCompare(b.datum + (b.tijdslot ?? "")));
  const nee = opdracht.adressen.filter((a) => a.afgerond && a.aanwezig === "nee");
  const open = opdracht.adressen.filter((a) => !a.afgerond);

  const lijst = tab === "ja" ? ja : tab === "nee" ? nee : open;
  const tabs: { key: typeof tab; label: string; n: number }[] = [
    { key: "ja", label: "Wil erbij zijn", n: ja.length },
    { key: "nee", label: "Hoeft niet", n: nee.length },
    { key: "open", label: "Nog langs", n: open.length },
  ];

  if (!opdracht.adressen.length) return null;

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-bold text-ink-900">Uitkomst van de ronde</h3>
      <div className="flex gap-1.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-brand-600 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"
            }`}
          >
            {t.label} <span className={tab === t.key ? "text-white/80" : "text-ink-400"}>{t.n}</span>
          </button>
        ))}
      </div>

      {lijst.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-400">
          {tab === "ja" ? "Nog niemand heeft aangegeven erbij te willen zijn." : tab === "nee" ? "Nog niemand afgevinkt zonder afspraak." : "Alle adressen zijn langsgeweest. 🎉"}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200">
          {lijst.map((a, i) => (
            <div key={a.id} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm ${i % 2 ? "bg-ink-50/50" : ""}`}>
              <div className="min-w-0">
                <div className="truncate font-medium text-ink-800">{`${a.straat} ${a.huisnummer}`.trim()}</div>
                <div className="truncate text-xs text-ink-500">
                  {[a.plaats, a.bewoner, a.telefoon].filter(Boolean).join(" · ") || "geen gegevens"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {tab === "ja" && a.datum && (
                  <div className="font-semibold text-green-700">{dagLabel(a.datum)} · {a.tijdslot?.replace("-", " – ")}</div>
                )}
                {tab === "open" && a.geenGehoor && <div className="text-amber-700">niet thuis ({a.pogingen ?? 1}×)</div>}
                <div className="text-xs text-ink-400">{naamVan(a.toegewezenAan)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function BodemPlanning({ opdracht, users, onWijzig, deel = "alles" }: {
  opdracht: TauwOpdracht;
  users: User[];
  onWijzig: (patch: Partial<TauwOpdracht>) => void;
  // De pagina toont per stap maar één ding: "instellen" is de periode en de tijdblokken,
  // "verdelen" is het team en de verdeling over de medewerkers.
  deel?: "alles" | "instellen" | "verdelen";
}) {
  const toonInstellen = deel === "alles" || deel === "instellen";
  const toonVerdelen = deel === "alles" || deel === "verdelen";
  const [maxPer, setMaxPer] = useState<string>("");
  const [locaties, setLocaties] = useState<Set<string>>(new Set()); // leeg = alle locaties
  const [melding, setMelding] = useState("");
  const [serverBezig, setServerBezig] = useState(false);
  const [serverFout, setServerFout] = useState("");

  const team = opdracht.team ?? [];
  const venster = opdracht.venster;
  const dagen = useMemo(() => dagenVanVenster(venster), [venster]);
  const werkdagen = venster?.werkdagen?.length ? venster.werkdagen : STANDAARD_WERKDAGEN;
  const sloten: TauwSlot[] = venster?.sloten?.length ? venster.sloten : TIJDSLOTS.map((slot): TauwSlot => ({ slot, actief: true }));

  // Elke wijziging aan de planning gaat óók naar de server: die bewaakt bij het boeken de capaciteit,
  // en mag daarvoor niet afgaan op wat een telefoon meestuurt.
  const zetVenster = (patch: Partial<NonNullable<TauwOpdracht["venster"]>>) => {
    const v = { start: venster?.start ?? "", weken: venster?.weken ?? 2, ...venster, ...patch };
    onWijzig({ venster: v });
    setServerBezig(true);
    void sbBodemPlanning(opdracht.id, {
      periodeStart: v.start || undefined,
      periodeEind: v.eind || (dagenVanVenster(v).slice(-1)[0] ?? undefined),
      werkdagen: v.werkdagen?.length ? v.werkdagen : STANDAARD_WERKDAGEN,
      sloten: (v.sloten?.length ? v.sloten : TIJDSLOTS.map((slot): TauwSlot => ({ slot, actief: true }))).map((x) => ({ slot: x.slot, actief: x.actief !== false, max: x.max })),
    }).then((r) => { setServerFout(r.ok ? "" : (r.error ?? "onbekende fout")); }).finally(() => setServerBezig(false));
  };
  const zetSlot = (slot: string, patch: Partial<TauwSlot>) =>
    zetVenster({ sloten: sloten.map((x) => (x.slot === slot ? { ...x, ...patch } : x)) });

  // Beschikbare locaties (plaats) met aantallen — hiermee kun je de ronde beperken tot één plaats.
  const perPlaats = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of opdracht.adressen) {
      const p = (a.plaats || "Onbekend").trim();
      m.set(p, (m.get(p) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [opdracht.adressen]);

  const inFilter = (a: TauwAdres) => locaties.size === 0 || locaties.has((a.plaats || "Onbekend").trim());
  const teVerdelen = opdracht.adressen.filter(inFilter);

  const toggleLocatie = (p: string) => setLocaties((prev) => {
    const n = new Set(prev);
    if (n.has(p)) n.delete(p); else n.add(p);
    return n;
  });
  const toggleTeamlid = (id: string) => {
    const n = team.includes(id) ? team.filter((x) => x !== id) : [...team, id];
    onWijzig({ team: n });
  };

  const verdeel = () => {
    if (!team.length) { setMelding("Kies eerst wie er meelopen."); return; }
    if (!teVerdelen.length) { setMelding("Er zijn geen adressen om te verdelen."); return; }
    const max = maxPer.trim() ? Math.max(1, Number(maxPer)) : undefined;
    const verdeling = verdeelOverTeam(teVerdelen, team, max ? { maxPerPersoon: max } : undefined);
    const perAdres = new Map<string, string>();
    for (const v of verdeling) for (const id of v.adresIds) perAdres.set(id, v.userId);
    // Alleen de adressen binnen het filter krijgen een (nieuwe) eigenaar; de rest blijft zoals hij is.
    const next = opdracht.adressen.map((a) =>
      inFilter(a) ? { ...a, toegewezenAan: perAdres.get(a.id), bijgewerktOp: new Date().toISOString() } : a
    );
    onWijzig({ adressen: sorteerRoute(next) });
    const verdeeld = perAdres.size;
    const over = teVerdelen.length - verdeeld;
    setMelding(`${verdeeld} adressen verdeeld over ${team.length} ${team.length === 1 ? "persoon" : "personen"}${over > 0 ? ` — ${over} bleven onverdeeld (limiet per persoon bereikt)` : ""}.`);
  };

  const wisVerdeling = () => {
    onWijzig({ adressen: opdracht.adressen.map((a) => (inFilter(a) ? { ...a, toegewezenAan: undefined } : a)) });
    setMelding("Verdeling gewist.");
  };

  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";

  return (
    <Card className="space-y-4 p-4">
      {deel === "alles" && <h3 className="text-sm font-bold text-ink-900">Ronde voorbereiden</h3>}

      {toonInstellen && (<>
      {/* 1. Afsprakenvenster — bepaalt welke dagen aan de deur gekozen kunnen worden */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
          <CalendarRange className="h-4 w-4 text-ink-400" /> Afsprakenperiode
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-ink-600">
            van
            <input
              type="date"
              value={venster?.start ?? ""}
              onChange={(e) => zetVenster({ start: e.target.value })}
              aria-label="Eerste dag"
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink-600">
            t/m
            <input
              type="date"
              value={venster?.eind ?? (dagen.length ? dagen[dagen.length - 1] : "")}
              min={venster?.start || undefined}
              onChange={(e) => zetVenster({ eind: e.target.value })}
              aria-label="Laatste dag"
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-500">of snel:</span>
          {([1, 2, 3] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => zetVenster({ weken: w, eind: undefined })}
              className={`rounded-lg border-2 px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                venster?.weken === w && !venster?.eind ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
              }`}
            >
              {w} {w === 1 ? "week" : "weken"}
            </button>
          ))}
        </div>

        {/* Werkdagen — standaard ma t/m vr; weekend aan te zetten als er ook zaterdag gelopen wordt */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-500">werkdagen:</span>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const aan = werkdagen.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={aan}
                onClick={() => zetVenster({ werkdagen: aan ? werkdagen.filter((x) => x !== d) : [...werkdagen, d].sort() })}
                className={`h-9 w-9 rounded-lg border-2 text-xs font-bold uppercase transition-colors ${
                  aan ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-400 hover:bg-ink-50"
                }`}
              >
                {DAGNAMEN[d]}
              </button>
            );
          })}
        </div>

        <div className="mt-1.5 text-xs text-ink-500">
          {dagen.length > 0
            ? `${dagen.length} dagen: ${dagLabel(dagen[0])} t/m ${dagLabel(dagen[dagen.length - 1])} · feestdagen vallen automatisch weg.`
            : "Kies een eerste dag. Zolang dit leeg is, kan er aan de deur geen moment worden afgesproken."}
        </div>
      </div>

      {/* Tijdblokken: welke worden aangeboden, en hoeveel afspraken passen erin */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
          <Clock className="h-4 w-4 text-ink-400" /> Tijdblokken
          {serverBezig && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
        </div>
        <p className="mb-2 text-xs text-ink-500">
          Zet blokken uit die je niet wilt aanbieden (bijvoorbeeld de lunch). Het aantal is hoeveel
          afspraken er tegelijk in passen — net zoveel als de aannemer ploegen inzet. Leeg = onbeperkt.
        </p>
        <div className="space-y-1.5">
          {sloten.map((s) => {
            const aan = s.actief !== false;
            return (
              <div key={s.slot} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${aan ? "border-ink-200 bg-white" : "border-ink-200 bg-ink-50"}`}>
                <button
                  type="button"
                  aria-pressed={aan}
                  onClick={() => zetSlot(s.slot, { actief: !aan })}
                  className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${aan ? "bg-brand-500" : "bg-ink-300"}`}
                  aria-label={`${s.slot} ${aan ? "uitzetten" : "aanzetten"}`}
                >
                  <span className={`h-5 w-5 rounded-full bg-white transition-transform ${aan ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                </button>
                <span className={`flex-1 text-sm font-semibold ${aan ? "text-ink-800" : "text-ink-400 line-through"}`}>
                  {s.slot.replace("-", " – ")}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-ink-500">
                  max
                  <input
                    value={s.max ?? ""}
                    onChange={(e) => {
                      const cijfers = e.target.value.replace(/[^0-9]/g, "");
                      zetSlot(s.slot, { max: cijfers === "" ? undefined : Math.max(0, Number(cijfers)) });
                    }}
                    disabled={!aan}
                    placeholder="∞"
                    inputMode="numeric"
                    aria-label={`Maximum aantal afspraken in ${s.slot}`}
                    className="w-14 rounded-lg border border-ink-200 px-2 py-1.5 text-center text-sm outline-none focus:border-brand-400 disabled:bg-ink-100"
                  />
                </label>
              </div>
            );
          })}
        </div>
        {serverFout && (
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            De planning staat lokaal goed, maar kon niet naar de server: {serverFout}. Zonder de server
            wordt de capaciteit per blok niet bewaakt. Probeer het zo nog eens.
          </div>
        )}
      </div>

      </>)}

      {toonVerdelen && (<>
      {/* 2. Wie lopen er mee */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
          <Users className="h-4 w-4 text-ink-400" /> Wie lopen er mee
        </div>
        <div className="flex flex-wrap gap-2">
          {users.map((u) => {
            const aan = team.includes(u.id);
            const aantal = opdracht.adressen.filter((a) => a.toegewezenAan === u.id).length;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleTeamlid(u.id)}
                aria-pressed={aan}
                className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  aan ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                }`}
              >
                {aan && <Check className="h-3.5 w-3.5" />}
                {u.naam}
                {aantal > 0 && <span className="rounded-full bg-white/70 px-1.5 text-xs font-bold text-ink-600">{aantal}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Beperken tot bepaalde locaties */}
      {perPlaats.length > 1 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
            <MapPin className="h-4 w-4 text-ink-400" /> Locatie
            <span className="font-normal text-ink-400">{locaties.size === 0 ? "· alle" : `· ${teVerdelen.length} adressen`}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {perPlaats.map(([p, n]) => (
              <button
                key={p}
                type="button"
                onClick={() => toggleLocatie(p)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  locaties.has(p) ? "border-brand-500 bg-brand-50 font-semibold text-brand-800" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                }`}
              >
                {p} <span className="text-xs text-ink-400">{n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Verdelen */}
      <div className="flex flex-wrap items-end gap-2 border-t border-ink-100 pt-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">Max. adressen per persoon</span>
          <input
            value={maxPer}
            onChange={(e) => setMaxPer(e.target.value.replace(/\D/g, ""))}
            placeholder="onbeperkt"
            inputMode="numeric"
            className="w-32 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <button type="button" onClick={verdeel} className={knopPrimair}>
          <Wand2 className="h-4 w-4" /> Automatisch verdelen
        </button>
        {opdracht.adressen.some((a) => a.toegewezenAan) && (
          <button type="button" onClick={wisVerdeling} className={knopKlein}>
            <RotateCcw className="h-3.5 w-3.5" /> Verdeling wissen
          </button>
        )}
      </div>

      {melding && <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">{melding}</div>}

      {/* 5. Wat staat er nu klaar per persoon */}
      {team.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-ink-200">
          <div className="grid grid-cols-[1fr_3.25rem_3.25rem_3.25rem] gap-1 bg-ink-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            <span>Medewerker</span><span className="text-right">Totaal</span><span className="text-right">Klaar</span><span className="text-right">Erbij</span>
          </div>
          {team.map((id) => {
            const eigen = opdracht.adressen.filter((a) => a.toegewezenAan === id);
            const v = voortgangVan(eigen);
            return (
              <div key={id} className="grid grid-cols-[1fr_3.25rem_3.25rem_3.25rem] gap-1 px-3 py-1.5 text-sm">
                <span className="truncate text-ink-700">{naamVan(id)}</span>
                <span className="text-right font-medium text-ink-800">{v.totaal}</span>
                <span className="text-right font-medium text-ink-800">{v.afgerond}</span>
                <span className="text-right font-medium text-green-700">{v.ja}</span>
              </div>
            );
          })}
          {opdracht.adressen.some((a) => !a.toegewezenAan) && (
            <div className="border-t border-ink-100 px-3 py-1.5 text-xs text-amber-700">
              {opdracht.adressen.filter((a) => !a.toegewezenAan).length} adressen zijn nog aan niemand toegewezen.
            </div>
          )}
        </div>
      )}
      </>)}
    </Card>
  );
}
