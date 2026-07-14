// Verlof-goedkeuring die op DATABASE-niveau is afgedwongen.
//
// De verlofaanvragen zelf staan (net als voorheen) in de gedeelde wire_state-blob. De béslissing
// (goedkeuren/afwijzen) leeft in een aparte tabel `verlof_beslissingen`: alléén boekhouding-accounts
// mogen daar schrijven (de Cloudflare Worker checkt de rol via app_roles). Zo is de goedkeuring niet te
// omzeilen via de frontend — een gewone gebruiker krijgt hier een 403.
import { useEffect, useState } from "react";
import { cloudGet, cloudPost, supabaseAan } from "./supabase";
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
  const { rows } = await cloudGet<{ rows: VerlofBeslissing[] }>("/verlof");
  const out: Record<string, VerlofBeslissing> = {};
  for (const r of rows ?? []) out[r.verlof_id] = r;
  return out;
}

// Schrijft een goedkeuring/afwijzing weg. De Worker staat dit ALLEEN toe voor boekhouding-accounts.
export async function beslisVerlof(verlofId: string, status: VerlofStatus, doorEmail: string, doorNaam: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseAan) return { ok: false, error: "Geen databaseverbinding." };
  try {
    await cloudPost("/verlof", { verlof_id: verlofId, status, beslist_door_email: doorEmail, beslist_door_naam: doorNaam, beslist_op: new Date().toISOString() });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Hook: houdt de beslissingen actueel (start-fetch + poll elke 5s). `beschikbaar` is false bij een
// storing/geen verbinding — dan valt de UI terug op de status uit de blob.
export function useVerlofBeslissingen() {
  const [map, setMap] = useState<Record<string, VerlofBeslissing>>({});
  const [beschikbaar, setBeschikbaar] = useState(true);

  useEffect(() => {
    if (!supabaseAan) { setBeschikbaar(false); return; }
    let actief = true;
    const ververs = () => haalVerlofBeslissingen()
      .then((m) => { if (actief) { setMap(m); setBeschikbaar(true); } })
      .catch(() => { if (actief) setBeschikbaar(false); });
    void ververs();
    const iv = setInterval(() => void ververs(), 5000);
    return () => { actief = false; clearInterval(iv); };
  }, []);

  return { map, beschikbaar };
}
