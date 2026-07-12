import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { X } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { BottomNav } from "./components/BottomNav";
import { Topbar } from "./components/Topbar";
import { DevSwitcher } from "./components/DevSwitcher";
import { Login } from "./pages/Login";
import { WachtwoordWijzigen } from "./pages/WachtwoordWijzigen";
import { Overzicht } from "./pages/Overzicht";
import { MijnWerk } from "./pages/MijnWerk";
import { Team } from "./pages/Team";
import { Projecten } from "./pages/Projecten";
import { Planning } from "./pages/Planning";
import { Voorschouwen } from "./pages/Voorschouwen";
import { Saneren } from "./pages/Saneren";
import { Buurtaanpak } from "./pages/Buurtaanpak";
import { Tauw } from "./pages/Tauw";
import { Brieven } from "./pages/Brieven";
import { Afspraken } from "./pages/Afspraken";
import { Communicatie } from "./pages/Communicatie";
import { Documenten } from "./pages/Documenten";
import { Facturen } from "./pages/Facturen";
import { Loonstroken } from "./pages/Loonstroken";
import { Boetes } from "./pages/Boetes";
import { Medewerkers } from "./pages/Medewerkers";
import { Agenda } from "./pages/Agenda";
import { Mededelingen } from "./pages/Mededelingen";
import { Schouwafspraken } from "./pages/Schouwafspraken";
import { Verlof } from "./pages/Verlof";
import { Kennisbank } from "./pages/Kennisbank";
import { Instellingen } from "./pages/Instellingen";
import { Klanten } from "./pages/Klanten";
import { meldingenVoor, type Melding } from "./lib/meldingen";
import { zoekResultaten, type ZoekItem } from "./lib/zoeken";
import { Gebruikersbeheer } from "./pages/Gebruikersbeheer";
import { Toegang } from "./pages/Toegang";
import { Module } from "./pages/Module";
import { AiAssistent } from "./components/AiAssistent";
import { NAV, magZien } from "./lib/nav";
import { useApp } from "./store/AppContext";
import { NavContext, type NavTarget } from "./store/NavContext";

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-white text-ink-500">
      <img src="/wire-logo.png" alt="Wire Solutions" className="h-28 w-auto animate-pulse" />
      <div className="text-sm">Bezig met laden…</div>
    </div>
  );
}

export default function App() {
  const { currentUser, hydrated, bedrijf, instellingen, verlof, taken, rondes, afspraken, voorschouwen, klanten, facturen, users, kennis, projects, projectPosts, tauwOpdrachten, saneringen, buurtaanpak, logout, synced } = useApp();
  const [active, setActive] = useState("overzicht");
  const [target, setTarget] = useState<NavTarget>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Bij (her)inloggen naar de juiste startpagina
  useEffect(() => {
    setActive(currentUser?.rol === "monteur" ? "mijnwerk" : "overzicht");
  }, [currentUser?.id]);

  // Stabiele callbacks + gememoiseerde afgeleiden, zodat de app-shell (Sidebar/BottomNav/Topbar)
  // en useNav-consumenten NIET hertekenen bij een data-wijziging (bv. een vinkje in Buurtaanpak).
  const navigeer = useCallback((key: string, t: NavTarget = null) => { setActive(key); setTarget(t); setMenuOpen(false); }, []);
  const ga = useCallback((key: string) => navigeer(key), [navigeer]);
  const onMenu = useCallback(() => setMenuOpen(true), []);
  const onSync = useCallback(() => navigeer("instellingen"), [navigeer]);
  const logoutRef = useRef(logout); logoutRef.current = logout;
  const onLogout = useCallback(() => logoutRef.current(), []);
  const onMelding = useCallback((m: Melding) => { if (m.navKey) navigeer(m.navKey, m.target ?? null); }, [navigeer]);
  const onResultaat = useCallback((it: ZoekItem) => navigeer(it.navKey, it.target ?? null), [navigeer]);
  const zoekRef = useRef({ afspraken, rondes, voorschouwen, klanten, facturen, users, kennis, projects, currentUser });
  zoekRef.current = { afspraken, rondes, voorschouwen, klanten, facturen, users, kennis, projects, currentUser };
  const onZoek = useCallback((zoekterm: string) => {
    const z = zoekRef.current;
    return zoekResultaten(zoekterm, { afspraken: z.afspraken, rondes: z.rondes, voorschouwen: z.voorschouwen, klanten: z.klanten, facturen: z.facturen, users: z.users, kennis: z.kennis, projects: z.projects }, z.currentUser);
  }, []);
  const navContextValue = useMemo(() => ({ navigeer }), [navigeer]);
  const meldingen = useMemo(
    () => (currentUser ? meldingenVoor(currentUser, { taken, rondes, afspraken, voorschouwen, projects, projectPosts, tauwOpdrachten, saneringen, buurtaanpak, users, bedrijf, instellingen, verlof }) : []),
    [currentUser, taken, rondes, afspraken, voorschouwen, projects, projectPosts, tauwOpdrachten, saneringen, buurtaanpak, users, bedrijf, instellingen, verlof]
  );

  if (!hydrated) return <Splash />;
  if (!currentUser) return <><Login /><DevSwitcher /></>;
  // Door de beheerder afgedwongen wachtwoordwissel: eerst zelf een nieuw wachtwoord kiezen.
  if (currentUser.moetWachtwoordWijzigen) return <WachtwoordWijzigen />;

  const item = NAV.find((n) => n.key === active);
  const titel = active === "overzicht" ? "Dashboard" : active === "planning" ? "Weekplanning" : item?.label ?? "Dashboard";

  const render = () => {
    // Vangnet: onderdelen die deze gebruiker niet mag zien, ook niet via een omweg openen.
    if (item && !magZien(currentUser, item)) {
      return <div className="p-8 text-center text-sm text-ink-500">Je hebt geen toegang tot dit onderdeel.</div>;
    }
    switch (active) {
      case "overzicht":
        return <Overzicht />;
      case "mijnwerk":
        return <MijnWerk initieelProject={target?.project} />;
      case "team":
        return <Team />;
      case "projecten":
        return <Projecten key={target?.project ?? "lijst"} initieelProject={target?.project} />;
      case "planning":
        return <Planning key={target?.project ?? "geen"} projectId={target?.project} />;
      case "voorschouwen":
        return <Voorschouwen />;
      case "saneren":
        return <Saneren key={target?.saneringId ?? "lijst"} initieelSanering={target?.saneringId} />;
      case "buurtaanpak":
        return <Buurtaanpak key={target?.buurtaanpakId ?? "lijst"} initieelId={target?.buurtaanpakId} />;
      case "tauw":
        return <Tauw key={target?.tauwId ?? "lijst"} initieelTauw={target?.tauwId} />;
      case "agenda":
        return <Agenda />;
      case "verlof":
        return <Verlof />;
      case "mededelingen":
        return <Mededelingen />;
      case "schouwafspraken":
        return <Schouwafspraken />;
      case "brieven":
        return <Brieven key={target?.ronde ?? "lijst"} initieelRonde={target?.ronde} />;
      case "afspraken":
        return <Afspraken key={target?.locatie ?? "lijst"} initieelLocatie={target?.locatie} />;
      case "communicatie":
        return <Communicatie />;
      case "klanten":
        return <Klanten />;
      case "documenten":
        return <Documenten />;
      case "facturen":
        return <Facturen initieelFactuur={target?.factuur} />;
      case "loonstroken":
        return <Loonstroken />;
      case "boetes":
        return <Boetes />;
      case "medewerkers":
        return <Medewerkers initieelMedewerker={target?.medewerker} />;
      case "kennisbank":
        return <Kennisbank />;
      case "instellingen":
        return <Instellingen />;
      case "beheer":
        return <Gebruikersbeheer />;
      case "toegang":
        return <Toegang />;
      default:
        return <Module moduleKey={active} />;
    }
  };

  return (
    <NavContext.Provider value={navContextValue}>
    <div className="flex h-full overflow-hidden bg-ink-100">
      {/* Vaste zijbalk op desktop */}
      <div className="hidden md:flex">
        <Sidebar active={active} onSelect={ga} currentUser={currentUser} onLogout={onLogout} />
      </div>

      {/* Uitschuifmenu op mobiel */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full shadow-2xl">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-lg p-2 text-ink-400 hover:bg-ink-100"
              title="Sluiten"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar active={active} onSelect={ga} currentUser={currentUser} onLogout={onLogout} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={titel}
          onMenu={onMenu}
          meldingen={meldingen}
          onMelding={onMelding}
          onZoek={onZoek}
          onResultaat={onResultaat}
          synced={synced}
          onSync={onSync}
        />
        <main className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">{render()}</main>
      </div>

      {/* App-achtige onderbalk op mobiel */}
      <BottomNav active={active} onSelect={ga} onMeer={onMenu} currentUser={currentUser} />

      <AiAssistent />
      <DevSwitcher />
    </div>
    </NavContext.Provider>
  );
}
