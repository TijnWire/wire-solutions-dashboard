import { useMemo, useState } from "react";
import { AfsprakenPeriode, TijdblokKeuze, STANDAARD_TIJDEN } from "./PlanningInstellen";
import { Card } from "./ui";
import { dagenVanVenster, dagLabel, vensterRuimte, maakTijdblokken, TIJDSLOTS, STANDAARD_WERKDAGEN } from "../lib/bodemonderzoek";
import { sbBodemPlanning } from "../lib/supabase";
import type { TauwOpdracht, TauwSlot, User } from "../lib/types";

// Voorbereiding van een bodemonderzoek-ronde, voor de beheerder.
// ─────────────────────────────────────────────────────────────────────────────
// Hier zet de beheerder klaar wat het personeel aan de deur nodig heeft: van wie de opdracht komt,
// binnen welke periode bewoners een moment mogen kiezen, wie er meelopen, en wie welke adressen doet.
// Het verdelen gebeurt op looproute (postcode → straat → huisnummers), waarbij een straat nooit over
// twee mensen wordt gesplitst — zie lib/bodemonderzoek.ts.


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


export function BodemPlanning({ opdracht, onWijzig }: {
  opdracht: TauwOpdracht;
  users?: User[];
  onWijzig: (patch: Partial<TauwOpdracht>) => void;
  deel?: "alles" | "instellen";
}) {
  const [serverBezig, setServerBezig] = useState(false);
  const [serverFout, setServerFout] = useState("");

  const venster = opdracht.venster;
  const dagen = useMemo(() => dagenVanVenster(venster), [venster]);
  const tijden = venster?.tijden ?? STANDAARD_TIJDEN;
  const sloten: TauwSlot[] = venster?.sloten?.length ? venster.sloten : TIJDSLOTS.map((slot): TauwSlot => ({ slot, actief: true }));

  // Elke wijziging aan de planning gaat óók naar de server: die bewaakt bij het boeken de capaciteit,
  // en mag daarvoor niet afgaan op wat een telefoon meestuurt.
  const zetVenster = (patch: Partial<NonNullable<TauwOpdracht["venster"]>>) => {
    const v = { start: venster?.start ?? "", weken: venster?.weken ?? 2, ...venster, ...patch };
    onWijzig({ venster: v });
    const alleDagen = dagenVanVenster(v);
    // Bij losse dagen bewaakt de server de eerste t/m laatste dag en de weekdagen daarvan; de app
    // laat aan de deur alleen de gekozen dagen zien.
    const weekdagen = v.losseDagen
      ? [...new Set(alleDagen.map((d) => { const [j, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(j, m - 1, dd)).getUTCDay(); }))]
      : (v.werkdagen?.length ? v.werkdagen : STANDAARD_WERKDAGEN);
    setServerBezig(true);
    void sbBodemPlanning(opdracht.id, {
      periodeStart: (v.losseDagen ? alleDagen[0] : v.start) || undefined,
      periodeEind: v.losseDagen ? alleDagen[alleDagen.length - 1] : (v.eind || (alleDagen.slice(-1)[0] ?? undefined)),
      werkdagen: weekdagen.length ? weekdagen : STANDAARD_WERKDAGEN,
      sloten: (v.sloten?.length ? v.sloten : TIJDSLOTS.map((slot): TauwSlot => ({ slot, actief: true }))).map((x) => ({ slot: x.slot, actief: x.actief !== false, max: x.max })),
    }).then((r) => { setServerFout(r.ok ? "" : (r.error ?? "onbekende fout")); }).finally(() => setServerBezig(false));
  };
  const zetSlot = (slot: string, patch: Partial<TauwSlot>) =>
    zetVenster({ sloten: sloten.map((x) => (x.slot === slot ? { ...x, ...patch } : x)) });
  // Nieuwe tijden → nieuwe blokken. Een blok dat blijft bestaan houdt zijn instelling (aan/uit, max).
  const zetTijden = (patch: Partial<typeof tijden>) => {
    const t = { ...tijden, ...patch };
    const blokken = maakTijdblokken(t.van, t.tot, t.minuten);
    zetVenster({ tijden: t, sloten: blokken.map((slot) => sloten.find((x) => x.slot === slot) ?? { slot, actief: true }) });
  };


  return (
    <Card className="space-y-4 p-4">
      {/* 1. Afsprakenperiode — bepaalt welke dagen aan de deur gekozen kunnen worden */}
      <AfsprakenPeriode
        periode={venster}
        onWijzig={zetVenster}
        extra={dagen.length > 0 && opdracht.adressen.length > 0 && (() => {
          const r = vensterRuimte(dagen, sloten, opdracht.adressen);
          return (
            <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${r.krap ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-800"}`}>
              <span className="font-semibold">{r.plaatsen} afspraken passen in deze periode</span>
              {" · "}{r.adressen} adressen in de lijst
              {r.gepland > 0 && ` · ${r.gepland} al ingepland`}
              {r.krap && (
                <span className="mt-0.5 block">
                  Dat is krap: ervaring leert dat ongeveer de helft van de bewoners erbij wil zijn.
                  Voeg dagen toe, of verhoog het aantal per tijdblok.
                </span>
              )}
            </div>
          );
        })()}
      />

      {/* 2. Tijdblokken — per project anders, zoals de opdrachtgever het vraagt */}
      <TijdblokKeuze tijden={tijden} onWijzig={(t) => zetTijden(t)} bezig={serverBezig}>
        <p className="mb-2 text-xs text-ink-500">
          Zet blokken uit die je niet wilt aanbieden (bijvoorbeeld de lunch). Het aantal is hoeveel
          afspraken er tegelijk in passen. Leeg = één.
        </p>
        <div className="overflow-hidden rounded-lg border border-ink-200">
          {sloten.map((s, i) => {
            const aan = s.actief !== false;
            return (
              <div key={s.slot} className={`flex items-center gap-3 px-3 py-2 ${i ? "border-t border-ink-100" : ""} ${aan ? "bg-white" : "bg-ink-50"}`}>
                <span className={`w-28 shrink-0 text-sm font-semibold ${aan ? "text-ink-800" : "text-ink-400 line-through"}`}>
                  {s.slot.replace("-", " – ")}
                </span>
                <span className="flex-1" />
                <label className="flex items-center gap-1.5 text-xs text-ink-500">
                  max
                  <input
                    value={s.max ?? ""}
                    onChange={(e) => {
                      const cijfers = e.target.value.replace(/[^0-9]/g, "");
                      zetSlot(s.slot, { max: cijfers === "" ? undefined : Math.max(0, Number(cijfers)) });
                    }}
                    disabled={!aan}
                    placeholder="1"
                    inputMode="numeric"
                    aria-label={`Maximum aantal afspraken in ${s.slot}`}
                    className="w-12 rounded-lg border border-ink-200 px-2 py-1.5 text-center text-sm outline-none focus:border-brand-400 disabled:bg-ink-100"
                  />
                </label>
                <button
                  type="button"
                  aria-pressed={aan}
                  onClick={() => zetSlot(s.slot, { actief: !aan })}
                  className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${aan ? "bg-brand-500" : "bg-ink-300"}`}
                  aria-label={`${s.slot} ${aan ? "uitzetten" : "aanzetten"}`}
                >
                  <span className={`h-5 w-5 rounded-full bg-white transition-transform ${aan ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                </button>
              </div>
            );
          })}
          {sloten.length === 0 && <p className="px-3 py-3 text-sm text-amber-700">Geen blokken: zet "Tot" later dan "Van".</p>}
        </div>
        {serverFout && (
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            De planning staat lokaal goed, maar kon niet naar de server: {serverFout}. Zonder de server
            wordt de capaciteit per blok niet bewaakt. Probeer het zo nog eens.
          </div>
        )}
      </TijdblokKeuze>
    </Card>
  );
}
