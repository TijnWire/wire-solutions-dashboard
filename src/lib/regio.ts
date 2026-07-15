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

// Leidt de provincie af uit het postcode-gebied (eerste 2 cijfers). Benadering: postcodes lopen niet exact
// gelijk met provinciegrenzen, maar dit is prima voor een mappenstructuur. De Stedin-relevante gebieden
// (Zuid-Holland 20–33, 42; Utrecht 34–39) kloppen; oost/noord is bij benadering en makkelijk bij te stellen.
const PROVINCIE_PC2: Record<string, string> = {
  "10": "Noord-Holland", "11": "Noord-Holland", "12": "Noord-Holland", "13": "Flevoland",
  "14": "Noord-Holland", "15": "Noord-Holland", "16": "Noord-Holland", "17": "Noord-Holland",
  "18": "Noord-Holland", "19": "Noord-Holland", "20": "Noord-Holland", "21": "Noord-Holland",
  "22": "Zuid-Holland", "23": "Zuid-Holland", "24": "Zuid-Holland", "25": "Zuid-Holland",
  "26": "Zuid-Holland", "27": "Zuid-Holland", "28": "Zuid-Holland", "29": "Zuid-Holland",
  "30": "Zuid-Holland", "31": "Zuid-Holland", "32": "Zuid-Holland", "33": "Zuid-Holland",
  "34": "Utrecht", "35": "Utrecht", "36": "Utrecht", "37": "Utrecht", "38": "Utrecht", "39": "Utrecht",
  "40": "Gelderland", "41": "Gelderland", "42": "Zuid-Holland",
  "43": "Zeeland", "44": "Zeeland", "45": "Zeeland", "46": "Zeeland",
  "47": "Noord-Brabant", "48": "Noord-Brabant", "49": "Noord-Brabant", "50": "Noord-Brabant",
  "51": "Noord-Brabant", "52": "Noord-Brabant", "53": "Noord-Brabant", "54": "Noord-Brabant",
  "55": "Noord-Brabant", "56": "Noord-Brabant", "57": "Noord-Brabant",
  "58": "Limburg", "59": "Limburg", "60": "Limburg", "61": "Limburg", "62": "Limburg",
  "63": "Limburg", "64": "Limburg", "65": "Gelderland", "66": "Gelderland",
  "67": "Gelderland", "68": "Gelderland", "69": "Gelderland", "70": "Gelderland",
  "71": "Gelderland", "72": "Gelderland", "73": "Gelderland",
  "74": "Overijssel", "75": "Overijssel", "76": "Overijssel", "77": "Overijssel",
  "78": "Drenthe", "79": "Drenthe", "80": "Overijssel", "81": "Overijssel",
  "82": "Flevoland", "83": "Flevoland", "84": "Friesland", "85": "Friesland", "86": "Friesland",
  "87": "Friesland", "88": "Friesland", "89": "Friesland", "90": "Friesland", "91": "Friesland",
  "92": "Friesland", "93": "Drenthe", "94": "Drenthe",
  "95": "Groningen", "96": "Groningen", "97": "Groningen", "98": "Groningen", "99": "Groningen",
};

export function afleidProvincie(postcode: string): string {
  const pc2 = (postcode || "").replace(/\s/g, "").slice(0, 2);
  return PROVINCIE_PC2[pc2] ?? "Overig / onbekend";
}
