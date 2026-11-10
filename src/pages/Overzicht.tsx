import { useEffect, useState } from "react";
import { CalendarCheck, Mailbox, Receipt, HardHat, MessageCircle, CheckCircle2, MapPin, Building2, ClipboardList, FolderKanban, ArrowRight, Bell,  Sparkles, Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { ComponentType } from "react";
import { Card, CardHeader } from "../components/ui";
import { StatCard } from "../components/StatCard";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { analyseerDashboard, aiResterend } from "../lib/ai";
import { afsprakenInWerkweek, brievenPerMaand, laatsteMaanden, lopendeProjecten, werkweek, type DossierLicht } from "../lib/dashboardCijfers";
import { haalDossiers } from "../lib/saneerflow";
import { supabaseAan } from "../lib/supabase";
import type { Factuur } from "../lib/types";

const euro = (n: number) =>
  n.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isISO = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
function weekGrenzen() {
  const t = new Date();
  const dag = (t.getDay() + 6) % 7; // maandag = 0
  const ma = new Date(t); ma.setDate(t.getDate() - dag);
  const zo = new Date(ma); zo.setDate(ma.getDate() + 6);
  return { start: iso(ma), eind: iso(zo) };
}
function geleden(isoTijd: string): string {
  const d = new Date(isoTijd).getTime();
  if (isNaN(d)) return "";
  const min = Math.max(0, Math.round((Date.now() - d) / 60000));
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const u = Math.round(min / 60);
  if (u < 24) return `${u} uur geleden`;
  const dg = Math.round(u / 24);
  return `${dg} dag${dg === 1 ? "" : "en"} geleden`;
}
const factuurTotaal = (f: Factuur) => f.regels.reduce((s, r) => s + r.aantal * r.prijs, 0) * (1 + (f.btwPercentage ?? 21) / 100);


// Eén klikbare kaart per operatie/module.
function OperatieKaart({ icon: Icon, label, waarde, sub, onClick }: { icon: ComponentType<{ className?: string }>; label: string; waarde: number | string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-card transition hover:border-brand-300 hover:shadow-cardhover">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-bold leading-none text-ink-900">{waarde}</div>
        <div className="mt-1 truncate text-sm font-semibold text-ink-700">{label}</div>
        <div className="truncate text-xs text-ink-400">{sub}</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
    </button>
  );
}

export function Overzicht() {
  const { afspraken, rondes, voorschouwen, voorschouwMappen, facturen, taken, users, saneringen, tauwOpdrachten, verlof, projects, projectPosts, buurtaanpak, schouwafspraken, currentUser, instellingen } = useApp();
  // Saneerdossiers staan op de server; die halen we op voor het tellen van de lopende projecten.
  const [dossiers, setDossiers] = useState<DossierLicht[]>([]);
  useEffect(() => {
    if (!supabaseAan) return;
    let actief = true;
    void haalDossiers().then((d) => { if (actief) setDossiers(d); });
    return () => { actief = false; };
  }, []);
  const { navigeer } = useNav();
  const [aiTekst, setAiTekst] = useState("");
  const [aiBezig, setAiBezig] = useState(false);
  const [aiFout, setAiFout] = useState("");
  const naamVan = (id?: string) => users.find((u) => u.id === id)?.naam ?? "—";
  const projectNaam = (id: string) => projects.find((p) => p.id === id)?.naam ?? "Project";

  const { start: wkStart } = weekGrenzen();
  const vandaag = iso(new Date());
  const actieveRondes = rondes.filter((r) => !r.gearchiveerd);
  const actieveBuurt = buurtaanpak.filter((b) => !b.gearchiveerd);
  const actieveSaneer = saneringen.filter((s) => !s.gearchiveerd);
  const actieveTauw = tauwOpdrachten.filter((o) => !o.gearchiveerd);
  const werknemers = users.filter((u) => u.rol === "monteur");

  // ── KPI's ──
  const { ma: werkMa, vr: werkVr } = werkweek();
  const afsprakenWeek = afsprakenInWerkweek({ afspraken, schouwafspraken, saneringen, buurtaanpak, tauwOpdrachten }, werkMa, werkVr);
  const lopend = lopendeProjecten({ rondes, tauwOpdrachten, saneringen, dossiers, schouwafspraken, buurtaanpak, voorschouwMappen }, wkStart);
  const maanden6 = laatsteMaanden(6);
  const brievenMaand = brievenPerMaand(rondes, maanden6);
  const gegooidMaand = brievenMaand[brievenMaand.length - 1]?.gegooid ?? 0;
  const teBezorgen = actieveRondes.flatMap((r) => r.adressen.filter((a) => !a.ontbreekt));
  const gegooid = teBezorgen.filter((a) => a.status === "Gegooid").length;
  const openFacturen = facturen.filter((f) => f.status === "Verstuurd");
  const openBedrag = openFacturen.reduce((s, f) => s + factuurTotaal(f), 0);
  const opVerlof = new Set(verlof.filter((v) => v.status === "Goedgekeurd" && v.van <= vandaag && vandaag <= v.tot).map((v) => v.medewerkerId));
  const actief = werknemers.filter((w) => !opVerlof.has(w.id)).length;

  // ── Afgeleide cijfers per operatie ──
  const vsIngediend = voorschouwen.filter((v) => v.status === "Ingediend").length;
  const vsConcept = voorschouwen.filter((v) => v.status === "Concept").length;
  const brievenTeGooien = teBezorgen.filter((a) => a.status !== "Gegooid").length;
  const buurtAdressen = actieveBuurt.flatMap((b) => b.adressen);
  const buurtBevestigd = buurtAdressen.filter((a) => a.bevestigd).length;
  const buurtUitgevoerd = buurtAdressen.filter((a) => a.uitgevoerd).length;
  const saneerAdressen = actieveSaneer.flatMap((s) => s.adressen).length;
  const tauwOpen = actieveTauw.filter((o) => o.status !== "verstuurd").length;
  const tauwControle = tauwOpdrachten.filter((o) => o.status === "ter_controle").length;
  const afsprakenOpen = afspraken.filter((a) => a.status === "Open" || a.status === "Bevestigd").length;
  const afsprakenVandaag = afspraken.filter((a) => a.datum === vandaag && a.status !== "Geannuleerd").length;
  const openTaken = taken.filter((t) => t.status !== "Klaar");

  // Klaar voor facturatie: afgeronde brievenrondes + afgeronde projecten die nog naar de boekhouding moeten.
  const teFactureren = rondes.filter((r) => r.boekhouding === "te_factureren").length + projects.filter((p) => p.afgerondOp && !p.boekhouding).length;
  const verlofOpen = verlof.filter((v) => v.status === "Aangevraagd").length;

  // ── Operaties (klikbaar, dekt alle modules) ──
  const operaties = [
    { key: "voorschouwen", icon: ClipboardList, label: "Voorschouwen", waarde: vsIngediend, sub: `${vsConcept} concept · ${vsIngediend} ingediend` },
    { key: "brieven", icon: Mailbox, label: "Brieven", waarde: actieveRondes.length, sub: `${gegooid}/${teBezorgen.length} gegooid` },
    { key: "buurtaanpak", icon: MapPin, label: "Buurtaanpak", waarde: actieveBuurt.length, sub: `${buurtBevestigd} bevestigd · ${buurtUitgevoerd} uitgevoerd` },
    { key: "saneren", icon: Building2, label: "Saneren", waarde: actieveSaneer.length, sub: `${saneerAdressen} adres${saneerAdressen === 1 ? "" : "sen"}` },
    { key: "tauw", icon: HardHat, label: "Bodemonderzoeken", waarde: tauwOpen, sub: tauwControle > 0 ? `${tauwControle} ter controle` : "open opdrachten" },
    { key: "afspraken", icon: CalendarCheck, label: "Afspraken", waarde: afsprakenOpen, sub: `${afsprakenVandaag} vandaag` },
    { key: "facturen", icon: Receipt, label: "Facturen", waarde: openFacturen.length, sub: `${euro(openBedrag)} openstaand` },
  ];

  // ── Omzet per project — gekoppeld via PD-nummer of via de gekoppelde brievenronde → factuur ──
  const factuurById = new Map(facturen.map((f) => [f.id, f]));
  const omzetVanProject = (p: (typeof projects)[number]): number => {
    let som = 0; const gezien = new Set<string>();
    if (p.pdNummer) for (const f of facturen) if (f.pdNummer && f.pdNummer === p.pdNummer && !gezien.has(f.id)) { som += factuurTotaal(f); gezien.add(f.id); }
    const rid = p.koppelingen?.brievenronde;
    if (rid) { const r = rondes.find((x) => x.id === rid); const fid = r?.factuurId; if (fid) { const f = factuurById.get(fid); if (f && !gezien.has(f.id)) { som += factuurTotaal(f); gezien.add(f.id); } } }
    return som;
  };
  const omzetPerProject = projects.map((p) => ({ naam: p.naam || "Project", omzet: Math.round(omzetVanProject(p)) })).filter((x) => x.omzet > 0).sort((a, b) => b.omzet - a.omzet).slice(0, 8);

  // ── Omzet per maand (laatste 6) ──
  const maandMap = new Map<string, number>();
  for (const f of facturen) { if (!isISO(f.datum)) continue; const k = f.datum.slice(0, 7); maandMap.set(k, (maandMap.get(k) ?? 0) + factuurTotaal(f)); }
  // Altijd de laatste 6 kalendermaanden, ook maanden zonder facturen (die staan op € 0).
  const omzetPerMaand = maanden6.map((m) => ({ maand: m.label, omzet: Math.round(maandMap.get(m.sleutel) ?? 0) }));

  // ── Factuurbedragen per status ──
  const bedragBetaald = facturen.filter((f) => f.status === "Betaald").reduce((s, f) => s + factuurTotaal(f), 0);
  const bedragConcept = facturen.filter((f) => f.status === "Concept").reduce((s, f) => s + factuurTotaal(f), 0);
  const totaalOmzet = bedragBetaald + openBedrag + bedragConcept;

  // ── Recente activiteit ──
  const recente = [...projectPosts].sort((a, b) => (a.aangemaakt < b.aangemaakt ? 1 : -1)).slice(0, 6);

  // ── Optionele AI-analyse (kostenbewust: goedkoop model + dag-cap) ──
  const samenvatting = [
    `Afspraken deze week: ${afsprakenWeek}; open/te bevestigen: ${afsprakenOpen}; vandaag: ${afsprakenVandaag}.`,
    `Brieven: ${gegooid} gegooid van ${teBezorgen.length}; nog te gooien: ${brievenTeGooien}.`,
    `Voorschouwen: ${vsConcept} concept, ${vsIngediend} ingediend.`,
    `TAUW: ${tauwOpen} open, ${tauwControle} ter controle.`,
    `Openstaande taken: ${openTaken.length}. Openstaande verlofaanvragen: ${verlofOpen}. Klaar voor facturatie: ${teFactureren}.`,
    `Facturen: ${openFacturen.length} openstaand (${euro(openBedrag)}); totaal gefactureerd ${euro(totaalOmzet)}, betaald ${euro(bedragBetaald)}, concept ${euro(bedragConcept)}.`,
    `Medewerkers actief vandaag: ${actief}/${werknemers.length}.`,
    omzetPerProject.length ? `Omzet per project (top): ${omzetPerProject.slice(0, 5).map((p) => `${p.naam}: ${euro(p.omzet)}`).join(", ")}.` : "Nog geen omzet aan projecten gekoppeld.",
  ].join("\n");

  const doeAnalyse = async () => {
    if (!currentUser || aiBezig) return;
    setAiBezig(true); setAiFout("");
    const res = await analyseerDashboard(instellingen.claudeKey ?? "", samenvatting, currentUser.id);
    setAiBezig(false);
    if (res.ok) setAiTekst(res.tekst); else setAiFout(res.fout);
  };

  return (
    <div className="space-y-6">
      {/* KPI's */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={FolderKanban} label="Lopende projecten" value={String(lopend.length)} sub="Per soort werk en regio" tone="green" />
        <StatCard icon={CalendarCheck} label="Afspraken deze week" value={String(afsprakenWeek)} sub="Ma t/m vr" tone="green" />
        <StatCard icon={Mailbox} label="Brieven gegooid" value={gegooidMaand.toLocaleString("nl-NL")} sub={`in ${maanden6[maanden6.length - 1].label.replace(" '", " 20")}`} tone="green" />
        <StatCard icon={Receipt} label="Openstaande facturen" value={String(openFacturen.length)} sub={`${euro(openBedrag)} totaal`} tone="amber" />
        <StatCard icon={HardHat} label="Medewerkers actief" value={`${actief} / ${werknemers.length}`} sub="Niet met verlof vandaag" tone="green" />
      </div>

      {/* Operaties — klikbaar overzicht van alle modules */}
      <div>
        <div className="mb-3 flex items-center gap-2 px-1">
          <Bell className="h-4 w-4 text-ink-400" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Operaties in één oogopslag</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {operaties.map((o) => (
            <OperatieKaart key={o.key} icon={o.icon} label={o.label} waarde={o.waarde} sub={o.sub} onClick={() => navigeer(o.key)} />
          ))}
        </div>
      </div>

      {/* Brieven gegooid per maand */}
      <Card>
        <CardHeader title="Brieven gegooid per maand" subtitle="Laatste 6 maanden" />
        <div className="h-72 px-3 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={brievenMaand} barSize={38}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="maand" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" width={40} allowDecimals={false} />
              <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 10px 30px -12px rgb(15 23 42 / 0.18)" }} />
              <Bar dataKey="gegooid" name="Brieven gegooid" fill="#ea580c" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Omzet & projecten */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Omzet per project" subtitle="Op basis van gekoppelde facturen (PD-nummer / brievenronde)" />
          <div className="h-72 px-3 py-4">
            {omzetPerProject.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-ink-400">Nog geen omzet gekoppeld aan projecten. Koppel een factuur via het PD-nummer of een brievenronde.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={omzetPerProject} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" tickFormatter={(v) => euro(Number(v))} />
                  <YAxis type="category" dataKey="naam" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" width={110} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => euro(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 10px 30px -12px rgb(15 23 42 / 0.18)" }} />
                  <Bar dataKey="omzet" name="Omzet" fill="#ea580c" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Omzet totaal" subtitle="Alle facturen" />
          <div className="space-y-3 p-5">
            <div>
              <div className="text-3xl font-bold tracking-tight text-ink-900">{euro(totaalOmzet)}</div>
              <div className="text-sm text-ink-500">gefactureerd (incl. btw)</div>
            </div>
            <div className="space-y-2 border-t border-ink-100 pt-3">
              {([["Betaald", bedragBetaald, "#22c55e"], ["Openstaand", openBedrag, "#6366f1"], ["Concept", bedragConcept, "#fdba74"]] as const).map(([label, bedrag, kleur]) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: kleur }} />
                  <span className="flex-1 text-ink-600">{label}</span>
                  <span className="font-semibold text-ink-900">{euro(bedrag)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Omzet per maand */}
      {(
        <Card>
          <CardHeader title="Omzet per maand" subtitle="Laatste 6 maanden" />
          <div className="h-64 px-3 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={omzetPerMaand} barSize={38}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="maand" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" width={48} tickFormatter={(v) => euro(Number(v))} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => euro(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 10px 30px -12px rgb(15 23 42 / 0.18)" }} />
                <Bar dataKey="omzet" name="Omzet" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Activiteit + taken */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader title="Recente activiteit" subtitle="Updates en vragen van het team" />
          {recente.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-ink-400">Nog geen activiteit. Zodra het team projecten bijwerkt, verschijnt het hier.</div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {recente.map((post) => {
                const Icon = post.type === "vraag" ? MessageCircle : CheckCircle2;
                return (
                  <li key={post.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-ink-50/60">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600"><Icon className="h-[18px] w-[18px]" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-900">{post.type === "vraag" ? "Vraag" : "Update"} · {projectNaam(post.projectId)}</div>
                      <div className="truncate text-xs text-ink-500">{naamVan(post.auteurId)}: {post.tekst}</div>
                    </div>
                    <div className="shrink-0 text-xs text-ink-400">{geleden(post.aangemaakt)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

      </div>

      {/* AI-analyse — optioneel, kostenbewust (goedkoop model + dag-cap) */}
      <Card>
        <CardHeader
          title="AI-analyse"
          subtitle="Korte analyse van wat beter kan"
          action={
            <button type="button" onClick={() => void doeAnalyse()} disabled={aiBezig} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {aiBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {aiBezig ? "Bezig…" : "Wat kan beter?"}
            </button>
          }
        />
        <div className="px-5 pb-5">
          {aiFout && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{aiFout}</div>}
          {aiTekst ? (
            <div className="whitespace-pre-wrap rounded-xl bg-ink-50 p-4 text-sm text-ink-700">{aiTekst}</div>
          ) : !aiFout && !aiBezig ? (
            <p className="text-sm text-ink-400">Klik op “Wat kan beter?” voor een korte AI-analyse — kostenbewust (goedkoop model{currentUser ? `, nog ${aiResterend(currentUser.id)} berichten vandaag` : ""}).</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
