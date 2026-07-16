import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Mail,
  Save,
  X,
  FolderKanban,
  Briefcase,
  Users,
  ShieldCheck,
  Lock,
  Wand2,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Card, Badge } from "../components/ui";
import { hashWachtwoord, genereerWachtwoord } from "../lib/auth";
import { ROL_LABEL, BEHEER_GEBIEDEN, type Role, type User } from "../lib/types";
import { magBoekhouding } from "../lib/rechten";
import { supabaseAan, bewaarSyncCred } from "../lib/supabase";
import { logAudit, syncAppRole, resetAuthWachtwoord, wijzigAuthEmail, verwijderAuthAccount } from "../lib/adminAccount";

const ROLLEN: Role[] = ["eigenaar", "beheer", "hr", "monteur"];
const rolTone: Record<Role, string> = { eigenaar: "green", beheer: "amber", hr: "indigo", monteur: "slate" };

function initialenVan(naam: string): string {
  const delen = naam.trim().split(/\s+/).filter(Boolean);
  if (delen.length === 0) return "?";
  if (delen.length === 1) return delen[0].slice(0, 2).toUpperCase();
  return (delen[0][0] + delen[delen.length - 1][0]).toUpperCase();
}

function GebruikerEditor({
  gebruiker,
  onSluit,
}: {
  gebruiker: User | null;
  onSluit: () => void;
}) {
  const { projects, addUser, updateUser, deleteUser, updateProject, currentUser, users } = useApp();
  const { navigeer } = useNav();

  const magRol = currentUser?.rol === "eigenaar"; // alleen de eigenaar wijst rollen/rechten toe

  const beginRoles = (): Set<string> => {
    if (!gebruiker) return new Set(["monteur"]);
    if (gebruiker.rol === "eigenaar") return new Set(["eigenaar"]);
    if (gebruiker.rol === "hr") return new Set(["hr"]);
    if (gebruiker.rol === "beheer") return new Set(gebruiker.werknemer ? ["beheer", "monteur"] : ["beheer"]);
    return new Set(["monteur"]);
  };

  const [naam, setNaam] = useState(gebruiker?.naam ?? "");
  const [email, setEmail] = useState(gebruiker?.email ?? "");
  const [wachtwoord, setWachtwoord] = useState(""); // leeg = (bij bewerken) ongewijzigd laten
  const [selRoles, setSelRoles] = useState<Set<string>>(beginRoles);
  const [rechten, setRechten] = useState<Set<string>>(new Set(gebruiker?.beheerRechten ?? BEHEER_GEBIEDEN.map((g) => g.key)));
  const [functie, setFunctie] = useState(gebruiker?.functie ?? "");
  const [toonPw, setToonPw] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [vraagVerwijder, setVraagVerwijder] = useState(false);

  const toggleRol = (token: string) => {
    if (!magRol) return;
    setSelRoles((prev) => {
      if (token === "eigenaar") return new Set(["eigenaar"]);
      if (token === "hr") return new Set(["hr"]); // HR is een losse rol (niet te combineren)
      const n = new Set(prev);
      n.delete("eigenaar");
      n.delete("hr");
      if (n.has(token)) n.delete(token);
      else n.add(token);
      if (n.size === 0) n.add("monteur");
      return n;
    });
  };
  const toggleRecht = (key: string) => {
    if (!magRol) return;
    setRechten((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };
  const [sel, setSel] = useState<Set<string>>(
    new Set(projects.filter((p) => gebruiker && p.toegewezenAan.includes(gebruiker.id)).map((p) => p.id))
  );
  const [fout, setFout] = useState("");

  const toggleProject = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pasProjectenToe = (userId: string) => {
    projects.forEach((p) => {
      const inSel = sel.has(p.id);
      const inToe = p.toegewezenAan.includes(userId);
      if (inSel && !inToe)
        updateProject(p.id, { toegewezenAan: [...p.toegewezenAan, userId] });
      else if (!inSel && inToe)
        updateProject(p.id, { toegewezenAan: p.toegewezenAan.filter((x) => x !== userId) });
    });
  };

  const [bezig, setBezig] = useState(false);

  const opslaan = async () => {
    if (bezig) return;
    if (!naam.trim()) return setFout("Vul een naam in.");
    if (!email.trim()) return setFout("Vul een e-mailadres in.");
    const dubbel = users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.id !== gebruiker?.id
    );
    if (dubbel) return setFout("Dit e-mailadres is al in gebruik.");
    if (!gebruiker && !wachtwoord.trim()) return setFout("Stel een wachtwoord in voor het nieuwe account.");
    if (!gebruiker && wachtwoord.trim().length < 8) return setFout("Kies een wachtwoord van minimaal 8 tekens.");

    const isEigenaar = selRoles.has("eigenaar");
    const isHr = selRoles.has("hr");
    const heeftBeheer = selRoles.has("beheer");
    const rol: Role = isEigenaar ? "eigenaar" : isHr ? "hr" : heeftBeheer ? "beheer" : "monteur";
    const werknemer = !isEigenaar && !isHr && heeftBeheer && selRoles.has("monteur");
    const beheerRechten = heeftBeheer && !isEigenaar && !isHr ? [...rechten] : undefined;

    const basis = {
      naam: naam.trim(),
      initialen: initialenVan(naam),
      email: email.trim(),
      rol,
      werknemer,
      beheerRechten,
      functie: functie.trim() || ROL_LABEL[rol],
    };

    setBezig(true);
    let nieuwId: string | undefined;
    try {
      const actor = { email: currentUser?.email ?? "onbekend", naam: currentUser?.naam ?? "onbekend" };
      const boekhouding = magBoekhouding({ rol, beheerRechten });
      if (gebruiker) {
        const emailGewijzigd = basis.email.toLowerCase() !== gebruiker.email.toLowerCase();
        // E-mail (inlog) wijzigen in ECHTE Supabase Auth via de beveiligde Edge Function.
        if (emailGewijzigd && supabaseAan) {
          const r = await wijzigAuthEmail(gebruiker.email, basis.email);
          if (!r.ok) { setFout(`E-mail wijzigen in de inlog is niet gelukt: ${r.error}. Wijziging niet opgeslagen.`); setBezig(false); return; }
        }
        // Het wachtwoord wijzig je hier niet meer: dat loopt via de knop "Wachtwoord wijzigen", zodat het
        // altijd óók bij Cloudflare wordt gezet (anders werkt de nieuwe inlog alleen op dit apparaat).
        updateUser(gebruiker.id, basis);
        pasProjectenToe(gebruiker.id);
        void syncAppRole(basis.email, rol, boekhouding);
        if (emailGewijzigd) void logAudit("email_gewijzigd", actor, { userId: gebruiker.id, email: basis.email, naam: basis.naam }, { oud: gebruiker.email, nieuw: basis.email });
        if (gebruiker.rol !== rol) void logAudit("rol_gewijzigd", actor, { userId: gebruiker.id, email: basis.email, naam: basis.naam }, { oud: gebruiker.rol, nieuw: rol });
        void logAudit("account_bewerkt", actor, { userId: gebruiker.id, email: basis.email, naam: basis.naam });
      } else {
        // Eerst het inlog-account bij Cloudflare zetten. Lukt dat niet, dan kan de medewerker alleen op dít
        // apparaat inloggen — dan liever niets aanmaken dan een half account.
        if (supabaseAan) {
          const r = await resetAuthWachtwoord(basis.email, wachtwoord.trim());
          if (!r.ok) { setFout(`Account aanmaken in de centrale database is niet gelukt: ${r.error}. Er is niets opgeslagen.`); setBezig(false); return; }
        }
        const cred = await hashWachtwoord(wachtwoord.trim());
        const id = addUser({ ...basis, ...cred });
        pasProjectenToe(id);
        void syncAppRole(basis.email, rol, boekhouding);
        void logAudit("account_aangemaakt", actor, { userId: id, email: basis.email, naam: basis.naam });
        nieuwId = id;
      }
    } finally {
      setBezig(false);
    }
    // Nieuw account? Meteen door naar de Medewerkers-pagina om contract/uurloon in te vullen.
    if (nieuwId) navigeer("medewerkers", { medewerker: nieuwId });
    else onSluit();
  };

  // Verwijderen gaat in twee stappen: eerst de blokkades checken, dan pas de waarschuwing tonen — zo
  // krijg je geen "weet je het zeker?" voor iets dat tóch niet mag.
  const vraagVerwijderen = () => {
    if (!gebruiker) return;
    if (gebruiker.id === currentUser?.id) return setFout("Je kunt je eigen account niet verwijderen.");
    const eigenaren = users.filter((u) => u.rol === "eigenaar");
    if (gebruiker.rol === "eigenaar" && eigenaren.length <= 1)
      return setFout("Er moet minimaal één eigenaar blijven.");
    setFout("");
    setVraagVerwijder(true);
  };

  const doeVerwijderen = async () => {
    if (!gebruiker || bezig) return;
    setBezig(true);
    try {
      // Eerst de inlog bij Cloudflare weghalen. Lukt dat niet, dan stoppen we: het account lokaal wissen
      // terwijl de inlog blijft bestaan, betekent dat de medewerker onzichtbaar toegang houdt tot de data.
      if (supabaseAan) {
        const r = await verwijderAuthAccount(gebruiker.email);
        if (!r.ok) {
          setVraagVerwijder(false);
          setFout(`Verwijderen is niet gelukt: ${r.error}. Het account is niet verwijderd — probeer het opnieuw als de verbinding er weer is.`);
          return;
        }
      }
      deleteUser(gebruiker.id);
      void logAudit("account_verwijderd", { email: currentUser?.email ?? "onbekend", naam: currentUser?.naam ?? "onbekend" }, { userId: gebruiker.id, email: gebruiker.email, naam: gebruiker.naam });
      onSluit();
    } finally {
      setBezig(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <Card className="space-y-4 p-5 ring-2 ring-brand-200">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-900">
          {gebruiker ? "Medewerker bewerken" : "Nieuwe medewerker"}
        </h3>
        <button type="button" onClick={onSluit} className="text-ink-400 hover:text-ink-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Naam</span>
          <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Voor- en achternaam" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Functie</span>
          <input value={functie} onChange={(e) => setFunctie(e.target.value)} placeholder="bijv. Werknemer" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">E-mailadres (inlog)</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@wiresolutions.nl" className={inputCls} />
        </label>
        {gebruiker ? (
          <div className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Wachtwoord</span>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
            >
              <KeyRound className="h-4 w-4" /> Wachtwoord wijzigen
            </button>
            <p className="mt-1 text-xs text-ink-400">Stelt een nieuw wachtwoord in dat meteen werkt — ook op de centrale database. Je ziet het daarna éénmalig en kunt het direct mailen.</p>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Wachtwoord</span>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={toonPw ? "text" : "password"}
                  value={wachtwoord}
                  onChange={(e) => setWachtwoord(e.target.value)}
                  placeholder="Minimaal 8 tekens"
                  autoComplete="new-password"
                  className={inputCls + " pr-10"}
                />
                <button
                  type="button"
                  onClick={() => setToonPw((t) => !t)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700"
                  title={toonPw ? "Verberg" : "Toon"}
                >
                  {toonPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setWachtwoord(genereerWachtwoord()); setToonPw(true); }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
                title="Genereer een sterk wachtwoord"
              >
                <Wand2 className="h-4 w-4" /> Genereer
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-400">Wordt versleuteld opgeslagen. Noteer het wachtwoord nu — het is later niet meer leesbaar.</p>
          </label>
        )}
      </div>

      {/* Rol */}
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink-700">Rol</span>
        <div className="flex flex-wrap gap-2">
          {ROLLEN.map((r) => {
            const actief = selRoles.has(r);
            return (
              <button
                key={r}
                type="button"
                disabled={!magRol}
                onClick={() => toggleRol(r)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${actief ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"} ${magRol ? "" : "cursor-not-allowed opacity-70"}`}
              >
                {ROL_LABEL[r]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-ink-400">
          {magRol ? "Eigenaar = alle rechten. Beheer en Werknemer kun je samen aanzetten." : "Alleen de eigenaar kan de rol wijzigen."}
        </p>
      </div>

      {/* Mag beheren — alleen voor beheerders, toegewezen door de eigenaar */}
      {selRoles.has("beheer") && !selRoles.has("eigenaar") && (
        <div>
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700">
            <ShieldCheck className="h-4 w-4 text-brand-600" /> Mag beheren
            {!magRol && <span className="text-xs font-normal text-ink-400">(alleen de eigenaar wijst dit toe)</span>}
          </span>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {BEHEER_GEBIEDEN.map((g) => (
              <label key={g.key} className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-sm ${rechten.has(g.key) ? "border-brand-300 bg-brand-50" : "border-ink-200 hover:bg-ink-50"} ${magRol ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
                <input type="checkbox" checked={rechten.has(g.key)} disabled={!magRol} onChange={() => toggleRecht(g.key)} className="h-4 w-4 accent-brand-600" />
                <span className="font-medium text-ink-800">{g.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">Deze beheerder ziet en beheert alleen de aangevinkte onderdelen — zo houd je het in goede lijnen.</p>
        </div>
      )}

      {/* Projecttoegang */}
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink-700">
          Mag werken aan projecten
        </span>
        {projects.length === 0 ? (
          <p className="text-sm text-ink-400">Er zijn nog geen projecten.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {projects.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                  sel.has(p.id)
                    ? "border-brand-300 bg-brand-50"
                    : "border-ink-200 hover:bg-ink-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={sel.has(p.id)}
                  onChange={() => toggleProject(p.id)}
                  className="h-4 w-4 accent-brand-600"
                />
                <FolderKanban className="h-4 w-4 text-ink-400" />
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink-800">{p.naam}</div>
                  <div className="truncate text-xs text-ink-500">{p.wijk}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {fout && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fout}</div>}

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-4">
        <button
          type="button"
          onClick={opslaan}
          disabled={bezig}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {bezig ? "Opslaan…" : "Opslaan"}
        </button>
        <button
          type="button"
          onClick={onSluit}
          className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
        >
          Annuleren
        </button>
        {gebruiker && (
          <button
            type="button"
            onClick={vraagVerwijderen}
            className="ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Verwijderen
          </button>
        )}
      </div>

      {gebruiker && resetOpen && <WachtwoordResetModal gebruiker={gebruiker} onSluit={() => setResetOpen(false)} />}
      {gebruiker && vraagVerwijder && (
        <VerwijderWaarschuwing
          gebruiker={gebruiker}
          projecten={projects.filter((p) => p.toegewezenAan.includes(gebruiker.id)).length}
          bezig={bezig}
          onBevestig={doeVerwijderen}
          onSluit={() => setVraagVerwijder(false)}
        />
      )}
    </Card>
  );
}

// Waarschuwing vóór het verwijderen van een account. Bewust een eigen venster in plaats van het kale
// confirm() van de browser: verwijderen is niet terug te draaien, dus je hoort te zien wát er weggaat.
function VerwijderWaarschuwing({
  gebruiker,
  projecten,
  bezig,
  onBevestig,
  onSluit,
}: {
  gebruiker: User;
  projecten: number;
  bezig: boolean;
  onBevestig: () => void;
  onSluit: () => void;
}) {
  const voornaam = gebruiker.naam.trim().split(/\s+/)[0] || "deze medewerker";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onSluit}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-cardhover" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-red-50 p-2.5 text-red-600"><AlertTriangle className="h-6 w-6" /></div>
          <div>
            <h3 className="text-base font-bold text-ink-900">Weet je het zeker?</h3>
            <p className="text-sm text-ink-500">{gebruiker.naam} · {gebruiker.email}</p>
          </div>
        </div>

        <p className="text-sm text-ink-600">Je staat op het punt dit account te verwijderen. Dit kun je niet ongedaan maken.</p>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
          <li className="flex gap-2"><span className="text-ink-300">•</span> {voornaam} kan niet meer inloggen — op geen enkel apparaat.</li>
          <li className="flex gap-2"><span className="text-ink-300">•</span> Het account verdwijnt bij iedereen in het team, ook op de centrale database.</li>
          <li className="flex gap-2">
            <span className="text-ink-300">•</span>
            {projecten === 0
              ? "Er staan geen projecten op deze medewerker."
              : `De medewerker wordt van ${projecten} ${projecten === 1 ? "project" : "projecten"} afgehaald.`}
          </li>
        </ul>
        <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
          Gaat iemand uit dienst maar wil je de gegevens houden? Zet de rol dan op Werknemer en haal de projecten weg — dan blijft alles bewaard.
        </p>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onBevestig}
            disabled={bezig}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" /> {bezig ? "Verwijderen…" : "Ja, verwijder definitief"}
          </button>
          <button
            type="button"
            onClick={onSluit}
            className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}

// Admin-gestuurde wachtwoordreset. Zet in Supabase Auth een nieuw (tijdelijk) wachtwoord, dwingt een
// eigen wachtwoordwissel af bij de volgende login, en toont het tijdelijke wachtwoord ÉÉNMALIG aan de
// beheerder (kopieerveld dat daarna verdwijnt). Nergens wordt een leesbaar wachtwoord bewaard.
function WachtwoordResetModal({ gebruiker, onSluit }: { gebruiker: User; onSluit: () => void }) {
  const { updateUser, currentUser } = useApp();
  const [fase, setFase] = useState<"bevestig" | "klaar">("bevestig");
  const [bezig, setBezig] = useState(false);
  const [temp, setTemp] = useState("");
  const [fout, setFout] = useState("");
  const [gekopieerd, setGekopieerd] = useState(false);

  const doeReset = async () => {
    setBezig(true);
    setFout("");
    try {
      const nieuw = genereerWachtwoord();
      // Eerst bij Cloudflare zetten. Lukt dat niet, dan laten we ook de lokale hash met rust: anders lopen
      // de twee uit elkaar en werkt het nieuwe wachtwoord alleen op dit apparaat.
      if (supabaseAan) {
        const r = await resetAuthWachtwoord(gebruiker.email, nieuw);
        if (!r.ok) { setFout(`Het wachtwoord is niet gewijzigd: ${r.error}. Het oude wachtwoord werkt nog — probeer het opnieuw zodra de verbinding er weer is.`); return; }
      }
      // Lokale hash bijwerken: het nieuwe wachtwoord werkt meteen om mee in te loggen (geen gedwongen wissel).
      const cred = await hashWachtwoord(nieuw);
      updateUser(gebruiker.id, { ...cred, moetWachtwoordWijzigen: false });
      // Wijzig je je eigen wachtwoord? Dan moeten de lokaal bewaarde inloggegevens mee, anders koppelt dit
      // apparaat na een herstart niet meer aan de centrale database.
      if (gebruiker.id === currentUser?.id) bewaarSyncCred(gebruiker.email, nieuw);
      void logAudit("wachtwoord_reset", { email: currentUser?.email ?? "onbekend", naam: currentUser?.naam ?? "onbekend" }, { userId: gebruiker.id, email: gebruiker.email, naam: gebruiker.naam });
      setTemp(nieuw);
      setFase("klaar");
    } finally { setBezig(false); }
  };

  const kopieer = async () => {
    try { await navigator.clipboard.writeText(temp); setGekopieerd(true); setTimeout(() => setGekopieerd(false), 2000); } catch { /* clipboard geblokkeerd — handmatig overtypen */ }
  };

  // Opent een kant-en-klare e-mail naar de medewerker met de inloggegevens (via de eigen mailapp).
  const mailNaar = () => {
    const url = window.location.origin;
    const onderwerp = "Je inloggegevens voor het Wire Solutions dashboard";
    const body = [
      `Hoi ${gebruiker.naam},`,
      "",
      "Je kunt inloggen op het Wire Solutions dashboard met deze gegevens:",
      "",
      `Website: ${url}`,
      `E-mail: ${gebruiker.email}`,
      `Wachtwoord: ${temp}`,
      "",
      "Dit wachtwoord werkt meteen. Je kunt het later zelf wijzigen.",
      "",
      "Groet,",
      "Wire Solutions",
    ].join("\n");
    window.location.href = `mailto:${encodeURIComponent(gebruiker.email)}?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onSluit}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-cardhover" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600"><KeyRound className="h-6 w-6" /></div>
          <div>
            <h3 className="text-base font-bold text-ink-900">Wachtwoord wijzigen</h3>
            <p className="text-sm text-ink-500">{gebruiker.naam} · {gebruiker.email}</p>
          </div>
        </div>

        {fase === "bevestig" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">Er wordt een nieuw wachtwoord ingesteld dat meteen werkt om mee in te loggen — op elk apparaat. Daarna kun je het in één klik naar de medewerker mailen. Je ziet het wachtwoord hierna éénmalig.</p>
            {fout && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fout}</div>}
            <div className="flex items-center gap-2">
              <button type="button" onClick={doeReset} disabled={bezig} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"><KeyRound className="h-4 w-4" /> {bezig ? "Bezig…" : "Nieuw wachtwoord instellen"}</button>
              <button type="button" onClick={onSluit} className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">Annuleren</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Nieuw wachtwoord — mail het of geef het door</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 font-mono text-sm text-ink-900">{temp}</code>
                <button type="button" onClick={kopieer} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">{gekopieerd ? <><Check className="h-4 w-4 text-green-600" /> Gekopieerd</> : <><Copy className="h-4 w-4" /> Kopieer</>}</button>
              </div>
              <button type="button" onClick={mailNaar} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"><Mail className="h-4 w-4" /> Mail naar {gebruiker.email}</button>
              <p className="mt-1.5 text-xs text-ink-400">Dit wachtwoord werkt meteen om mee in te loggen. Het is hierna niet meer op te vragen — mail of noteer het nu. De medewerker kan het later zelf wijzigen.</p>
            </div>
            <button type="button" onClick={onSluit} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">Klaar</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Gebruikersbeheer() {
  const { users, projects, currentUser } = useApp();
  const [open, setOpen] = useState<string | null>(null); // user id, "nieuw", of null

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  if (!isLeiding) {
    return (
      <Card className="p-8 text-center text-sm text-ink-500">
        Je hebt geen toegang tot gebruikersbeheer.
      </Card>
    );
  }

  const projectenVan = (userId: string) => projects.filter((p) => p.toegewezenAan.includes(userId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Gebruikersbeheer</h2>
          <p className="text-sm text-ink-500">
            Beheer inloggegevens, rollen en projecttoegang van het team.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-500">
            <Users className="h-4 w-4" />
            {users.length} {users.length === 1 ? "account" : "accounts"}
          </span>
          <button
            type="button"
            onClick={() => setOpen("nieuw")}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Nieuwe medewerker
          </button>
        </div>
      </div>

      {open === "nieuw" && <GebruikerEditor gebruiker={null} onSluit={() => setOpen(null)} />}

      <div className="space-y-3">
        {users.map((u) => {
          if (open === u.id) {
            return <GebruikerEditor key={u.id} gebruiker={u} onSluit={() => setOpen(null)} />;
          }
          const ups = projectenVan(u.id);
          return (
            <Card key={u.id} className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-white">
                  {u.initialen}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink-900">{u.naam}</span>
                    <Badge tone={rolTone[u.rol]}>{ROL_LABEL[u.rol]}{u.rol === "beheer" && u.werknemer ? " + Werknemer" : ""}</Badge>
                    {u.id === currentUser.id && <span className="text-xs text-ink-400">(jij)</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      {u.functie}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {u.email}
                    </span>
                    <span className="inline-flex items-center gap-1 text-ink-400">
                      <Lock className="h-3.5 w-3.5" />
                      wachtwoord versleuteld
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(u.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Bewerken
                </button>
              </div>

              {/* Projecttoegang */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-3">
                <span className="text-xs font-medium text-ink-400">Projecten:</span>
                {ups.length === 0 ? (
                  <span className="text-xs text-ink-400">geen toegewezen</span>
                ) : (
                  ups.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200"
                    >
                      {p.naam}
                    </span>
                  ))
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
