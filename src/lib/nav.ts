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
  Lock,
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
  Recycle,
  FlaskConical,
  Cable,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

export type NavGroup = "Werk" | "Projecten" | "Vragen" | "Operatie" | "Boekhouding" | "Systeem";

export type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  group: NavGroup;
  roles: Role[];
};

// HR ziet alles (personeelszaken/boekhouding) — daarom in élke rol-groep opgenomen.
const ALLE: Role[] = ["eigenaar", "beheer", "hr", "monteur"];
const LEIDING: Role[] = ["eigenaar", "beheer", "hr"];
const EIGENAAR: Role[] = ["eigenaar", "hr"]; // Toegang: eigenaar + HR

// Project-onderdelen waarvan de eigenaar de toegang per werknemer kan aan-/uitzetten (Toegang-pagina).
// Werk (Mijn werk, Projecten, Agenda, Mededelingen), Kennisbank en Communicatie blijven ALTIJD zichtbaar;
// Boekhouding, Klanten & Database en beheer zijn sowieso leiding-only (werknemers zien die niet).
export const WERKNEMER_TOEGANG: { key: string; label: string }[] = [
  { key: "brieven", label: "Brieven & Routes" },
  { key: "buurtaanpak", label: "Buurtaanpak" },
  { key: "saneren", label: "Saneren" },
  { key: "voorschouwen", label: "Voorschouwen" },
  { key: "schouwafspraken", label: "Schouwafspraken" },
  { key: "tauw", label: "TAUW" },
];
export const WERKNEMER_TOEGANG_KEYS = WERKNEMER_TOEGANG.map((x) => x.key);

export const NAV: NavItem[] = [
  { key: "mijnwerk", label: "Mijn werk", icon: ClipboardList, group: "Werk", roles: ALLE },
  { key: "agenda", label: "Agenda", icon: CalendarDays, group: "Werk", roles: ALLE },
  { key: "mededelingen", label: "Mededelingen", icon: Megaphone, group: "Werk", roles: ALLE },

  { key: "brieven", label: "Brieven & Routes", icon: Mailbox, group: "Projecten", roles: ALLE },
  { key: "buurtaanpak", label: "Buurtaanpak", icon: Cable, group: "Projecten", roles: ALLE },
  { key: "saneren", label: "Saneren", icon: Recycle, group: "Projecten", roles: ALLE },
  { key: "voorschouwen", label: "Voorschouwen", icon: ClipboardCheck, group: "Projecten", roles: ALLE },
  { key: "schouwafspraken", label: "Schouwafspraken", icon: CalendarClock, group: "Projecten", roles: ALLE },
  { key: "tauw", label: "TAUW", icon: FlaskConical, group: "Projecten", roles: ALLE },

  { key: "kennisbank", label: "Kennisbank", icon: BookOpen, group: "Vragen", roles: ALLE },

  { key: "afspraken", label: "Afspraken", icon: CalendarCheck, group: "Operatie", roles: LEIDING },
  { key: "documenten", label: "Documenten", icon: FileText, group: "Operatie", roles: LEIDING },

  { key: "projectbeheer", label: "Projectbeheer", icon: Briefcase, group: "Boekhouding", roles: LEIDING },
  { key: "facturen", label: "Facturen", icon: Receipt, group: "Boekhouding", roles: LEIDING },
  { key: "urenstaat", label: "Urenstaat", icon: Clock, group: "Boekhouding", roles: LEIDING },
  { key: "vrijedagen", label: "Vrije dagen", icon: Sun, group: "Boekhouding", roles: LEIDING },
  { key: "loonstroken", label: "Loonstroken", icon: Wallet, group: "Boekhouding", roles: LEIDING },
  { key: "boetes", label: "Boetes", icon: AlertTriangle, group: "Boekhouding", roles: LEIDING },
  { key: "verlof", label: "Verlof", icon: Plane, group: "Boekhouding", roles: LEIDING },
  { key: "medewerkers", label: "Medewerkers", icon: Users, group: "Boekhouding", roles: LEIDING },
  { key: "communicatie", label: "Communicatie", icon: MessagesSquare, badge: "AI", group: "Operatie", roles: ALLE },

  { key: "overzicht", label: "Dashboard", icon: LayoutDashboard, group: "Systeem", roles: LEIDING },
  { key: "team", label: "Team", icon: Users, group: "Systeem", roles: LEIDING },
  { key: "klanten", label: "Klanten & Database", icon: Database, group: "Systeem", roles: LEIDING },
  { key: "beheer", label: "Gebruikersbeheer", icon: UserCog, group: "Systeem", roles: LEIDING },
  { key: "toegang", label: "Toegang", icon: Lock, group: "Systeem", roles: EIGENAAR },
  { key: "instellingen", label: "Instellingen", icon: Settings, group: "Systeem", roles: LEIDING },
];

export const GROUPS: NavGroup[] = ["Werk", "Projecten", "Vragen", "Operatie", "Boekhouding", "Systeem"];

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
