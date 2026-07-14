import { useEffect, useRef, useState, type ReactNode } from "react";
import { ListTodo, Loader2, CheckCircle2, Plus, FolderKanban, Mailbox, CalendarCheck, ChevronRight, ChevronDown, FileScan, FlaskConical, ClipboardCheck, CalendarDays, CalendarClock, Mail, AlertTriangle, Cable, Phone, Check } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { TAUW_TYPE_LABEL } from "../lib/types";
import { meldingenVoor } from "../lib/meldingen";
import { smsHerinneringTekst, smsLink, datumLabelNL } from "../lib/buurtaanpak";

const datumKort = (iso: string) => { const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso; };
// ISO-weeknummer van een ISO-datum (yyyy-mm-dd of vollere ISO-string).
function weekNr(iso: string): number | null {
  const [j, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!j || !m || !d) return null;
  const t = new Date(Date.UTC(j, m - 1, d));
  const dag = (t.getUTCDay() + 6) % 7; // maandag = 0
  t.setUTCDate(t.getUTCDate() - dag + 3); // donderdag van deze week
  const eersteDonderdag = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const ed = (eersteDonderdag.getUTCDay() + 6) % 7;
  eersteDonderdag.setUTCDate(eersteDonderdag.getUTCDate() - ed + 3);
  return 1 + Math.round((t.getTime() - eersteDonderdag.getTime()) / (7 * 24 * 3600 * 1000));
}
function vandaagISO(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
function morgenISO(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
import { Card } from "../components/ui";
import { TaakKaart } from "../components/TaakKaart";
import { ProjectBord } from "../components/ProjectBord";
import { BestandScanModal } from "../components/BestandScanModal";
import { MededelingenBord } from "../components/MededelingenBord";
import type { LucideIcon } from "lucide-react";

export function MijnWerk({ initieelProject }: { initieelProject?: string }) {
  const { currentUser, projects, taken, rondes, afspraken, tauwOpdrachten, addTaak, voorschouwen, voorschouwMappen, projectPosts, saneringen, buurtaanpak, updateBuurtaanpak, users, bedrijf, instellingen, verlof } = useApp();
  const { navigeer } = useNav();
  const [nieuwBijProject, setNieuwBijProject] = useState<string | null>(null);
  const [nieuweTitel, setNieuweTitel] = useState("");
  const [scan, setScan] = useState<{ id: string; naam: string } | null>(null);
  const [netVerstuurd, setNetVerstuurd] = useState<Set<string>>(new Set());
  const [openMappen, setOpenMappen] = useState<Set<string>>(new Set());
  const doelRef = useRef<HTMLDivElement | null>(null);
  const toggleMap = (k: string) => setOpenMappen((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // Scroll naar het project waar een melding naartoe linkt.
  useEffect(() => {
    if (initieelProject) doelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initieelProject]);

  if (!currentUser) return null;

  // Mailbox = persoonlijke meldingen/berichten voor deze gebruiker (zelfde als de bel, hier op de pagina).
  const mailbox = meldingenVoor(currentUser, { taken, rondes, afspraken, voorschouwen, projects, projectPosts, tauwOpdrachten, saneringen, buurtaanpak, users, bedrijf, instellingen, verlof });

  // SMS-herinneringen die binnen 24u verstuurd moeten worden (bevestigd, datum vandaag/morgen, nog niet verstuurd).
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";
  const vandaagDt = vandaagISO(), morgenDt = morgenISO();
  const smsTeVersturen = buurtaanpak
    .filter((b) => !b.gearchiveerd && (isLeiding || b.toegewezenAan === currentUser.id))
    .flatMap((b) => b.adressen
      .filter((a) => a.bevestigd && /^\d{4}-\d{2}-\d{2}$/.test(a.datum) && a.datum >= vandaagDt && a.datum <= morgenDt && (!a.herinnerVerstuurdOp || netVerstuurd.has(a.id)))
      .map((a) => ({ buurt: b, a })));
  const setNummer = (b: typeof buurtaanpak[number], id: string, tel: string) =>
    updateBuurtaanpak(b.id, { adressen: b.adressen.map((x) => (x.id === id ? { ...x, telefoon: tel } : x)) });
  const markeerVerstuurd = (b: typeof buurtaanpak[number], id: string) => {
    updateBuurtaanpak(b.id, { adressen: b.adressen.map((x) => (x.id === id ? { ...x, herinnerVerstuurdOp: new Date().toISOString() } : x)) });
    setNetVerstuurd((prev) => new Set(prev).add(id));
    setTimeout(() => setNetVerstuurd((prev) => { const n = new Set(prev); n.delete(id); return n; }), 2500);
  };

  const mijnTaken = taken.filter((t) => t.toegewezenAan === currentUser.id || t.toegewezenAan === ""); // "" = hele team
  const mijnProjecten = projects.filter(
    (p) =>
      p.toegewezenAan.includes(currentUser.id) ||
      mijnTaken.some((t) => t.projectId === p.id)
  );

  const teDoen = mijnTaken.filter((t) => t.status === "Te doen").length;
  const bezig = mijnTaken.filter((t) => t.status === "Mee bezig").length;
  const klaar = mijnTaken.filter((t) => t.status === "Klaar").length;

  const voegToe = (projectId: string) => {
    if (!nieuweTitel.trim()) return;
    addTaak({
      projectId,
      titel: nieuweTitel.trim(),
      toegewezenAan: currentUser.id,
      deadline: "Nog te plannen",
      status: "Te doen",
      notitie: "",
    });
    setNieuweTitel("");
    setNieuwBijProject(null);
  };

  const stats = [
    { label: "Te doen", value: teDoen, icon: ListTodo, tone: "bg-red-50 text-red-600" },
    { label: "Mee bezig", value: bezig, icon: Loader2, tone: "bg-orange-50 text-orange-600" },
    { label: "Klaar", value: klaar, icon: CheckCircle2, tone: "bg-green-50 text-green-600" },
  ];

  // Werkbonnen: door de manager toegewezen rondes en afspraken
  type WerkArea = "brieven" | "afspraken" | "tauw" | "buurtaanpak" | "voorschouwen";
  type Werkbon = {
    key: string;
    area: WerkArea; // onder welk mapje het valt
    icon: LucideIcon;
    type: string;
    titel: string;
    sub: string;
    pct: number;
    voortgang: string;
    meta?: ReactNode; // extra regel, bv. afgegeven-week + deadline bij TAUW
    open: () => void;
  };

  const werkbonnen: Werkbon[] = [];
  for (const r of rondes.filter((r) => r.toegewezenAan === currentUser.id)) {
    const teBezorgen = r.adressen.filter((a) => !a.ontbreekt);
    const gegooid = teBezorgen.filter((a) => a.status === "Gegooid").length;
    werkbonnen.push({
      key: "r-" + r.id,
      area: "brieven",
      icon: Mailbox,
      type: "Brieven & route",
      titel: r.straat,
      sub: r.plaats,
      pct: teBezorgen.length ? Math.round((gegooid / teBezorgen.length) * 100) : 0,
      voortgang: `${gegooid}/${teBezorgen.length} gegooid`,
      open: () => navigeer("brieven", { ronde: r.id }),
    });
  }
  const afspraakGroepen: Record<string, typeof afspraken> = {};
  for (const a of afspraken.filter((a) => a.toegewezenAan === currentUser.id)) {
    (afspraakGroepen[a.locatie] ??= []).push(a);
  }
  for (const [locatie, rijen] of Object.entries(afspraakGroepen)) {
    const bevestigd = rijen.filter((a) => a.status === "Bevestigd" || a.status === "Afgerond").length;
    werkbonnen.push({
      key: "a-" + locatie,
      area: "afspraken",
      icon: CalendarCheck,
      type: "Afspraken",
      titel: locatie,
      sub: rijen[0]?.plaats ?? "",
      pct: rijen.length ? Math.round((bevestigd / rijen.length) * 100) : 0,
      voortgang: `${bevestigd}/${rijen.length} bevestigd`,
      open: () => navigeer("afspraken", { locatie }),
    });
  }
  // TAUW-mappen die de manager aan mij heeft toegewezen (nog niet verstuurd)
  const vandaag = vandaagISO();
  for (const o of tauwOpdrachten.filter((t) => t.toegewezenAan === currentUser.id && t.status !== "verstuurd")) {
    const bevestigd = o.adressen.filter((a) => a.bevestigd).length;
    const afgegevenWk = weekNr(o.toegewezenOp ?? o.aangemaakt);
    const teLaat = !!o.deadline && o.deadline < vandaag;
    werkbonnen.push({
      key: "tauw-" + o.id,
      area: "tauw",
      icon: FlaskConical,
      type: `TAUW · ${TAUW_TYPE_LABEL[o.type]}`,
      titel: o.referentie || o.regio || "TAUW-opdracht",
      sub: o.regio || `${o.adressen.length} adressen`,
      pct: o.adressen.length ? Math.round((bevestigd / o.adressen.length) * 100) : 0,
      voortgang: `${bevestigd}/${o.adressen.length} ${o.type === "bezoekronde" ? "bezocht" : "bevestigd"}`,
      meta: (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {afgegevenWk && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-ink-400" /> Afgegeven: week {afgegevenWk}</span>}
          <span className={`inline-flex items-center gap-1 ${teLaat ? "font-semibold text-red-600" : ""}`}><CalendarClock className="h-3.5 w-3.5 text-ink-400" /> Af voor: {o.deadline ? datumKort(o.deadline) : "nog niet gezet"}{teLaat ? " · te laat" : ""}</span>
        </span>
      ),
      open: () => navigeer("tauw", { tauwId: o.id }),
    });
  }
  // Buurtaanpak die de manager aan mij heeft toegewezen
  for (const b of buurtaanpak.filter((b) => b.toegewezenAan === currentUser.id)) {
    const totaal = b.adressen.length;
    const uitgevoerd = b.adressen.filter((a) => a.uitgevoerd).length;
    werkbonnen.push({
      key: "ba-" + b.id,
      area: "buurtaanpak",
      icon: Cable,
      type: "Buurtaanpak",
      titel: b.naam,
      sub: b.regio || b.opdrachtgever || `${totaal} adressen`,
      pct: totaal ? Math.round((uitgevoerd / totaal) * 100) : 0,
      voortgang: `${uitgevoerd}/${totaal} uitgevoerd`,
      open: () => navigeer("buurtaanpak", { buurtaanpakId: b.id }),
    });
  }
  // Voorschouw-mappen die de manager aan mij heeft toegewezen
  for (const m of voorschouwMappen.filter((m) => !m.gearchiveerd && m.toegewezenAan === currentUser.id)) {
    const items = voorschouwen.filter((v) => v.mapId === m.id);
    const metFoto = items.filter((v) => v.fotos && v.fotos.length > 0).length;
    werkbonnen.push({
      key: "vs-" + m.id,
      area: "voorschouwen",
      icon: ClipboardCheck,
      type: "Voorschouwen",
      titel: m.naam,
      sub: `${items.length} ${items.length === 1 ? "adres" : "adressen"}`,
      pct: items.length ? Math.round((metFoto / items.length) * 100) : 0,
      voortgang: `${metFoto}/${items.length} met foto`,
      open: () => navigeer("voorschouwen"),
    });
  }

  // ── Mappen: werkbonnen gegroepeerd per onderdeel; klik op een item → naar die pagina ──
  const mapMeta: { area: WerkArea; label: string; icon: LucideIcon; navKey: string }[] = [
    { area: "brieven", label: "Brieven & routes", icon: Mailbox, navKey: "brieven" },
    { area: "afspraken", label: "Afspraken", icon: CalendarCheck, navKey: "afspraken" },
    { area: "tauw", label: "TAUW", icon: FlaskConical, navKey: "tauw" },
    { area: "buurtaanpak", label: "Buurtaanpak", icon: Cable, navKey: "buurtaanpak" },
    { area: "voorschouwen", label: "Voorschouwen", icon: ClipboardCheck, navKey: "voorschouwen" },
  ];
  const mappen = mapMeta
    .map((m) => ({ ...m, items: werkbonnen.filter((w) => w.area === m.area) }))
    .filter((m) => m.items.length > 0);

  // Overige meldingen = de mailbox minus de items die nu al als werkmapje getoond worden.
  const isWerkMelding = (id: string) =>
    (id.startsWith("ronde-") && !id.startsWith("ronde-fact-")) ||
    id.startsWith("afspr-") ||
    (id.startsWith("tauw-") && !id.startsWith("tauw-ctrl-")) ||
    id.startsWith("buurt-sms-") || id.startsWith("san-sms-") ||
    id === "taken";
  const overigeMeldingen = mailbox.filter((m) => !isWerkMelding(m.id));

  return (
    <div className="space-y-6">
      {/* Begroeting */}
      <div>
        <h2 className="text-xl font-bold text-ink-900">
          Hoi {currentUser.naam.split(" ")[0]} 👋
        </h2>
        <p className="text-sm text-ink-500">
          Dit staat er voor jou klaar vandaag. Werk je taken bij zodra je verder bent.
        </p>
      </div>

      {/* Mini-stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="flex flex-col items-start gap-1.5 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
              <div className={`rounded-xl p-2.5 ${s.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-bold text-ink-900">{s.value}</div>
                <div className="text-xs text-ink-500">{s.label}</div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* SMS-herinneringen — binnen 24u versturen (1 druk: SMS klaar → verstuurd → sluit) */}
      {smsTeVersturen.length > 0 && (
        <div>
          <h3 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-ink-700">
            <Phone className="h-4 w-4 text-amber-600" /> SMS-herinneringen versturen
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{smsTeVersturen.filter((x) => !netVerstuurd.has(x.a.id)).length}</span>
          </h3>
          <Card className="overflow-hidden border-amber-200">
            <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-700">
              Deze bewoners hebben morgen (of vandaag) een afspraak — stuur ze 24 uur vooraf de bevestiging namens Stedin.
            </div>
            <div className="divide-y divide-ink-100">
              {smsTeVersturen.map(({ buurt, a }) => {
                const verstuurd = netVerstuurd.has(a.id);
                const heeftNummer = a.telefoon.trim().length > 0;
                return (
                  <div key={buurt.id + "-" + a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ink-900">{a.straat} {a.huisnummer}</div>
                      <div className="truncate text-xs text-ink-500">{datumLabelNL(a.datum)} · {buurt.naam}</div>
                    </div>
                    {verstuurd ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700"><Check className="h-4 w-4" /> Verstuurd</span>
                    ) : (
                      <>
                        <input value={a.telefoon} onChange={(e) => setNummer(buurt, a.id, e.target.value)} placeholder="06-… (nummer)" inputMode="tel" className="w-36 rounded-lg border border-ink-200 px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
                        <a
                          href={heeftNummer ? smsLink(a.telefoon, smsHerinneringTekst(a, currentUser.naam)) : undefined}
                          onClick={(e) => { if (!heeftNummer) { e.preventDefault(); return; } markeerVerstuurd(buurt, a.id); }}
                          title={heeftNummer ? "Open de SMS en markeer als verstuurd" : "Vul eerst een telefoonnummer in"}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold ${heeftNummer ? "bg-brand-600 text-white hover:bg-brand-700" : "cursor-not-allowed bg-ink-100 text-ink-400"}`}
                        >
                          <Phone className="h-4 w-4" /> Verstuur SMS
                        </a>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Mededelingen van de beheerder */}
      <MededelingenBord />

      {/* Waar ik mee bezig ben — netjes in mapjes per onderdeel; klik door naar de pagina */}
      {(mappen.length > 0 || overigeMeldingen.length > 0) ? (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink-700"><FolderKanban className="h-4 w-4 text-ink-500" /> Waar ik mee bezig ben</h3>

          {mappen.map((m) => {
            const Icon = m.icon;
            const uit = openMappen.has(m.area);
            const pct = Math.round(m.items.reduce((s, w) => s + w.pct, 0) / m.items.length);
            return (
              <Card key={m.area} className="overflow-hidden">
                <button type="button" onClick={() => (m.items.length === 1 ? m.items[0].open() : toggleMap(m.area))} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-50/70" aria-expanded={uit ? "true" : "false"}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink-900">{m.label}</span>
                    <span className="block text-xs text-ink-500">{m.items.length} {m.items.length === 1 ? "onderdeel" : "onderdelen"} · {pct}% klaar</span>
                  </span>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600">{m.items.length}</span>
                  {m.items.length === 1 ? <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" /> : <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${uit ? "" : "-rotate-90"}`} />}
                </button>
                {uit && m.items.length > 1 && (
                  <div className="divide-y divide-ink-100 border-t border-ink-100">
                    {m.items.map((w) => {
                      const ItemIcon = w.icon;
                      return (
                        <button key={w.key} type="button" onClick={w.open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-50/50">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><ItemIcon className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink-900">{w.titel}</span>
                            <span className="block truncate text-xs text-ink-500">{w.sub} · {w.voortgang}</span>
                          </span>
                          <span className="text-xs font-semibold text-ink-400">{w.pct}%</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => navigeer(m.navKey)} className="flex w-full items-center justify-end gap-1 px-4 py-2.5 text-xs font-semibold text-brand-600 hover:bg-ink-50">Alles in {m.label} openen <ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Meldingen-mapje — de rest van de berichten */}
          {overigeMeldingen.length > 0 && (
            <Card className="overflow-hidden">
              <button type="button" onClick={() => toggleMap("_meld")} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-50/70" aria-expanded={openMappen.has("_meld") ? "true" : "false"}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Mailbox className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-ink-900">Meldingen</span><span className="block text-xs text-ink-500">Berichten en aandachtspunten</span></span>
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600">{overigeMeldingen.length}</span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${openMappen.has("_meld") ? "" : "-rotate-90"}`} />
              </button>
              {openMappen.has("_meld") && (
                <div className="divide-y divide-ink-100 border-t border-ink-100">
                  {overigeMeldingen.map((m) => (
                    <button key={m.id} type="button" onClick={() => m.navKey && navigeer(m.navKey, m.target ?? null)} disabled={!m.navKey} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-ink-50 disabled:cursor-default disabled:hover:bg-transparent">
                      <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${m.ernst === "waarschuwing" ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-600"}`}>{m.ernst === "waarschuwing" ? <AlertTriangle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}</span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink-900">{m.titel}</span><span className="block text-xs text-ink-500">{m.tekst}</span></span>
                      {m.navKey && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-300" />}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-ink-500">Je hebt nog geen werk toegewezen. Je manager wijst het toe via Brieven, Afspraken, TAUW, Buurtaanpak en Voorschouwen.</Card>
      )}

      {/* Eigen taken per project */}
      {mijnProjecten.length > 0 && (
        <h3 className="text-sm font-bold text-ink-700">Mijn taken</h3>
      )}

      {mijnProjecten.map((project) => {
        const projectTaken = mijnTaken.filter((t) => t.projectId === project.id);
        return (
          <div key={project.id} ref={project.id === initieelProject ? doelRef : undefined}>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink-900">{project.naam}</h3>
                  <p className="text-xs text-ink-500">{project.wijk}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScan({ id: project.id, naam: project.naam })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  title="Bestand (PDF/Excel) scannen en adressen importeren"
                >
                  <FileScan className="h-4 w-4" /> Scan
                </button>
                <span className="hidden text-xs text-ink-400 sm:inline">
                  {projectTaken.filter((t) => t.status === "Klaar").length}/{projectTaken.length} klaar
                </span>
              </div>
            </div>

            <div className="space-y-2.5 p-4">
              {projectTaken.map((t) => (
                <TaakKaart key={t.id} taak={t} />
              ))}

              {nieuwBijProject === project.id ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={nieuweTitel}
                    onChange={(e) => setNieuweTitel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && voegToe(project.id)}
                    placeholder="Wat moet er gebeuren?"
                    className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  <button
                    onClick={() => voegToe(project.id)}
                    className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Toevoegen
                  </button>
                  <button
                    onClick={() => setNieuwBijProject(null)}
                    className="rounded-lg px-2 py-2 text-sm text-ink-500 hover:bg-ink-50"
                  >
                    Annuleer
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setNieuwBijProject(project.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-500 hover:bg-ink-50 hover:text-ink-700"
                >
                  <Plus className="h-4 w-4" />
                  Taak toevoegen
                </button>
              )}
            </div>

            <ProjectBord projectId={project.id} defaultOpen={project.id === initieelProject} />
          </Card>
          </div>
        );
      })}

      <BestandScanModal open={!!scan} projectId={scan?.id ?? ""} projectNaam={scan?.naam ?? ""} onSluit={() => setScan(null)} />
    </div>
  );
}
