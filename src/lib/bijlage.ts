// Bijlagen (PDF/foto) worden als data-URL in het record zelf bewaard, en alle records van een
// onderdeel staan samen in één rij in de centrale database. Die rij mag niet boven ~2 MB komen,
// anders weigert D1 hem (SQLITE_TOOBIG) en synchroniseert het hele onderdeel niet meer — precies
// wat eerder bij de voorschouwen misging. Vandaar een duidelijke grens per bestand.
export const MAX_BIJLAGE = 800 * 1024; // ~800 kB

export const bestandsGrootte = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;

export type BijlageResultaat = { ok: true; dataUrl: string; naam: string } | { ok: false; fout: string };

// Leest een bestand als data-URL. Te groot → een nette melding i.p.v. een kapotte sync.
export function leesBijlage(file: File): Promise<BijlageResultaat> {
  return new Promise((klaar) => {
    if (file.size > MAX_BIJLAGE) {
      klaar({ ok: false, fout: `Dit bestand is ${bestandsGrootte(file.size)}. Maximaal ${bestandsGrootte(MAX_BIJLAGE)} — anders loopt de synchronisatie vast. Verklein de PDF of maak er een foto van.` });
      return;
    }
    const r = new FileReader();
    r.onerror = () => klaar({ ok: false, fout: "Kon het bestand niet lezen. Probeer het opnieuw." });
    r.onloadend = () => klaar({ ok: true, dataUrl: r.result as string, naam: file.name });
    r.readAsDataURL(file);
  });
}

// Opent/downloadt een data-URL onder zijn eigen naam.
export function downloadBijlage(dataUrl: string, naam: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = naam || "bijlage";
  a.click();
}
