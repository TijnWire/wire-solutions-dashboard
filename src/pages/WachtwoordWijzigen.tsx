import { useState } from "react";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useApp } from "../store/AppContext";
import { hashWachtwoord } from "../lib/auth";
import { sb, supabaseAan, bewaarSyncCred } from "../lib/supabase";

// Verplicht scherm ná een door de beheerder afgedwongen reset: de medewerker kiest hier zelf een
// nieuw wachtwoord voordat hij verder kan. Zo wordt het tijdelijke wachtwoord meteen vervangen en
// staat er nergens een leesbaar wachtwoord — alleen de hash (lokaal) en Supabase Auth (echt).
export function WachtwoordWijzigen() {
  const { currentUser, updateUser, logout } = useApp();
  const [nw, setNw] = useState("");
  const [herhaal, setHerhaal] = useState("");
  const [toon, setToon] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  if (!currentUser) return null;

  const opslaan = async () => {
    setFout("");
    if (nw.length < 8) return setFout("Kies een wachtwoord van minstens 8 tekens.");
    if (nw !== herhaal) return setFout("De twee wachtwoorden zijn niet gelijk.");
    setBezig(true);
    try {
      // 1) Echt wachtwoord in Supabase Auth bijwerken (de medewerker heeft een sessie via het tijdelijke wachtwoord).
      if (supabaseAan) {
        try { await sb().auth.updateUser({ password: nw }); } catch { /* geen sessie? dan blijft de lokale hash leidend */ }
      }
      // 2) Lokale hash bijwerken + de force-vlag uitzetten.
      const cred = await hashWachtwoord(nw);
      updateUser(currentUser.id, { ...cred, moetWachtwoordWijzigen: false });
      // 3) De lokaal bewaarde inloggegevens verversen zodat automatisch verbinden blijft werken.
      bewaarSyncCred(currentUser.email, nw);
    } finally {
      setBezig(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <div className="flex h-full items-center justify-center bg-ink-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600"><ShieldCheck className="h-6 w-6" /></div>
          <div>
            <h1 className="text-lg font-bold text-ink-900">Kies een nieuw wachtwoord</h1>
            <p className="text-sm text-ink-500">Je wachtwoord is opnieuw ingesteld door de beheerder. Kies nu je eigen wachtwoord.</p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Nieuw wachtwoord</span>
            <div className="relative">
              <input type={toon ? "text" : "password"} value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" className={inputCls + " pr-10"} />
              <button type="button" onClick={() => setToon((t) => !t)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700" title={toon ? "Verberg" : "Toon"}>{toon ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Herhaal wachtwoord</span>
            <input type={toon ? "text" : "password"} value={herhaal} onChange={(e) => setHerhaal(e.target.value)} autoComplete="new-password" className={inputCls} />
          </label>
          {fout && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fout}</div>}
          <button type="button" onClick={opslaan} disabled={bezig} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
            <Lock className="h-4 w-4" /> {bezig ? "Opslaan…" : "Wachtwoord opslaan en doorgaan"}
          </button>
          <button type="button" onClick={logout} className="w-full rounded-lg px-5 py-2 text-sm font-medium text-ink-500 hover:text-ink-800">Uitloggen</button>
        </div>
      </div>
    </div>
  );
}
