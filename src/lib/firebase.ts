// ─────────────────────────────────────────────────────────────────────────────
// Firebase-backend voor de centrale sync (vervanging van lib/supabase.ts).
// Zelfde interface (sb*-functies) zodat de rest van de app ongewijzigd blijft, plus twee helpers
// (cloudAuthListener, cloudRealtime) die in AppContext de Supabase-specifieke realtime/auth-listener
// vervangen. Data-model in Firestore: collectie "wire_state", één (meta-)document per onderdeel (key),
// met de inhoud als JSON-STRING in het veld dataStr + updated_at. Grote onderdelen (foto's/PDF's) worden
// automatisch in stukken gesplitst over extra docs "key::0", "key::1", … zodat de 1 MB/doc-limiet van
// Firestore nooit geraakt wordt.
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, type Auth,
} from "firebase/auth";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, onSnapshot, query, where, documentId, writeBatch, limit, type Firestore,
} from "firebase/firestore";

// ── Firebase web-config (net als de Supabase anon-key: publiek; de beveiliging zit in de Firestore-regels) ──
// VUL IN met de config uit je Firebase-project (Project settings → General → "Your apps" → SDK setup).
const firebaseConfig = {
  apiKey: "AIzaSyC18h0HZ2xHmRk3ny1VmAiGvK9HXMiqeN0",
  authDomain: "wire-solutions-b5b02.firebaseapp.com",
  projectId: "wire-solutions-b5b02",
  storageBucket: "wire-solutions-b5b02.firebasestorage.app",
  messagingSenderId: "481467205794",
  appId: "1:481467205794:web:0126c69e22208500e56ffb",
};

// Of de centrale database geconfigureerd is. Zonder echte config draait de app gewoon local-first.
export const firebaseAan = !firebaseConfig.apiKey.startsWith("VUL");
// Alias voor bestaande code die 'supabaseAan' verwacht — zo hoeft de rest niet omgeschreven.
export const supabaseAan = firebaseAan;

let app: FirebaseApp | null = null;
function fb(): FirebaseApp { if (!app) app = initializeApp(firebaseConfig); return app; }
function db(): Firestore { return getFirestore(fb()); }
function auth(): Auth { return getAuth(fb()); }

const COL = "wire_state";
const MAX = 900_000; // ruim onder Firestore's 1 MB/doc; grotere onderdelen worden gesplitst
const isChunk = (id: string) => id.includes("::");

// Race een belofte tegen een timeout — zodat een storing de login/sync NOOIT laat hangen.
function metTimeout<T>(p: Promise<T>, ms: number, bijTimeout: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let klaar = false;
    const af = (v: T) => { if (!klaar) { klaar = true; clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => af(bijTimeout), ms);
    p.then(af, () => af(bijTimeout));
  });
}

// ── Gedeelde data ──
// Verwijder chunk-docs van deze key met index >= houdN (opruimen na een kleinere/nieuwe versie).
async function ruimChunksOp(key: string, houdN: number): Promise<void> {
  try {
    const q = query(collection(db(), COL), where(documentId(), ">=", `${key}::`), where(documentId(), "<", `${key}::￿`));
    const snap = await getDocs(q);
    const batch = writeBatch(db());
    let n = 0;
    snap.forEach((d) => { const i = Number(d.id.slice(d.id.indexOf("::") + 2)); if (i >= houdN) { batch.delete(d.ref); n++; } });
    if (n) await batch.commit();
  } catch { /* niet kritisch */ }
}

export async function sbSchrijf(key: string, data: unknown): Promise<string> {
  const updated_at = new Date().toISOString();
  const s = JSON.stringify(data ?? null);
  const d = db();
  if (s.length <= MAX) {
    await setDoc(doc(d, COL, key), { dataStr: s, updated_at, chunks: 0 });
    await ruimChunksOp(key, 0);
  } else {
    const parts: string[] = [];
    for (let i = 0; i < s.length; i += MAX) parts.push(s.slice(i, i + MAX));
    const batch = writeBatch(d);
    batch.set(doc(d, COL, key), { updated_at, chunks: parts.length });
    parts.forEach((p, i) => batch.set(doc(d, COL, `${key}::${i}`), { part: p }));
    await batch.commit();
    await ruimChunksOp(key, parts.length);
  }
  return updated_at;
}

// Zet een meta-doc (+ evt. chunk-parts) om naar de oorspronkelijke waarde.
function reassembleer(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

export async function sbLeesAlles(): Promise<Record<string, unknown>> {
  const snap = await getDocs(collection(db(), COL));
  const metas: Record<string, { chunks?: number; dataStr?: string }> = {};
  const parts: Record<string, Record<number, string>> = {};
  snap.forEach((s) => {
    const id = s.id;
    if (isChunk(id)) {
      const key = id.slice(0, id.indexOf("::"));
      const i = Number(id.slice(id.indexOf("::") + 2));
      (parts[key] ??= {})[i] = (s.data() as { part?: string }).part ?? "";
    } else {
      metas[id] = s.data() as { chunks?: number; dataStr?: string };
    }
  });
  const out: Record<string, unknown> = {};
  for (const [key, meta] of Object.entries(metas)) {
    if (key === "synctest") continue;
    const str = meta.chunks && meta.chunks > 0
      ? Array.from({ length: meta.chunks }, (_, i) => parts[key]?.[i] ?? "").join("")
      : (meta.dataStr ?? "null");
    out[key] = reassembleer(str);
  }
  return out;
}

// Lichtgewicht: alleen key + updated_at (van de meta-docs) — om te zien wat er gewijzigd is.
export async function sbVersies(): Promise<Record<string, string>> {
  const snap = await getDocs(collection(db(), COL));
  const out: Record<string, string> = {};
  snap.forEach((s) => { if (isChunk(s.id)) return; const u = (s.data() as { updated_at?: string }).updated_at; if (u) out[s.id] = u; });
  return out;
}

async function leesEen(key: string): Promise<unknown | undefined> {
  const metaSnap = await getDoc(doc(db(), COL, key));
  if (!metaSnap.exists()) return undefined;
  const meta = metaSnap.data() as { chunks?: number; dataStr?: string };
  let str: string;
  if (meta.chunks && meta.chunks > 0) {
    const stukken = await Promise.all(Array.from({ length: meta.chunks }, (_, i) => getDoc(doc(db(), COL, `${key}::${i}`))));
    str = stukken.map((p) => (p.exists() ? (p.data() as { part?: string }).part ?? "" : "")).join("");
  } else {
    str = meta.dataStr ?? "null";
  }
  return reassembleer(str);
}

export async function sbLeesKeys(keys: string[]): Promise<Record<string, unknown>> {
  if (!keys.length) return {};
  const out: Record<string, unknown> = {};
  await Promise.all(keys.map(async (key) => { const v = await leesEen(key); if (v !== undefined) out[key] = v; }));
  return out;
}

// Realtime: roept onChange aan bij elke wijziging van een onderdeel (chunk-docs worden genegeerd; bij een
// gechunkt onderdeel lezen we de volledige waarde opnieuw in). Geeft een opzeg-functie terug.
export function cloudRealtime(onChange: (key: string, data: unknown, updated_at: string) => void): () => void {
  return onSnapshot(
    collection(db(), COL),
    (snap) => {
      snap.docChanges().forEach((chg) => {
        const id = chg.doc.id;
        if (isChunk(id) || chg.type === "removed") return;
        const meta = chg.doc.data() as { chunks?: number; dataStr?: string; updated_at?: string };
        const updated_at = meta.updated_at ?? "";
        if (meta.chunks && meta.chunks > 0) {
          void leesEen(id).then((v) => { if (v !== undefined) onChange(id, v, updated_at); });
        } else {
          onChange(id, reassembleer(meta.dataStr ?? "null"), updated_at);
        }
      });
    },
    () => { /* fout genegeerd — de vangnet-poll haalt wijzigingen alsnog op */ },
  );
}

// ── Auth ──
export async function sbLogin(email: string, wachtwoord: string): Promise<boolean> {
  return metTimeout(
    (async () => { try { await signInWithEmailAndPassword(auth(), email.trim().toLowerCase(), wachtwoord); return true; } catch { return false; } })(),
    8000, false,
  );
}

export async function sbRegistreer(email: string, wachtwoord: string): Promise<boolean> {
  return metTimeout(
    (async () => {
      try { await createUserWithEmailAndPassword(auth(), email.trim().toLowerCase(), wachtwoord); return true; }
      catch (e) { const m = (e as { code?: string; message?: string }); return /already-in-use|already|exists/i.test(`${m?.code} ${m?.message}`); }
    })(),
    8000, false,
  );
}

export async function sbLogout(): Promise<void> { try { await signOut(auth()); } catch { /* netwerk weg — lokaal toch uitloggen */ } }

// Werkt het eigen wachtwoord in Firebase Auth bij (de gebruiker heeft een sessie). Geeft false bij geen sessie/fout.
export async function wijzigEigenWachtwoord(nieuw: string): Promise<boolean> {
  try { const u = auth().currentUser; if (!u) return false; await updatePassword(u, nieuw); return true; } catch { return false; }
}

export async function sbSessieEmail(): Promise<string | null> { return auth().currentUser?.email ?? null; }

// Luistert op in-/uitloggen. Geeft een opzeg-functie terug.
export function cloudAuthListener(cb: (ingelogd: boolean) => void): () => void {
  return onAuthStateChanged(auth(), (user) => cb(!!user));
}

// ── Automatisch verbonden blijven (alleen lokaal op dit apparaat bewaard, niet in de cloud/repo) ──
const SC_KEY = "wire.sc";
const codeer = (s: string) => { try { return btoa(unescape(encodeURIComponent(s))); } catch { return ""; } };
const decodeer = (s: string) => { try { return decodeURIComponent(escape(atob(s))); } catch { return ""; } };

export function bewaarSyncCred(email: string, wachtwoord: string): void {
  try { localStorage.setItem(SC_KEY, codeer(JSON.stringify({ e: email.trim().toLowerCase(), w: wachtwoord }))); } catch { /* opslag niet beschikbaar */ }
}
export function wisSyncCred(): void { try { localStorage.removeItem(SC_KEY); } catch { /* niets */ } }
function leesSyncCred(): { e: string; w: string } | null {
  try { const v = localStorage.getItem(SC_KEY); if (!v) return null; const o = JSON.parse(decodeer(v)); return o?.e && o?.w ? o : null; } catch { return null; }
}

// Firebase bewaart de sessie zelf (IndexedDB). We wachten kort tot die geladen is; anders melden we ons
// stil opnieuw aan met de lokaal bewaarde gegevens (self-healing).
export async function sbHerstelSessie(): Promise<boolean> {
  return metTimeout(
    (async () => {
      const ingelogd = await new Promise<boolean>((res) => { const off = onAuthStateChanged(auth(), (u) => { off(); res(!!u); }); });
      if (ingelogd) return true;
      const cred = leesSyncCred();
      if (!cred) return false;
      if (await sbLogin(cred.e, cred.w)) return true;
      await sbRegistreer(cred.e, cred.w);
      return await sbLogin(cred.e, cred.w);
    })(),
    10000, false,
  );
}

// ── Diagnose (Instellingen → Integraties → "Sync testen") ──
export type SyncTest = { sessie: boolean; email: string | null; lezen: boolean; schrijven: boolean; melding: string };
export async function sbSyncTest(): Promise<SyncTest> {
  const r: SyncTest = { sessie: false, email: null, lezen: false, schrijven: false, melding: "" };
  try {
    const u = auth().currentUser;
    r.sessie = !!u;
    r.email = u?.email ?? null;
    if (!r.sessie) {
      r.melding = "Niet verbonden met de centrale database (geen sessie). Log uit en opnieuw in. Blijft dit? Controleer de Firebase-config en de aanmeldmethode (Email/Password) in Firebase Authentication.";
      return r;
    }
    try { await getDocs(query(collection(db(), COL), limit(1))); r.lezen = true; }
    catch (e) { r.melding = `Wel ingelogd (${r.email}), maar lezen wordt geblokkeerd: ${e instanceof Error ? e.message : String(e)}. Controleer de Firestore-beveiligingsregels.`; return r; }
    try { await setDoc(doc(db(), COL, "synctest"), { dataStr: JSON.stringify({ door: r.email, op: new Date().toISOString() }), updated_at: new Date().toISOString(), chunks: 0 }); r.schrijven = true; }
    catch (e) { r.melding = `Lezen lukt, maar schrijven wordt geblokkeerd: ${e instanceof Error ? e.message : String(e)}. Controleer de Firestore-beveiligingsregels.`; return r; }
    r.melding = `Alles werkt — dit apparaat (${r.email}) leest én schrijft naar de centrale database. Wijzigingen worden gedeeld.`;
  } catch (e) {
    r.melding = `Onverwachte fout: ${e instanceof Error ? e.message : String(e)}`;
  }
  return r;
}

export async function sbAantallen(): Promise<{ ok: boolean; aantallen: Record<string, number>; fout?: string }> {
  try {
    const remote = await sbLeesAlles();
    const aantallen: Record<string, number> = {};
    for (const [k, v] of Object.entries(remote)) aantallen[k] = Array.isArray(v) ? v.length : v ? 1 : 0;
    return { ok: true, aantallen };
  } catch (e) {
    return { ok: false, aantallen: {}, fout: e instanceof Error ? e.message : String(e) };
  }
}
