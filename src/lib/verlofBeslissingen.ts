// Verlof-goedkeuring.
// (Firebase-migratie) De DB-afgedwongen goedkeuring draaide op een Supabase-tabel `verlof_beslissingen`
// met RLS (alleen boekhouding mag schrijven). Op Firebase wordt dat later herbouwd als een Firestore-
// collectie met beveiligingsregels. Tot die tijd is `beschikbaar` false → de UI valt terug op de
// goedkeuring via de gedeelde blob (zoals vóór fase 2): boekhouding keurt goed, gespiegeld in wire_state.
import { useState } from "react";
import type { VerlofStatus } from "./types";

export type VerlofBeslissing = {
  verlof_id: string;
  status: VerlofStatus;
  beslist_door_email: string;
  beslist_door_naam: string;
  beslist_op: string;
};

export async function haalVerlofBeslissingen(): Promise<Record<string, VerlofBeslissing>> {
  return {};
}

export async function beslisVerlof(_verlofId: string, _status: VerlofStatus, _doorEmail: string, _doorNaam: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: "Server-goedkeuring draait nog niet op Firebase." };
}

export function useVerlofBeslissingen() {
  const [map] = useState<Record<string, VerlofBeslissing>>({});
  return { map, beschikbaar: false };
}
