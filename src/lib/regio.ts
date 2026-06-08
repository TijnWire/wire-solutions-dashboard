// Leidt een werkregio af uit de postcode (4-cijferprefix), met de plaats als terugval.
// Uitbreidbaar: vul de tabel aan met de echte Stedin-postcodegebieden.
const PREFIX_REGIO: Record<string, string> = {
  "3081": "Rotterdam-Zuid",
  "3082": "Rotterdam-Zuid",
  "3083": "Rotterdam-Zuid",
  "3084": "Rotterdam-Zuid",
  "3000": "Rotterdam-Centrum",
  "3011": "Rotterdam-Centrum",
  "3012": "Rotterdam-Centrum",
  "3032": "Rotterdam-Noord",
  "3033": "Rotterdam-Noord",
  "3071": "Rotterdam-Kralingen",
  "3072": "Rotterdam-Kralingen",
  "3111": "Schiedam",
  "3112": "Schiedam",
  "3119": "Schiedam",
  "3121": "Schiedam",
  "3131": "Vlaardingen",
  "3132": "Vlaardingen",
  "3133": "Vlaardingen",
  "3134": "Vlaardingen",
  "2901": "Capelle a/d IJssel",
  "2902": "Capelle a/d IJssel",
  "2903": "Capelle a/d IJssel",
};

export function afleidRegio(postcode: string, plaats: string): string {
  const prefix = (postcode || "").replace(/\s/g, "").slice(0, 4);
  return PREFIX_REGIO[prefix] ?? (plaats.trim() || "Onbekend");
}
