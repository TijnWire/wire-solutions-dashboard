// Pure datum-helpers voor de weekplanning (gedeeld door de editor en de Excel-export).

// "2026-06-02" → "Dinsdag"
export function dagnaam(iso: string): string {
  if (!iso) return "";
  const n = new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long" });
  return n.charAt(0).toUpperCase() + n.slice(1);
}

// "2026-06-02" → "2-jun" (zoals de template-kolom "Week")
export function datumKort(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00")
    .toLocaleDateString("nl-NL", { day: "numeric", month: "short" })
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/, "-");
}

// Volgende werkdag (ma–vr). Zonder argument: eerstvolgende werkdag vanaf vandaag.
export function volgendeWerkdag(naIso?: string): string {
  const basis = naIso ? new Date(naIso + "T00:00:00") : new Date();
  const d = new Date(basis.getTime());
  if (naIso) d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  // Lokale ISO-datum (geen UTC-shift).
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dag = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dag}`;
}
