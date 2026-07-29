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
import { Projectbeheer } from "./pages/Projectbeheer";
import { Planning } from "./pages/Planning";
import { Voorschouwen } from "./pages/Voorschouwen";
import { Saneren } from "./pages/Saneren";
import { Buurtaanpak } from "./pages/Buurtaanpak";
import { Tauw } from "./pages/Tauw";
import { Brieven } from "./pages/Brieven";
import { Urenstaat } from "./pages/Urenstaat";
import { VrijeDagen } from "./pages/VrijeDagen";
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
import { GebruikersToegang } from "./pages/GebruikersToegang";
import { Module } from "./pages/Module";
import { AiAssistent } from "./components/AiAssistent";
import { OfflineBanner } from "./components/OfflineBanner";
import { NAV, magZien } from "./lib/nav";
import { HOOFDINHOUD_ID } from "./lib/scroll";
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

const LAATSTE_PAGINA = "wire.laatstePagina"; // waar je gebleven was, zodat verversen je niet terugzet

export default function App() {
  const { currentUser, hydrated, bedrijf, instellingen, verlof, taken, rondes, afspraken, voorschouwen, klanten, facturen, users, kennis, projects, projectPosts, tauwOpdrachten, saneringen, buurtaanpak, logout, synced } = useApp();
  const [active, setActive] = useState("mijnwerk");
  const [target, setTarget] = useState<NavTarget>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Open je de app opnieuw (of ververs je), dan kom je terug op de pagina waar je gebleven was —
  // anders moet je elke keer weer terugklikken. Mag je die pagina niet (meer) zien, of ken ik hem
  // niet, dan val je terug op "Mijn werk". Het onthouden zelf gebeurt in navigeer().
  useEffect(() => {
    if (!currentUser) return;
    let laatste = "";
    try { laatste = localStorage.getItem(LAATSTE_PAGINA) ?? ""; } catch { /* opslag niet beschikbaar */ }
    const item = NAV.find((n) => n.key === laatste);
    setActive(item && magZien(currentUser, item) ? laatste : "mijnwerk");
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stabiele callbacks + gememoiseerde afgeleiden, zodat de app-shell (Sidebar/BottomNav/Topbar)
  // en useNav-consumenten NIET hertekenen bij een data-wijziging (bv. een vinkje in Buurtaanpak).
  const navigeer = useCallback((key: string, t: NavTarget = null) => {
    setActive(key); setTarget(t); setMenuOpen(false);
    // Onthouden bij het navigeren zelf (en niet in een effect): zo kan een effect bij het opstarten
    // de bewaarde pagina nooit overschrijven vóór hij hersteld is.
    try { localStorage.setItem(LAATSTE_PAGINA, key); } catch { /* opslag niet beschikbaar */ }
  }, []);
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
  // Aantal afgerond werk dat naar de boekhouding is gestuurd en nog gefactureerd moet worden → badge op Facturen.
  const teFactureren = useMemo(
    () =>
      projects.filter((p) => p.boekhouding === "te_factureren").length +
      buurtaanpak.filter((b) => b.boekhouding === "te_factureren").length +
      // Brievenrondes tellen per map (mapNaam), niet per straat.
      new Set(rondes.filter((r) => r.boekhouding === "te_factureren").map((r) => r.mapNaam || r.id)).size,
    [projects, buurtaanpak, rondes]
  );
  const sidebarBadges = useMemo<Record<string, number>>(() => ({ facturen: teFactureren }), [teFactureren]);
  const meldingen = useMemo(
    () => (currentUser ? meldingenVoor(currentUser, { taken, rondes, afspraken, voorschouwen, projects, projectPosts, tauwOpdrachten, saneringen, buurtaanpak, users, bedrijf, instellingen, verlof }) : []),
    [currentUser, taken, rondes, afspraken, voorschouwen, projects, projectPosts, tauwOpdrachten, saneringen, buurtaanpak, users, bedrijf, instellingen, verlof]
  );

  if (!hydrated) return <Splash />;
  if (!currentUser) return <><Login /><DevSwitcher /></>;
  // Door de beheerder afgedwongen wachtwoordwissel: eerst zelf een nieuw wachtwoord kiezen.
  if (currentUser.moetWachtwoordWijzigen) return <WachtwoordWijzigen />;

  const item = NAV.find((n) => n.key === active);
  const titel = active === "overzicht" ? "Dashboard" : active === "planning" ? "Weekplanning" : active === "projecten" ? "Projecten" : item?.label ?? "Dashboard";

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
      case "projectbeheer":
        return <Projectbeheer />;
      case "planning":
        return <Planning key={target?.project ?? "geen"} projectId={target?.project} />;
      case "voorschouwen":
        return <Voorschouwen key={target?.voorschouwMap ?? "lijst"} initieelMap={target?.voorschouwMap} />;
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
        return <Brieven key={target?.ronde ?? target?.brievenMap ?? "lijst"} initieelRonde={target?.ronde} initieelMap={target?.brievenMap} />;
      case "afspraken":
        return <Afspraken key={target?.locatie ?? "lijst"} initieelLocatie={target?.locatie} />;
      case "communicatie":
        return <Communicatie />;
      case "klanten":
        return <Klanten />;
      case "documenten":
        return <Documenten />;
      case "facturen":
        return <Facturen key={target?.nieuwFactuurProject ?? target?.factuur ?? "lijst"} initieelFactuur={target?.factuur} nieuwFactuurProject={target?.nieuwFactuurProject} />;
      case "urenstaat":
        return <Urenstaat />;
      case "vrijedagen":
        return <VrijeDagen />;
      case "loonstroken":
        return <Loonstroken key={target?.loonWeek ?? "lijst"} loonWeek={target?.loonWeek} />;
      case "boetes":
        return <Boetes />;
      case "medewerkers":
        return <Medewerkers initieelMedewerker={target?.medewerker} />;
      case "kennisbank":
        return <Kennisbank />;
      case "instellingen":
        return <Instellingen />;
      case "beheer":
        return <GebruikersToegang />;
      default:
        return <Module moduleKey={active} />;
    }
  };

  return (
    <NavContext.Provider value={navContextValue}>
    <div className="flex h-full overflow-hidden bg-ink-100">
      {/* Vaste zijbalk op desktop */}
      <div className="hidden md:flex">
        <Sidebar active={active} onSelect={ga} currentUser={currentUser} onLogout={onLogout} badges={sidebarBadges} />
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
            <Sidebar active={active} onSelect={ga} currentUser={currentUser} onLogout={onLogout} badges={sidebarBadges} />
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
        <OfflineBanner />
        {/* De key zorgt dat elke nieuwe pagina opnieuw mount, waardoor de schuif-animatie afspeelt. */}
        {/* id: deze kolom is wat er scrollt — zie lib/scroll.ts (detailpagina's beginnen bovenaan). */}
        <main id={HOOFDINHOUD_ID} className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
          <div key={active} className="animate-slide-in-right">{render()}</div>
        </main>
      </div>

      {/* App-achtige onderbalk op mobiel */}
      <BottomNav active={active} onSelect={ga} onMeer={onMenu} currentUser={currentUser} badges={sidebarBadges} />

      <AiAssistent />
      <DevSwitcher />
    </div>
    </NavContext.Provider>
  );
}
