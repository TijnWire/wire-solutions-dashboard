import { useEffect, useState } from "react";
import { Cake, Check, ChevronDown, Copy, Download, Link2, RefreshCw, Smartphone } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "./ui";
import { CLOUD_API_URL, supabaseAan } from "../lib/supabase";
import { bouwPersoonlijkeFeed, nieuwAgendaToken } from "../lib/agendaFeed";
import { useVerlofBeslissingen } from "../lib/verlofBeslissingen";

const veld = "rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

// Koppelen aan de agenda van je telefoon, per medewerker. Twee manieren:
//  • Abonnement (aanbevolen): een persoonlijke link die Apple Agenda en Google Agenda zelf verversen.
//  • Eenmalig bestand (.ics): werkt direct, maar verandert niet mee.
export function TelefoonAgenda() {
  const { currentUser, users, verlof, agendaItems, mededelingen, updateUser } = useApp();
  const { map: beslissingen } = useVerlofBeslissingen();
  const [open, setOpen] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  const [serverKlaar, setServerKlaar] = useState<"onbekend" | "ja" | "nee">("onbekend");

  // Is de server al bijgewerkt met de agenda-link? Zo niet, dan zeggen we dat eerlijk in plaats van een dode link te tonen.
  useEffect(() => {
    if (!open || !supabaseAan) return;
    let actief = true;
    fetch(`${CLOUD_API_URL}/agenda/status`).then((r) => r.ok ? r.json() : null).then((j) => { if (actief) setServerKlaar(j?.ok ? "ja" : "nee"); }).catch(() => { if (actief) setServerKlaar("nee"); });
    return () => { actief = false; };
  }, [open]);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const token = currentUser.agendaToken;
  const link = token ? `${CLOUD_API_URL}/agenda/${token}.ics` : "";
  const webcal = link.replace(/^https?:\/\//, "webcal://");

  const download = () => {
    const verlofStatus = Object.fromEntries(Object.entries(beslissingen).map(([id, b]) => [id, b.status as string]));
    const { ics } = bouwPersoonlijkeFeed({ users, verlof, agendaItems, mededelingen, verlofStatus }, currentUser);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "wire-solutions-agenda.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const kopieer = async () => {
    try { await navigator.clipboard.writeText(link); setGekopieerd(true); setTimeout(() => setGekopieerd(false), 2000); } catch { /* handmatig kopiëren kan altijd nog */ }
  };
  const maakLink = () => updateUser(currentUser.id, { agendaToken: nieuwAgendaToken() });
  const vervangLink = () => { if (confirm("Een nieuwe link maken? De oude link stopt direct met werken; je moet de agenda op je telefoon dan opnieuw koppelen.")) maakLink(); };

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-50/70" aria-expanded={open ? "true" : "false"}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Smartphone className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink-900">Koppel aan de agenda van je telefoon</span>
          <span className="block text-xs text-ink-500">iPhone of Android — verlof, meetings, mededelingen, verjaardagen en feestdagen</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-ink-100 p-4">
          {/* Mijn verjaardag */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-pink-50/60 p-3">
            <Cake className="h-5 w-5 shrink-0 text-pink-600" />
            <label htmlFor="mijn-verjaardag" className="text-sm font-semibold text-ink-800">Mijn verjaardag</label>
            <input id="mijn-verjaardag" type="date" value={currentUser.geboortedatum ?? ""} onChange={(e) => updateUser(currentUser.id, { geboortedatum: e.target.value || undefined })} className={veld + " py-1.5"} />
            <span className="text-xs text-ink-500">Dan staat hij in de agenda van je collega's.</span>
          </div>

          {/* Abonnement */}
          <div>
            <h4 className="mb-1 text-sm font-bold text-ink-900">Automatisch bijhouden (aanbevolen)</h4>
            <p className="mb-3 text-sm text-ink-500">Je krijgt een persoonlijke link. Je telefoon haalt de agenda zelf steeds opnieuw op, dus nieuwe meetings en verlof verschijnen vanzelf.</p>

            {serverKlaar === "nee" && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                De automatische koppeling wordt actief zodra de server is bijgewerkt. Het agenda-bestand hieronder werkt nu al.
              </div>
            )}

            {!token ? (
              <button type="button" onClick={maakLink} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"><Link2 className="h-4 w-4" /> Maak mijn agenda-link</button>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Mijn agenda-link" className={veld + " min-w-0 flex-1 font-mono text-xs"} />
                  <button type="button" onClick={kopieer} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                    {gekopieerd ? <><Check className="h-4 w-4 text-green-600" /> Gekopieerd</> : <><Copy className="h-4 w-4" /> Kopieer</>}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-ink-200 p-3">
                    <div className="text-sm font-bold text-ink-900">iPhone, iPad of Mac</div>
                    <p className="mt-1 text-xs text-ink-500">Tik op de knop en kies “Abonneer” in Agenda.</p>
                    <a href={webcal} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-sm font-semibold text-white hover:bg-ink-800"><Smartphone className="h-4 w-4" /> Open in Apple Agenda</a>
                  </div>
                  <div className="rounded-xl border border-ink-200 p-3">
                    <div className="text-sm font-bold text-ink-900">Android (Google Agenda)</div>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-ink-500">
                      <li>Kopieer de link hierboven.</li>
                      <li>Open Google Agenda in je browser (calendar.google.com).</li>
                      <li>Overige agenda’s → <b>+</b> → <b>Via URL</b> → plak de link.</li>
                      <li>De agenda verschijnt daarna ook in de app op je telefoon.</li>
                    </ol>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
                  <span>Deel deze link met niemand: wie hem heeft, kan jouw agenda lezen.</span>
                  <button type="button" onClick={vervangLink} className="inline-flex items-center gap-1 font-semibold text-red-500 hover:text-red-700"><RefreshCw className="h-3 w-3" /> Nieuwe link maken</button>
                </div>
              </div>
            )}
          </div>

          {/* Eenmalig bestand */}
          <div className="border-t border-ink-100 pt-4">
            <h4 className="mb-1 text-sm font-bold text-ink-900">Eenmalig toevoegen</h4>
            <p className="mb-3 text-sm text-ink-500">Download een agenda-bestand en open het op je telefoon. Dat werkt op iPhone en Android, maar wordt niet vanzelf bijgewerkt.</p>
            <button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"><Download className="h-4 w-4" /> Agenda-bestand (.ics) downloaden</button>
          </div>

          <p className="text-xs text-ink-400">In je telefoonagenda staat alleen wat voor jou geldt. Ziekmeldingen van collega’s komen er bewust niet in.</p>

          {isLeiding && <VerjaardagenBeheer />}
        </div>
      )}
    </Card>
  );
}

// Leiding kan de verjaardagen van het team invullen, voor wie dat zelf nog niet heeft gedaan.
function VerjaardagenBeheer() {
  const { users, updateUser } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-ink-100 pt-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-900" aria-expanded={open ? "true" : "false"}>
        <Cake className="h-4 w-4 text-pink-600" /> Verjaardagen van het team <ChevronDown className={`h-4 w-4 text-ink-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl")).map((u) => (
            <label key={u.id} className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink-800">{u.naam}</span>
              <input type="date" aria-label={`Verjaardag ${u.naam}`} value={u.geboortedatum ?? ""} onChange={(e) => updateUser(u.id, { geboortedatum: e.target.value || undefined })} className={veld + " py-1"} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
