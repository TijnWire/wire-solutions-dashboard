// Het bedrijfslogo — instelbaar in de app (Instellingen → Bedrijf & logo).
// ─────────────────────────────────────────────────────────────────────────────
// Waar eerst overal hard "/wire-logo.png" stond, gaat het nu via logoSrc(bedrijf): staat er een eigen
// logo (data-URL) in de bedrijfsgegevens, dan gebruiken we dat; anders het standaard bestand in public/.
// Zo kun je het logo vanuit de app wijzigen zonder een bestand te vervangen, en het synct mee naar alle
// apparaten (want het zit in de bedrijfsgegevens, die al gesynchroniseerd worden).
import type { Bedrijf } from "./types";

export const STANDAARD_LOGO = "/wire-logo.png";

export function logoSrc(bedrijf?: Pick<Bedrijf, "logo"> | null): string {
  const eigen = bedrijf?.logo?.trim();
  return eigen ? eigen : STANDAARD_LOGO;
}

// Een gekozen logobestand naar een nette, kleine PNG data-URL. PNG (niet JPEG) zodat transparantie
// behouden blijft; "contain" op een canvas zodat het logo niet wordt uitgesneden. Ruim onder een paar
// honderd kB, zodat het licht meesynchroniseert.
export function logoNaarDataUrl(file: File, maxZijde = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kon bestand niet lezen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Kon afbeelding niet laden"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxZijde || height > maxZijde) {
          const schaal = Math.min(maxZijde / width, maxZijde / height);
          width = Math.round(width * schaal);
          height = Math.round(height * schaal);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas niet beschikbaar"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
