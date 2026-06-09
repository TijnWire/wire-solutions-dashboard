import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { BottomNav } from "./components/BottomNav";
import { Topbar } from "./components/Topbar";
import { DevSwitcher } from "./components/DevSwitcher";
import { Login } from "./pages/Login";
import { Overzicht } from "./pages/Overzicht";
import { MijnWerk } from "./pages/MijnWerk";
import { Team } from "./pages/Team";
import { Projecten } from "./pages/Projecten";
import { Planning } from "./pages/Planning";
import { Voorschouwen } from "./pages/Voorschouwen";
import { Saneren } from "./pages/Saneren";
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
import { Kennisbank } from "./pages/Kennisbank";
import { Instellingen } from "./pages/Instellingen";
import { Klanten } from "./pages/Klanten";
import { meldingenVoor } from "./lib/meldingen";
import { zoekResultaten } from "./lib/zoeken";
import { Gebruikersbeheer } from "./pages/Gebruikersbeheer";
import { Module } from "./pages/Module";
import { NAV } from "./lib/nav";
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
  const { currentUser, hydrated, bedrijf, instellingen, verlof, taken, rondes, afspraken, voorschouwen, klanten, facturen, users, kennis, projects, projectPosts, tauwOpdrachten, saneringen } = useApp();
  const [active, setActive] = useState("overzicht");
  const [target, setTarget] = useState<NavTarget>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Bij (her)inloggen naar de juiste startpagina
  useEffect(() => {
    setActive(currentUser?.rol === "monteur" ? "mijnwerk" : "overzicht");
  }, [currentUser?.id]);

  // Navigeren naar een module, eventueel met een te openen item
  const navigeer = (key: string, t: NavTarget = null) => {
    setActive(key);
    setTarget(t);
    setMenuOpen(false);
  };

  if (!hydrated) return <Splash />;
  if (!currentUser) return <><Login /><DevSwitcher /></>;

  const item = NAV.find((n) => n.key === active);
  const titel = active === "overzicht" ? "Dashboard" : active === "planning" ? "Weekplanning" : item?.label ?? "Dashboard";
  const meldingen = meldingenVoor(currentUser, { taken, rondes, afspraken, voorschouwen, projects, projectPosts, tauwOpdrachten, saneringen, users, bedrijf, instellingen, verlof });

  const ga = (key: string) => navigeer(key);

  const render = () => {
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
      case "tauw":
        return <Tauw key={target?.tauwId ?? "lijst"} initieelTauw={target?.tauwId} />;
      case "agenda":
        return <Agenda />;
      case "verlof":
        return <Agenda startForm />;
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
        return <Medewerkers />;
      case "kennisbank":
        return <Kennisbank />;
      case "instellingen":
        return <Instellingen />;
      case "beheer":
        return <Gebruikersbeheer />;
      default:
        return <Module moduleKey={active} />;
    }
  };

  return (
    <NavContext.Provider value={{ navigeer }}>
    <div className="flex h-full overflow-hidden bg-ink-100">
      {/* Vaste zijbalk op desktop */}
      <div className="hidden md:flex">
        <Sidebar active={active} onSelect={ga} />
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
            <Sidebar active={active} onSelect={ga} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={titel}
          onMenu={() => setMenuOpen(true)}
          meldingen={meldingen}
          onMelding={(m) => { if (m.navKey) navigeer(m.navKey, m.target ?? null); }}
          onZoek={(q) => zoekResultaten(q, { afspraken, rondes, voorschouwen, klanten, facturen, users, kennis, projects }, currentUser)}
          onResultaat={(item) => navigeer(item.navKey, item.target ?? null)}
        />
        <main className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">{render()}</main>
      </div>

      {/* App-achtige onderbalk op mobiel */}
      <BottomNav active={active} onSelect={ga} onMeer={() => setMenuOpen(true)} />

      <DevSwitcher />
    </div>
    </NavContext.Provider>
  );
}
