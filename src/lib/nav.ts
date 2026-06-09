import {
  LayoutDashboard,
  CalendarCheck,
  Mailbox,
  FileText,
  Users,
  Database,
  MessagesSquare,
  BookOpen,
  UserCog,
  Settings,
  ClipboardList,
  ClipboardCheck,
  FolderKanban,
  Receipt,
  Wallet,
  AlertTriangle,
  CalendarDays,
  Plane,
  Recycle,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

export type NavGroup = "Werk" | "Projecten" | "Operatie" | "Boekhouding" | "Vragen" | "Systeem";

export type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  group: NavGroup;
  roles: Role[];
};

const ALLE: Role[] = ["eigenaar", "beheer", "monteur"];
const LEIDING: Role[] = ["eigenaar", "beheer"];

export const NAV: NavItem[] = [
  { key: "mijnwerk", label: "Mijn werk", icon: ClipboardList, group: "Werk", roles: ALLE },
  { key: "overzicht", label: "Dashboard", icon: LayoutDashboard, group: "Werk", roles: LEIDING },
  { key: "team", label: "Team", icon: Users, group: "Werk", roles: LEIDING },
  { key: "projecten", label: "Projecten", icon: FolderKanban, group: "Werk", roles: LEIDING },
  { key: "verlof", label: "Verlof", icon: Plane, group: "Werk", roles: ALLE },

  { key: "brieven", label: "Brieven & Routes", icon: Mailbox, group: "Projecten", roles: ALLE },
  { key: "saneren", label: "Saneren", icon: Recycle, group: "Projecten", roles: ALLE },
  { key: "voorschouwen", label: "Voorschouwen", icon: ClipboardCheck, group: "Projecten", roles: ALLE },
  { key: "tauw", label: "TAUW", icon: FlaskConical, group: "Projecten", roles: ALLE },

  { key: "afspraken", label: "Afspraken", icon: CalendarCheck, group: "Operatie", roles: ALLE },
  { key: "documenten", label: "Documenten", icon: FileText, group: "Operatie", roles: LEIDING },

  { key: "facturen", label: "Facturen", icon: Receipt, group: "Boekhouding", roles: LEIDING },
  { key: "loonstroken", label: "Loonstroken", icon: Wallet, group: "Boekhouding", roles: ALLE },
  { key: "boetes", label: "Boetes", icon: AlertTriangle, group: "Boekhouding", roles: ALLE },
  { key: "agenda", label: "Agenda", icon: CalendarDays, group: "Boekhouding", roles: ALLE },
  { key: "medewerkers", label: "Medewerkers", icon: Users, group: "Boekhouding", roles: LEIDING },
  { key: "communicatie", label: "Communicatie", icon: MessagesSquare, badge: "AI", group: "Operatie", roles: ALLE },
  { key: "klanten", label: "Klanten & Database", icon: Database, group: "Operatie", roles: LEIDING },

  { key: "kennisbank", label: "Kennisbank", icon: BookOpen, group: "Vragen", roles: ALLE },

  { key: "beheer", label: "Gebruikersbeheer", icon: UserCog, group: "Systeem", roles: LEIDING },
  { key: "instellingen", label: "Instellingen", icon: Settings, group: "Systeem", roles: LEIDING },
];

export const GROUPS: NavGroup[] = ["Werk", "Projecten", "Operatie", "Boekhouding", "Vragen", "Systeem"];

// Bepaalt of een gebruiker een menu-item mag zien.
// Beheerders zien beheer-onderdelen alleen als de eigenaar dat gebied heeft toegewezen.
export function magZien(user: { rol: Role; beheerRechten?: string[] }, item: NavItem): boolean {
  if (!item.roles.includes(user.rol)) return false;
  // Alleen voor beheerders, en alleen beheer-onderdelen (niet de items die ook voor werknemers zijn)
  if (user.rol === "beheer" && !item.roles.includes("monteur")) {
    if (!user.beheerRechten) return true; // geen beperking ingesteld = alles
    return user.beheerRechten.includes(item.key);
  }
  return true;
}
