// Talen die klanten van Stedin vaak spreken
export const TALEN: { code: string; label: string; spraak: string }[] = [
  { code: "en", label: "Engels", spraak: "en-US" },
  { code: "tr", label: "Turks", spraak: "tr-TR" },
  { code: "ar", label: "Arabisch", spraak: "ar-SA" },
  { code: "pl", label: "Pools", spraak: "pl-PL" },
  { code: "uk", label: "Oekraïens", spraak: "uk-UA" },
  { code: "fr", label: "Frans", spraak: "fr-FR" },
  { code: "de", label: "Duits", spraak: "de-DE" },
  { code: "es", label: "Spaans", spraak: "es-ES" },
  { code: "ro", label: "Roemeens", spraak: "ro-RO" },
  { code: "pt", label: "Portugees", spraak: "pt-PT" },
];

export const NL = { code: "nl", spraak: "nl-NL" };

// Vertaalt tekst via een gratis (sleutelloze) vertaaldienst.
// Tijdelijk — later te vervangen door de Claude-API in de cloud.
export async function vertaalTekst(tekst: string, van: string, naar: string): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${van}&tl=${naar}&dt=t&q=${encodeURIComponent(tekst)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Vertaaldienst niet bereikbaar");
  const data = await res.json();
  return (data[0] as [string][]).map((seg) => seg[0]).join("");
}

// Spreekt tekst uit in de gekozen taal (browser-stem).
export function sprekenUit(tekst: string, spraakCode: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(tekst);
  u.lang = spraakCode;
  const stem = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(spraakCode.split("-")[0]));
  if (stem) u.voice = stem;
  window.speechSynthesis.speak(u);
}

// Telefoonnummer naar internationaal formaat (NL).
export function normTel(tel: string): string {
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "31" + d.slice(1);
  return d;
}

export function waUrl(tel: string, tekst: string): string {
  return `https://wa.me/${normTel(tel)}?text=${encodeURIComponent(tekst)}`;
}

export function smsUrl(tel: string, tekst: string): string {
  return `sms:${tel.replace(/\s/g, "")}?body=${encodeURIComponent(tekst)}`;
}

// Vult {klant} {datum} {tijd} {adres} {x} {y} in een sjabloon.
export function vulSjabloon(sjabloon: string, velden: Record<string, string>): string {
  return sjabloon.replace(/\{(\w+)\}/g, (_, k) => velden[k] ?? `{${k}}`);
}
