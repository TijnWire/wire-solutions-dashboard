// Verlof-goedkeuring die op DATABASE-niveau is afgedwongen.
//
// De verlofaanvragen zelf staan (net als voorheen) in de gedeelde wire_state-blob. De béslissing
// (goedkeuren/afwijzen) leeft in een aparte Supabase-tabel `verlof_beslissingen` met RLS: alléén
// boekhouding-accounts mogen daar schrijven (zie supabase/fase2.sql, functie is_boekhouding()).
// Zo is de goedkeuring niet te omzeilen via de frontend — een gewone gebruiker krijgt hier een fout.
import { useEffect, useState } from "react";
import { sb, supabaseAan } from "./supabase";
import type { VerlofStatus } from "./types";

export type VerlofBeslissing = {
  verlof_id: string;
  status: VerlofStatus;
  beslist_door_email: string;
  beslist_door_naam: string;
  beslist_op: string;
};

export async function haalVerlofBeslissingen(): Promise<Record<string, VerlofBeslissing>> {
  if (!supabaseAan) return {};
  const { data, error } = await sb().from("verlof_beslissingen").select("*");
  if (error) throw error;
  const out: Record<string, VerlofBeslissing> = {};
  for (const r of (data ?? []) as VerlofBeslissing[]) out[r.verlof_id] = r;
  return out;
}

// Schrijft een goedkeuring/afwijzing weg. RLS staat dit ALLEEN toe voor boekhouding-accounts.
export async function beslisVerlof(verlofId: string, status: VerlofStatus, doorEmail: string, doorNaam: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseAan) return { ok: false, error: "Geen databaseverbinding." };
  const { error } = await sb().from("verlof_beslissingen").upsert(
    { verlof_id: verlofId, status, beslist_door_email: doorEmail, beslist_door_naam: doorNaam, beslist_op: new Date().toISOString() },
    { onConflict: "verlof_id" }
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Hook: houdt de beslissingen actueel (start-fetch + realtime). `beschikbaar` is false als de tabel
// nog niet bestaat (vóór het draaien van supabase/fase2.sql) — dan valt de UI terug op de blob-status.
export function useVerlofBeslissingen() {
  const [map, setMap] = useState<Record<string, VerlofBeslissing>>({});
  const [beschikbaar, setBeschikbaar] = useState(true);

  useEffect(() => {
    if (!supabaseAan) { setBeschikbaar(false); return; }
    let actief = true;
    const ververs = () => haalVerlofBeslissingen().then((m) => { if (actief) { setMap(m); setBeschikbaar(true); } }).catch(() => { if (actief) setBeschikbaar(false); });
    void ververs();
    const kanaal = sb()
      .channel("verlof_beslissingen")
      .on("postgres_changes", { event: "*", schema: "public", table: "verlof_beslissingen" }, () => { void ververs(); })
      .subscribe();
    return () => { actief = false; void sb().removeChannel(kanaal); };
  }, []);

  return { map, beschikbaar };
}
