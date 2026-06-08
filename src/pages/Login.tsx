import { useState } from "react";
import { LogIn, AlertCircle, Loader2 } from "lucide-react";
import { useApp } from "../store/AppContext";

export function Login() {
  const { login } = useApp();
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [fout, setFout] = useState(false);
  const [bezig, setBezig] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bezig) return;
    setBezig(true);
    const ok = await login(email, wachtwoord);
    setBezig(false);
    if (!ok) setFout(true);
  };

  return (
    <div className="grid min-h-screen w-full bg-white md:grid-cols-2">
      {/* Linkerkant — merk */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-orange-500 to-orange-700 p-12 text-white md:flex">
        <div className="inline-flex rounded-2xl bg-white p-4 shadow-lg">
          <img src="/wire-logo.png" alt="Wire Solutions" className="h-16 w-auto" />
        </div>

        <div className="max-w-md">
          <h2 className="text-4xl font-bold leading-tight">
            Het team­dashboard voor jullie Stedin-operatie.
          </h2>
          <p className="mt-5 text-lg text-orange-50">
            Projecten, routes, brieven en administratie — alles op één plek.
            Iedere medewerker ziet precies wat er gedaan moet worden.
          </p>
        </div>

        <div className="text-sm text-orange-100">© {new Date().getFullYear()} Wire Solutions</div>

        {/* Decoratieve cirkels */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10" />
      </div>

      {/* Rechterkant — formulier */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <img src="/wire-logo.png" alt="Wire Solutions" className="mb-8 h-20 w-auto" />

          <h1 className="text-3xl font-bold text-ink-900">Inloggen</h1>
          <p className="mt-2 text-ink-500">Log in met je werkaccount.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">E-mailadres</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFout(false);
                }}
                placeholder="naam@wiresolutions.nl"
                className="w-full rounded-lg border border-ink-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Wachtwoord</label>
              <input
                type="password"
                value={wachtwoord}
                onChange={(e) => {
                  setWachtwoord(e.target.value);
                  setFout(false);
                }}
                placeholder="••••••••"
                className="w-full rounded-lg border border-ink-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            {fout && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                E-mailadres of wachtwoord klopt niet.
              </div>
            )}

            <button
              type="submit"
              disabled={bezig}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:opacity-60"
            >
              {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {bezig ? "Bezig met inloggen…" : "Inloggen"}
            </button>
          </form>

          <p className="mt-8 border-t border-ink-100 pt-5 text-xs text-ink-400">
            Geen toegang? Vraag je leidinggevende om een account of een nieuw wachtwoord.
          </p>
        </div>
      </div>
    </div>
  );
}
