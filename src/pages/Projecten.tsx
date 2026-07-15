import { useEffect, useRef, useState } from "react";
import { Plus, FolderKanban, X, FileScan, CalendarRange, Send, ArrowUpRight, Check, ChevronRight, Database, Trash2 } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Card, Badge, Bevestig } from "../components/ui";
import { TaakKaart } from "../components/TaakKaart";
import { ProjectBord } from "../components/ProjectBord";
import { BestandScanModal } from "../components/BestandScanModal";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze, type KeuzeOptie } from "../components/Keuze";
import type { Project } from "../lib/types";

const datumKort = (iso: string) => { const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso; };

type KoppelSleutel = "brievenronde" | "sanering" | "voorschouwMap" | "tauw";

// Eén koppel-regel op de projectkaart: kies een item uit een ander onderdeel + spring ernaartoe.
function KoppelRij({ label, value, opties, onKies, onOpen }: { label: string; value: string; opties: KeuzeOptie[]; onKies: (v: string) => void; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-32 shrink-0 text-xs font-medium text-ink-500">{label}</span>
      <div className="min-w-0 flex-1">
        <Keuze size="sm" value={value} onChange={onKies} opties={[{ waarde: "", label: "— geen —" }, ...opties]} title={label} />
      </div>
      {value && (
        <button type="button" onClick={onOpen} className="shrink-0 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-600" title="Openen">
          <ArrowUpRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Eén projectkaart — standaard ingeklapt; klik op de kop om uit te klappen.
function ProjectKaart({ project, initieelProject, onScan }: { project: Project; initieelProject?: string; onScan: (p: { id: string; naam: string }) => void }) {
  const { users, taken, addTaak, updateProject, deleteProject, rondes, saneringen, voorschouwMappen, tauwOpdrachten, opdrachtgevers } = useApp();
  const { navigeer } = useNav();
  const [open, setOpen] = useState(project.id === initieelProject); // deep-link opent meteen
  const [taakOpen, setTaakOpen] = useState(false);
  const [verwijder, setVerwijder] = useState(false);
  const [taakTitel, setTaakTitel] = useState("");
  const [taakNotitie, setTaakNotitie] = useState("");
  const [taakDeadline, setTaakDeadline] = useState("");
  const [taakPersoon, setTaakPersoon] = useState(""); // "" = hele team

  const projectTaken = taken.filter((t) => t.projectId === project.id);
  const rondeOpties: KeuzeOptie[] = rondes.map((b) => ({ waarde: b.id, label: [b.straat, b.plaats].filter(Boolean).join(", ") || "Ronde" }));
  const saneringOpties: KeuzeOptie[] = saneringen.map((s) => ({ waarde: s.id, label: [s.naam, s.regio].filter(Boolean).join(" · ") || "Sanering" }));
  const voorschouwOpties: KeuzeOptie[] = voorschouwMappen.map((v) => ({ waarde: v.id, label: v.naam || "Map" }));
  const tauwOpties: KeuzeOptie[] = tauwOpdrachten.map((t) => ({ waarde: t.id, label: [t.referentie, t.regio].filter(Boolean).join(" · ") || "TAUW" }));
  const zetKoppeling = (sleutel: KoppelSleutel, waarde: string) => {
    const k = { ...(project.koppelingen ?? {}) };
    if (waarde) k[sleutel] = waarde; else delete k[sleutel];
    updateProject(project.id, { koppelingen: k });
  };
  const voegTaakToe = () => {
    if (!taakTitel.trim()) return;
    addTaak({ projectId: project.id, titel: taakTitel.trim(), toegewezenAan: taakPersoon, deadline: taakDeadline ? datumKort(taakDeadline) : "Nog te plannen", status: "Te doen", notitie: taakNotitie.trim() });
    setTaakTitel(""); setTaakNotitie(""); setTaakDeadline(""); setTaakOpen(false);
  };

  const stageBadge = project.boekhouding === "gefactureerd" ? <Badge tone="green">Gefactureerd</Badge>
    : project.boekhouding === "te_factureren" ? <Badge tone="indigo">Bij boekhouding</Badge>
    : project.afgerondOp ? <Badge tone="amber">Afgerond</Badge>
    : null;

  return (
    <Card className="overflow-hidden">
      {/* Kop — klikbaar om in/uit te klappen */}
      <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 py-4">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronRight className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-90" : ""}`} />
          <div className="rounded-lg bg-brand-50 p-2 text-brand-600"><FolderKanban className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-ink-900">{project.naam}</h3>
            <p className="truncate text-xs text-ink-500">{[project.wijk, project.pdNummer, opdrachtgevers.find((o) => o.id === project.opdrachtgeverId)?.naam, project.uurtarief ? `€${String(project.uurtarief).replace(".", ",")}/u` : ""].filter(Boolean).join(" · ")}</p>
          </div>
          {stageBadge && <span className="hidden shrink-0 sm:inline">{stageBadge}</span>}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => navigeer("planning", { project: project.id })} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700" title="Stedin-weekplanning openen en invullen">
            <CalendarRange className="h-4 w-4" /> Planning
          </button>
          <button type="button" onClick={() => onScan({ id: project.id, naam: project.naam })} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700" title="Bestand (PDF/Excel) scannen en adressen importeren">
            <FileScan className="h-4 w-4" /> Scan
          </button>
          <span className="hidden text-xs text-ink-400 sm:inline">{projectTaken.filter((t) => t.status === "Klaar").length}/{projectTaken.length} klaar</span>
          <button type="button" onClick={() => setVerwijder(true)} className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Project verwijderen">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <>
          {/* PD-nummer + doorschakelen naar de boekhouding */}
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/40 px-5 py-2.5">
            <span className="text-xs font-semibold text-ink-500">PD-nummer</span>
            <input
              value={project.pdNummer ?? ""}
              onChange={(e) => updateProject(project.id, { pdNummer: e.target.value })}
              placeholder="bijv. PD153335"
              className="w-36 rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm font-medium text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <span className="text-xs font-semibold text-ink-500">Tarief</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-ink-400">€</span>
              <input
                value={project.uurtarief != null ? String(project.uurtarief).replace(".", ",") : ""}
                onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); updateProject(project.id, { uurtarief: Number.isFinite(n) && n >= 0 ? n : undefined }); }}
                placeholder="0"
                inputMode="decimal"
                title="Uurtarief (€ excl. btw)"
                className="w-16 rounded-lg border border-ink-200 px-2 py-1.5 text-sm text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <span className="text-xs text-ink-400">/u</span>
            </div>
            <span className="text-xs font-semibold text-ink-500">Klant</span>
            <div className="w-44">
              <Keuze
                value={project.opdrachtgeverId ?? ""}
                onChange={(w) => updateProject(project.id, { opdrachtgeverId: w || undefined })}
                opties={[{ waarde: "", label: "Geen klant" }, ...opdrachtgevers.map((o) => ({ waarde: o.id, label: o.naam }))]}
                title="Klant / opdrachtgever"
                size="sm"
              />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {project.boekhouding === "gefactureerd" ? (
                <>
                  <Badge tone="green">Gefactureerd ✓</Badge>
                  <button type="button" onClick={() => updateProject(project.id, { boekhouding: "te_factureren", gefactureerdOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600" title="Per ongeluk gefactureerd? Zet terug naar de boekhouding">corrigeren</button>
                </>
              ) : project.boekhouding === "te_factureren" ? (
                <>
                  <Badge tone="indigo">Bij boekhouding</Badge>
                  <button type="button" onClick={() => updateProject(project.id, { boekhouding: undefined, doorgestuurdOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">terughalen</button>
                </>
              ) : project.afgerondOp ? (
                <>
                  <Badge tone="amber">Afgerond</Badge>
                  <button
                    type="button"
                    onClick={() => updateProject(project.id, { boekhouding: "te_factureren", doorgestuurdOp: new Date().toISOString() })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
                    title="Dit afgeronde project doorschakelen naar de boekhouding"
                  >
                    <Send className="h-3.5 w-3.5" /> Naar boekhouding
                  </button>
                  <button type="button" onClick={() => updateProject(project.id, { afgerondOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">heropenen</button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => updateProject(project.id, { afgerondOp: new Date().toISOString() })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                  title="Markeer dit project als afgerond — de leiding krijgt er een melding van"
                >
                  <Check className="h-3.5 w-3.5" /> Project afronden
                </button>
              )}
            </div>
          </div>

          {/* Koppelen aan werk uit andere onderdelen */}
          <div className="space-y-2 border-b border-ink-100 px-5 py-3">
            <span className="text-xs font-semibold text-ink-500">Gekoppeld werk</span>
            <div className="grid gap-2 lg:grid-cols-2">
              <KoppelRij label="Brieven & Routes" value={project.koppelingen?.brievenronde ?? ""} opties={rondeOpties} onKies={(v) => zetKoppeling("brievenronde", v)} onOpen={() => navigeer("brieven", { ronde: project.koppelingen?.brievenronde })} />
              <KoppelRij label="Saneren" value={project.koppelingen?.sanering ?? ""} opties={saneringOpties} onKies={(v) => zetKoppeling("sanering", v)} onOpen={() => navigeer("saneren", { saneringId: project.koppelingen?.sanering })} />
              <KoppelRij label="Voorschouwen" value={project.koppelingen?.voorschouwMap ?? ""} opties={voorschouwOpties} onKies={(v) => zetKoppeling("voorschouwMap", v)} onOpen={() => navigeer("voorschouwen")} />
              <KoppelRij label="TAUW" value={project.koppelingen?.tauw ?? ""} opties={tauwOpties} onKies={(v) => zetKoppeling("tauw", v)} onOpen={() => navigeer("tauw", { tauwId: project.koppelingen?.tauw })} />
            </div>
          </div>

          <div className="space-y-2.5 p-4">
            {projectTaken.length === 0 && (
              <p className="px-1 text-sm text-ink-400">Nog geen taken in dit project.</p>
            )}
            {projectTaken.map((t) => (
              <TaakKaart key={t.id} taak={t} toonToewijzing />
            ))}

            {taakOpen ? (
              <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/50 p-3">
                <input
                  autoFocus
                  value={taakTitel}
                  onChange={(e) => setTaakTitel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && voegTaakToe()}
                  placeholder="Wat moet er gebeuren?"
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <textarea
                  value={taakNotitie}
                  onChange={(e) => setTaakNotitie(e.target.value)}
                  rows={2}
                  placeholder="Notitie / extra uitleg — waar moet de werknemer op letten? (optioneel)"
                  className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-ink-500">Voor wie?</span>
                    <Keuze value={taakPersoon} onChange={setTaakPersoon} altijdZoeken opties={[{ waarde: "", label: "Hele team" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} />
                  </label>
                  <label className="block w-48">
                    <span className="mb-1 block text-[11px] font-semibold text-ink-500">Deadline (optioneel)</span>
                    <DatumKiezer value={taakDeadline} onChange={setTaakDeadline} placeholder="Geen deadline" />
                  </label>
                  <button type="button" onClick={voegTaakToe} disabled={!taakTitel.trim()} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
                    Taak toevoegen
                  </button>
                  <button type="button" onClick={() => setTaakOpen(false)} className="rounded-lg px-2 py-2 text-sm text-ink-500 hover:bg-ink-50">Annuleer</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setTaakOpen(true); setTaakTitel(""); setTaakNotitie(""); setTaakDeadline(""); setTaakPersoon(""); }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-500 hover:bg-ink-50 hover:text-ink-700"
              >
                <Plus className="h-4 w-4" />
                Taak toevoegen
              </button>
            )}
          </div>

          <ProjectBord projectId={project.id} defaultOpen={project.id === initieelProject} />
        </>
      )}

      <Bevestig
        open={verwijder}
        titel="Project verwijderen"
        tekst={`Weet je zeker dat je "${project.naam}" wilt verwijderen? De taken en updates van dit project worden ook verwijderd. Dit kan niet ongedaan worden gemaakt.`}
        onBevestig={() => { deleteProject(project.id); setVerwijder(false); }}
        onAnnuleer={() => setVerwijder(false)}
      />
    </Card>
  );
}

export function Projecten({ initieelProject }: { initieelProject?: string }) {
  const { projects, addProject, updateProject, opdrachtgevers } = useApp();
  const doelRef = useRef<HTMLDivElement | null>(null);
  const [scan, setScan] = useState<{ id: string; naam: string } | null>(null);

  // Gefactureerde projecten gaan automatisch naar de "Database" (uit de actieve lijst, maar bewaard + gesynct).
  // Open werk staat bovenaan: nog niet afgerond eerst, daarna afgeronde/klaar-voor-boekhouding projecten.
  const actief = projects
    .filter((p) => p.boekhouding !== "gefactureerd")
    .sort((a, b) => (a.afgerondOp ? 1 : 0) - (b.afgerondOp ? 1 : 0));
  const gearchiveerd = projects.filter((p) => p.boekhouding === "gefactureerd");
  const [dbOpen, setDbOpen] = useState(gearchiveerd.some((p) => p.id === initieelProject));

  // Afgeronde projecten die nog niet naar de boekhouding zijn gestuurd — actie voor de leiding.
  const afgerondKlaar = projects.filter((p) => p.afgerondOp && !p.boekhouding);
  const naarBoekhouding = (id: string) => updateProject(id, { boekhouding: "te_factureren", doorgestuurdOp: new Date().toISOString() });

  // Scroll naar het project waar een melding naartoe linkt (open de Database als het daar staat).
  useEffect(() => {
    if (!initieelProject) return;
    if (gearchiveerd.some((p) => p.id === initieelProject)) setDbOpen(true);
    doelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initieelProject]);

  const [nieuwProject, setNieuwProject] = useState(false);
  const [projNaam, setProjNaam] = useState("");
  const [projWijk, setProjWijk] = useState("");
  const [projPd, setProjPd] = useState("");
  const [projTarief, setProjTarief] = useState("");
  const [projOpdrachtgever, setProjOpdrachtgever] = useState("");

  const voegProjectToe = () => {
    if (!projNaam.trim()) return;
    const tarief = parseFloat(projTarief.replace(",", "."));
    addProject({
      naam: projNaam.trim(),
      wijk: projWijk.trim() || "—",
      toegewezenAan: [],
      pdNummer: projPd.trim() || undefined,
      opdrachtgeverId: projOpdrachtgever || undefined,
      uurtarief: Number.isFinite(tarief) && tarief > 0 ? tarief : undefined,
    });
    setProjNaam("");
    setProjWijk("");
    setProjPd("");
    setProjTarief("");
    setProjOpdrachtgever("");
    setNieuwProject(false);
  };

  return (
    <div className="space-y-6">
      {/* Header + nieuw project */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-700">Lopende projecten</h3>
        {!nieuwProject && (
          <button
            type="button"
            onClick={() => setNieuwProject(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Nieuw project
          </button>
        )}
      </div>

      {nieuwProject && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink-900">Nieuw project</h4>
            <button type="button" onClick={() => setNieuwProject(false)} title="Sluiten" className="text-ink-400 hover:text-ink-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              autoFocus
              value={projNaam}
              onChange={(e) => setProjNaam(e.target.value)}
              placeholder="Projectnaam (bijv. Stedin-batch Delft)"
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={projWijk}
                onChange={(e) => setProjWijk(e.target.value)}
                placeholder="Wijk / locatie"
                className="rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <input
                value={projPd}
                onChange={(e) => setProjPd(e.target.value)}
                placeholder="PD-nummer (bijv. PD153335)"
                className="rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs font-semibold text-ink-500">Uurtarief (€ excl. btw)</span>
                <input
                  value={projTarief}
                  onChange={(e) => setProjTarief(e.target.value)}
                  inputMode="decimal"
                  placeholder="bijv. 45"
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold text-ink-500">Klant / opdrachtgever</span>
                <Keuze
                  value={projOpdrachtgever}
                  onChange={setProjOpdrachtgever}
                  opties={[{ waarde: "", label: opdrachtgevers.length ? "Kies klant…" : "Nog geen klanten (voeg toe bij Facturen)" }, ...opdrachtgevers.map((o) => ({ waarde: o.id, label: o.naam }))]}
                  title="Klant / opdrachtgever"
                />
              </div>
            </div>
            <p className="text-xs text-ink-400">De klantgegevens (adres, e-mailadres) beheer je bij <span className="font-semibold text-ink-500">Facturen → Opdrachtgevers</span>. Uurtarief en klant worden gebruikt om dit project op uren te factureren.</p>
          </div>
          <button
            type="button"
            onClick={voegProjectToe}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Project aanmaken
          </button>
        </Card>
      )}

      {/* Afgeronde projecten die nog naar de boekhouding moeten */}
      {afgerondKlaar.length > 0 && (
        <Card className="border-2 border-amber-200 bg-amber-50/50 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900">
            <Send className="h-4 w-4 text-amber-600" /> Afgerond — klaar voor de boekhouding
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{afgerondKlaar.length}</span>
          </h3>
          <div className="space-y-2">
            {afgerondKlaar.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-white p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.pdNummer && <span className="rounded-md bg-ink-900 px-2 py-0.5 text-xs font-bold tracking-wide text-white">{p.pdNummer}</span>}
                    <span className="truncate text-sm font-semibold text-ink-900">{p.naam}</span>
                  </div>
                  <div className="text-xs text-ink-500">{[p.wijk, p.afgerondOp ? `afgerond ${datumKort(p.afgerondOp)}` : ""].filter(Boolean).join(" · ")}</div>
                </div>
                <button type="button" onClick={() => naarBoekhouding(p.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"><Send className="h-4 w-4" /> Naar boekhouding</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {actief.length === 0 && !nieuwProject && (
        <Card className="p-10 text-center">
          <FolderKanban className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">{gearchiveerd.length > 0 ? "Geen lopende projecten — afgeronde staan in de Database hieronder." : <>Nog geen projecten. Klik op <span className="font-medium">Nieuw project</span> om te beginnen.</>}</p>
        </Card>
      )}

      {/* Actieve projectkaarten (standaard ingeklapt) */}
      {actief.map((project) => (
        <div key={project.id} ref={project.id === initieelProject ? doelRef : undefined}>
          <ProjectKaart project={project} initieelProject={initieelProject} onScan={setScan} />
        </div>
      ))}

      {/* Database — gefactureerde projecten (uit de werkmappen, maar bewaard + gesynct) */}
      {gearchiveerd.length > 0 && (
        <div className="pt-1">
          <button type="button" onClick={() => setDbOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-700 shadow-card hover:bg-ink-50">
            <Database className="h-4 w-4 text-ink-500" />
            Database — gefactureerde projecten
            <span className="rounded-full bg-ink-200 px-2 py-0.5 text-xs font-bold text-ink-600">{gearchiveerd.length}</span>
            <ChevronRight className={`ml-auto h-4 w-4 text-ink-400 transition-transform ${dbOpen ? "rotate-90" : ""}`} />
          </button>
          {dbOpen && (
            <div className="mt-3 space-y-6">
              {gearchiveerd.map((project) => (
                <div key={project.id} ref={project.id === initieelProject ? doelRef : undefined}>
                  <ProjectKaart project={project} initieelProject={initieelProject} onScan={setScan} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <BestandScanModal open={!!scan} projectId={scan?.id ?? ""} projectNaam={scan?.naam ?? ""} onSluit={() => setScan(null)} />
    </div>
  );
}
