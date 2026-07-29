// Foto's opslaan buiten de synchronisatie.
// ─────────────────────────────────────────────────────────────────────────────
// Een foto stond tot nu toe als data-URL ín de gegevens die tussen alle apparaten heen en weer gaan.
// Eén voorschouwblok werd daardoor bijna 18 MB, en één toegevoegde foto liet dat hele blok opnieuw
// rondgaan — bij iedereen. Nu gaat de foto naar R2 en bewaren we alleen de naam.
//
// De rest van de app blijft met strings werken: waar eerst "data:image/jpeg;base64,…" stond, staat nu
// "r2:voorschouw/2026-07-29/abc…jpg". Overal waar een foto wordt getoond gaat die string door
// fotoUrl(), en die geeft van allebei de vormen een bruikbare bron terug. Zo hoeven de bestaande
// foto's niet eerst omgezet te worden voordat de app het weer doet.

import { CLOUD_API_URL, leesToken } from "./supabase";

const MERK = "r2:";

export const isR2Foto = (v: string) => typeof v === "string" && v.startsWith(MERK);

// Waar haalt de browser deze foto vandaan? Een data-URL is zichzelf al; een R2-naam wordt een adres.
export function fotoUrl(v: string): string {
  if (!isR2Foto(v)) return v;
  return `${CLOUD_API_URL}/foto/${v.slice(MERK.length).split("/").map(encodeURIComponent).join("/")}`;
}

// Een data-URL omzetten naar bytes, zodat we hem als bestand kunnen versturen in plaats van als
// tekst. Base64 is een derde groter dan het origineel; dat scheelt dus ook nog eens.
function dataUrlNaarBlob(dataUrl: string): { blob: Blob; soort: string } | null {
  const m = /^data:([^;,]+)[^,]*,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const soort = m[1] || "image/jpeg";
  try {
    const ruw = atob(m[2]);
    const bytes = new Uint8Array(ruw.length);
    for (let i = 0; i < ruw.length; i++) bytes[i] = ruw.charCodeAt(i);
    return { blob: new Blob([bytes], { type: soort }), soort };
  } catch { return null; }
}

// Opslaan. Lukt het niet — geen bereik, fotoruimte staat uit — dan geven we de data-URL gewoon terug.
// Dan werkt alles zoals vroeger en raakt er niets kwijt; bij een volgende poging gaat hij alsnog mee.
export async function bewaarFoto(dataUrl: string): Promise<string> {
  if (isR2Foto(dataUrl)) return dataUrl;
  const om = dataUrlNaarBlob(dataUrl);
  const token = leesToken();
  if (!om || !token) return dataUrl;
  try {
    const r = await fetch(`${CLOUD_API_URL}/foto`, {
      method: "POST",
      headers: { "content-type": om.soort, Authorization: `Bearer ${token}` },
      body: om.blob,
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return dataUrl;
    const uit = (await r.json()) as { naam?: string };
    return uit.naam ? `${MERK}${uit.naam}` : dataUrl;
  } catch { return dataUrl; }
}

// Een hele lijst; wat niet lukt blijft gewoon een data-URL.
export async function bewaarFotos(lijst: string[]): Promise<string[]> {
  const uit: string[] = [];
  for (const f of lijst) uit.push(await bewaarFoto(f));
  return uit;
}
