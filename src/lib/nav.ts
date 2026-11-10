import {
  LayoutDashboard,
  CalendarCheck,
  Mailbox,
  Sun,
  FileText,
  Users,
  Database,
  MessagesSquare,
  BookOpen,
  UserCog,
  Settings,
  ClipboardList,
  ClipboardCheck,
  Receipt,
  Wallet,
  Clock,
  AlertTriangle,
  CalendarDays,
  CalendarClock,
  Megaphone,
  Plane,
  Building2,
  Shovel,
  // Cable, — hoort bij Buurtaanpak; terug zodra die weer in het menu staat
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

export type NavGroup = "Werk" | "Projecten" | "Operatie" | "Boekhouding" | "Bedrijfsdata" | "Systeem";

export type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  group: NavGroup;
  roles: Role[];
  // Niet in het menu en de mobiele onderbalk, maar de pagina blijft gewoon bestaan en bereikbaar via
  // links (dashboard-tegels, meldingen, Mijn werk). De rol-controle (roles/magZien) blijft ook gelden.
  verborgen?: boolean;
};

// HR ziet alles (personeelszaken/boekhouding) — daarom in élke rol-groep opgenomen.
const ALLE: Role[] = ["eigenaar", "beheer", "hr", "monteur"];
const LEIDING: Role[] = ["eigenaar", "beheer", "hr"];

// Project-onderdelen waarvan de eigenaar de toegang per werknemer kan aan-/uitzetten (Toegang-pagina).
// Werk (Mijn werk, Projecten, Agenda, Mededelingen), Kennisbank en Communicatie blijven ALTIJD zichtbaar;
// Boekhouding, Klanten & Database en beheer zijn sowieso leiding-only (werknemers zien die niet).
export const WERKNEMER_TOEGANG: { key: string; label: string }[] = [
  { key: "brieven", label: "Brieven" },
  { key: "saneren", label: "Saneren" },
  { key: "voorschouwen", label: "Voorschouwen" },
  { key: "schouwafspraken", label: "Schouwafspraken" },
  { key: "tauw", label: "Bodemonderzoeken" },
];
export const WERKNEMER_TOEGANG_KEYS = WERKNEMER_TOEGANG.map((x) => x.key);

export const NAV: NavItem[] = [
  { key: "mijnwerk", label: "Mijn werk", icon: ClipboardList, group: "Werk", roles: ALLE },
  { key: "agenda", label: "Agenda", icon: CalendarDays, group: "Werk", roles: ALLE },
  { key: "mededelingen", label: "Mededelingen", icon: Megaphone, group: "Werk", roles: ALLE },

  { key: "brieven", label: "Brieven", icon: Mailbox, group: "Projecten", roles: ALLE },
  { key: "tauw", label: "Bodemonderzoeken", icon: Shovel, group: "Projecten", roles: ALLE },
  // Buurtaanpak staat tijdelijk niet in het menu (30-07-2026, op verzoek). De pagina, de gegevens en
  // de code blijven bestaan: zodra dit project weer begint, hoeft alleen deze regel terug.
  // { key: "buurtaanpak", label: "Buurtaanpak", icon: Waypoints, group: "Projecten", roles: ALLE },
  { key: "saneren", label: "Saneren", icon: Building2, group: "Projecten", roles: ALLE },
  { key: "voorschouwen", label: "Voorschouwen", icon: ClipboardCheck, group: "Projecten", roles: ALLE },
  { key: "schouwafspraken", label: "Schouwafspraken", icon: CalendarClock, group: "Projecten", roles: ALLE },

  // Afspraken staat niet meer in het menu (op verzoek). Pagina en gegevens blijven bestaan;
  // om het terug te zetten hoeft alleen `verborgen: true` weg.
  { key: "afspraken", label: "Afspraken", icon: CalendarCheck, group: "Operatie", roles: LEIDING, verborgen: true },
  // Documenten staat nu als tabblad in Klanten & Documenten; de losse pagina blijft bereikbaar.
  { key: "documenten", label: "Documenten", icon: FileText, group: "Operatie", roles: LEIDING, verborgen: true },
  { key: "communicatie", label: "Communicatie", icon: MessagesSquare, badge: "AI", group: "Operatie", roles: ALLE },
  { key: "kennisbank", label: "Kennisbank", icon: BookOpen, group: "Operatie", roles: ALLE },
  { key: "klanten", label: "Klanten & Documenten", icon: Database, group: "Operatie", roles: LEIDING },

  { key: "projectbeheer", label: "Projectbeheer", icon: Briefcase, group: "Boekhouding", roles: LEIDING },
  { key: "facturen", label: "Facturen", icon: Receipt, group: "Boekhouding", roles: LEIDING },
  { key: "urenstaat", label: "Urenstaat", icon: Clock, group: "Boekhouding", roles: LEIDING },
  // Loonstroken en Boetes staan ook bij de werknemer in het menu. De pagina's laten hem uitsluitend
  // zijn eigen regels zien (filter op medewerkerId) en alle knoppen om iets aan te maken, te wijzigen
  // of te verwijderen zijn leiding-only. Je eigen loonstrook is van jou; die van een ander niet.
  { key: "loonstroken", label: "Loonstroken", icon: Wallet, group: "Boekhouding", roles: ALLE },
  // Werknemers zien op Vrije dagen en Verlof uitsluitend hun eigen gegevens.
  { key: "vrijedagen", label: "Vrije dagen", icon: Sun, group: "Boekhouding", roles: ALLE },
  { key: "verlof", label: "Verlof", icon: Plane, group: "Boekhouding", roles: ALLE },
  { key: "boetes", label: "Boetes", icon: AlertTriangle, group: "Boekhouding", roles: ALLE },
  { key: "medewerkers", label: "Medewerkers", icon: Users, group: "Boekhouding", roles: LEIDING },

  { key: "overzicht", label: "Dashboard", icon: LayoutDashboard, group: "Bedrijfsdata", roles: LEIDING },
  { key: "team", label: "Team", icon: Users, group: "Bedrijfsdata", roles: LEIDING },
  { key: "beheer", label: "Gebruikers & toegang", icon: UserCog, group: "Systeem", roles: LEIDING },
  // Bij de werknemer staat hier alleen het tabblad Sync & back-up: kan mijn telefoon bij de gegevens
  // van het team? Dat wil je zelf kunnen nakijken zonder eerst iemand te moeten bellen.
  { key: "instellingen", label: "Instellingen", icon: Settings, group: "Systeem", roles: ALLE },
];

export const GROUPS: NavGroup[] = ["Werk", "Projecten", "Operatie", "Boekhouding", "Bedrijfsdata", "Systeem"];

// Bepaalt of een gebruiker een menu-item mag zien.
// Beheerders zien beheer-onderdelen alleen als de eigenaar dat gebied heeft toegewezen.
export function magZien(user: { rol: Role; beheerRechten?: string[]; toegang?: string[] }, item: NavItem): boolean {
  if (!item.roles.includes(user.rol)) return false;
  // Alleen voor beheerders, en alleen beheer-onderdelen (niet de items die ook voor werknemers zijn)
  if (user.rol === "beheer" && !item.roles.includes("monteur")) {
    if (!user.beheerRechten) return true; // geen beperking ingesteld = alles
    return user.beheerRechten.includes(item.key);
  }
  // Werknemer: de eigenaar kan de toegang tot werk-onderdelen per persoon beperken.
  if (user.rol === "monteur" && WERKNEMER_TOEGANG_KEYS.includes(item.key)) {
    if (!user.toegang) return true; // geen beperking ingesteld = alles
    return user.toegang.includes(item.key);
  }
  return true;
}
