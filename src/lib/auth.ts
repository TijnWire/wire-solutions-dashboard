// Wachtwoord-hashing met PBKDF2-SHA-256 (Web Crypto). We bewaren NOOIT het wachtwoord zelf,
// alleen een salted hash. Let op: dit is een frontend-app — voor échte beveiliging hoort verificatie
// op een server. Dit is de best mogelijke bescherming binnen een lokale app.

export const PBKDF2_ITERATIES = 150000;

export type Credential = { wachtwoordHash: string; wachtwoordSalt: string; wachtwoordIter: number };

const enc = new TextEncoder();

function bytesNaarBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64NaarBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function deriveer(wachtwoord: string, salt: Uint8Array, iteraties: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(wachtwoord), "PBKDF2", false, ["deriveBits"]);
  const params: Pbkdf2Params = { name: "PBKDF2", salt: salt as BufferSource, iterations: iteraties, hash: "SHA-256" };
  const bits = await crypto.subtle.deriveBits(params, key, 256);
  return bytesNaarBase64(bits);
}

// Maakt een nieuwe credential (random salt) voor een wachtwoord.
export async function hashWachtwoord(wachtwoord: string): Promise<Credential> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wachtwoordHash = await deriveer(wachtwoord, salt, PBKDF2_ITERATIES);
  return { wachtwoordHash, wachtwoordSalt: bytesNaarBase64(salt.buffer), wachtwoordIter: PBKDF2_ITERATIES };
}

// Controleert een ingevoerd wachtwoord tegen een opgeslagen credential (constante-tijd vergelijking).
export async function verifieerWachtwoord(wachtwoord: string, cred: Credential): Promise<boolean> {
  if (!cred.wachtwoordHash || !cred.wachtwoordSalt) return false;
  let berekend: string;
  try {
    berekend = await deriveer(wachtwoord, base64NaarBytes(cred.wachtwoordSalt), cred.wachtwoordIter || PBKDF2_ITERATIES);
  } catch {
    return false;
  }
  return gelijkInConstanteTijd(berekend, cred.wachtwoordHash);
}

// Genereert een sterk, leesbaar wachtwoord (geen ambigue tekens) — voor het aanmaken/resetten van accounts.
export function genereerWachtwoord(len = 16): string {
  const alfa = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const cijf = "23456789";
  const symb = "!@#%&*+=?";
  const pool = alfa + cijf + symb;
  const kies = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars: string[] = [kies(cijf), kies(cijf), kies(symb), kies(symb)];
  while (chars.length < len) chars.push(kies(pool));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function gelijkInConstanteTijd(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}
