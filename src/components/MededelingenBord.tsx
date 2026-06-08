import { useState } from "react";
import { Megaphone, Pin, PinOff, Trash2, Check, AlertTriangle, Send, CalendarClock, Users2, User } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "./ui";
import { DatumKiezer } from "./DatumKiezer";
import { Keuze } from "./Keuze";

const datumKort = (iso: string) => { const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso; };
function vandaagISO(): string { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }

function tijdGeleden(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const uur = Math.floor(min / 60);
  if (uur < 24) return `${uur} uur geleden`;
  const dag = Math.floor(uur / 24);
  if (dag < 7) return `${dag} dag${dag === 1 ? "" : "en"} geleden`;
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

// Prikbord: de beheerder plaatst mededelingen (met optioneel project + "let op"-notitie),
// de werknemers lezen ze en tikken "gezien". Met `compose` verschijnt de invoer (alleen leiding).
export function MededelingenBord({ compose = false }: { compose?: boolean }) {
  const { mededelingen, users, projects, currentUser, addMededeling, deleteMededeling, toggleMededelingGezien, toggleMededelingPin } = useApp();
  const [tekst, setTekst] = useState("");
  const [projectId, setProjectId] = useState("");
  const [gerichtAan, setGerichtAan] = useState("");
  const [belangrijk, setBelangrijk] = useState(false);
  const [deadline, setDeadline] = useState("");

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";

  const naamVan = (id?: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";
  const initialenVan = (id?: string) => users.find((u) => u.id === id)?.initialen ?? "?";
  const projectVan = (id?: string) => projects.find((p) => p.id === id)?.naam;

  // Werknemers zien team-brede + aan hen gerichte mededelingen; leiding ziet alles. Vastgezet bovenaan, daarna nieuwste eerst.
  const zichtbaar = mededelingen
    .filter((m) => isLeiding || !m.gerichtAan || m.gerichtAan === currentUser.id)
    .sort((a, b) => Number(!!b.vastgepind) - Number(!!a.vastgepind) || (a.aangemaakt < b.aangemaakt ? 1 : -1));

  const plaats = () => {
    if (!tekst.trim()) return;
    addMededeling({ auteurId: currentUser.id, tekst: tekst.trim(), projectId: projectId || undefined, gerichtAan: gerichtAan || undefined, belangrijk, deadline: deadline || undefined });
    setTekst(""); setProjectId(""); setGerichtAan(""); setBelangrijk(false); setDeadline("");
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-5 py-3.5">
        <Megaphone className="h-5 w-5 text-brand-600" />
        <h3 className="text-sm font-bold text-ink-900">Mededelingen</h3>
        <span className="hidden text-xs text-ink-400 sm:inline">van de beheerder voor het team</span>
        {zichtbaar.length > 0 && <span className="ml-auto rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">{zichtbaar.length}</span>}
      </div>

      {compose && isLeiding && (
        <div className="space-y-2.5 border-b border-ink-100 p-4">
          <textarea
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            rows={3}
            placeholder="Wat moet er gebeuren? Wees zo duidelijk mogelijk — wat, waar en waar moet het team op letten…"
            className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <div className="grid gap-2.5 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-ink-500">{gerichtAan ? <User className="h-3 w-3" /> : <Users2 className="h-3 w-3" />} Voor wie?</span>
              <Keuze value={gerichtAan} onChange={setGerichtAan} opties={[{ waarde: "", label: "Hele team" }, ...users.filter((u) => u.id !== currentUser.id).map((u) => ({ waarde: u.id, label: u.naam }))]} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-ink-500">Project (optioneel)</span>
              <Keuze value={projectId} onChange={setProjectId} opties={[{ waarde: "", label: "Geen project" }, ...projects.map((p) => ({ waarde: p.id, label: p.naam }))]} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-ink-500">Deadline (optioneel)</span>
              <DatumKiezer value={deadline} onChange={setDeadline} placeholder="Geen deadline" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setBelangrijk((b) => !b)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition-colors ${belangrijk ? "border-red-300 bg-red-50 text-red-600" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}>
              <AlertTriangle className="h-3.5 w-3.5" /> Belangrijk
            </button>
            <span className="text-xs text-ink-400">{gerichtAan ? `Gaat naar ${naamVan(gerichtAan)}` : "Gaat naar het hele team"}</span>
            <button type="button" onClick={plaats} disabled={!tekst.trim()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
              <Send className="h-3.5 w-3.5" /> Plaatsen
            </button>
          </div>
        </div>
      )}

      <div className="scrollbar-thin max-h-96 divide-y divide-ink-100 overflow-y-auto">
        {zichtbaar.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-400">Nog geen mededelingen.</p>
        ) : (
          zichtbaar.map((m) => {
            const gezien = m.gezienDoor.includes(currentUser.id);
            const proj = projectVan(m.projectId);
            const teLaat = !!m.deadline && m.deadline < vandaagISO();
            return (
              <div key={m.id} className={`p-4 ${m.belangrijk ? "bg-red-50/40" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">{initialenVan(m.auteurId)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                      <span className="font-semibold text-ink-800">{naamVan(m.auteurId)}</span>
                      <span>· {tijdGeleden(m.aangemaakt)}</span>
                      {m.vastgepind && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700"><Pin className="h-3 w-3" /> Vastgezet</span>}
                      {m.belangrijk && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700"><AlertTriangle className="h-3 w-3" /> Let op</span>}
                      {proj && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">{proj}</span>}
                      {m.gerichtAan && <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-600">Voor {naamVan(m.gerichtAan)}</span>}
                      {m.deadline && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${teLaat ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}><CalendarClock className="h-3 w-3" /> Deadline {datumKort(m.deadline)}{teLaat ? " · te laat" : ""}</span>}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-800">{m.tekst}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {m.auteurId !== currentUser.id && (
                        <button type="button" onClick={() => toggleMededelingGezien(m.id, currentUser.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${gezien ? "border-green-300 bg-green-50 text-green-700" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}>
                          <Check className="h-3.5 w-3.5" /> {gezien ? "Gezien" : "Markeer als gezien"}
                        </button>
                      )}
                      {m.gezienDoor.length > 0 && <span className="text-xs text-ink-400" title={m.gezienDoor.map(naamVan).join(", ")}>{m.gezienDoor.length} gezien</span>}
                      {isLeiding && (
                        <div className="ml-auto flex items-center gap-1">
                          <button type="button" onClick={() => toggleMededelingPin(m.id)} title={m.vastgepind ? "Losmaken" : "Bovenaan vastzetten"} aria-label="Vastzetten" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-amber-600">{m.vastgepind ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</button>
                          <button type="button" onClick={() => deleteMededeling(m.id)} title="Verwijderen" aria-label="Mededeling verwijderen" className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
