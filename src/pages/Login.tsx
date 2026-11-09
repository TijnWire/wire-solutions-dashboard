import { useState } from "react";
import { LogIn, AlertCircle, Loader2, Mail, ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useApp } from "../store/AppContext";
import { logoSrc } from "../lib/logo";
import { sbWachtwoordVergeten } from "../lib/supabase";

export function Login() {
  const { login, bedrijf } = useApp();
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  // Oogje bij het wachtwoordveld: zien wat je typt scheelt veel mislukte pogingen op een telefoon.
  const [toonWachtwoord, setToonWachtwoord] = useState(false);
  // Wachtwoord-vergeten: eigen mini-scherm binnen dezelfde kaart.
  const [modus, setModus] = useState<"inloggen" | "vergeten">("inloggen");
  const [resetBezig, setResetBezig] = useState(false);
  const [resetMelding, setResetMelding] = useState("");
  const [resetOk, setResetOk] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bezig) return;
    setBezig(true);
    setFout("");
    const r = await login(email, wachtwoord);
    setBezig(false);
    // Een mislukte inlog heeft nu een eigen uitleg: "wachtwoord klopt niet" is iets heel anders dan
    // "geen verbinding met de centrale database" — vroeger kreeg je in beide gevallen hetzelfde te zien.
    if (!r.ok) setFout(r.melding);
  };

  const vraagReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetBezig) return;
    setResetBezig(true);
    setResetMelding("");
    const r = await sbWachtwoordVergeten(email);
    setResetBezig(false);
    setResetOk(r.ok);
    setResetMelding(r.melding);
  };

  return (
    <div className="grid min-h-[100dvh] w-full overflow-y-auto bg-white md:grid-cols-2">
      {/* Linkerkant — merk, met zwevende gloed */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-orange-500 to-orange-700 p-12 text-white md:flex">
        {/* Zwevende gloed-orbs (bewegen langzaam door het paneel) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="glow-orb glow-orb-1" />
          <div className="glow-orb glow-orb-2" />
          <div className="glow-orb glow-orb-3" />
          {/* Diagonale glans die er langzaam doorheen veegt */}
          <div className="glow-sheen" />
        </div>

        <div className="relative z-10 inline-flex rounded-2xl bg-white p-4 shadow-lg">
          <img src={logoSrc(bedrijf)} alt={bedrijf.naam || "Logo"} className="h-16 w-auto" />
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-bold leading-tight drop-shadow-sm">
            Het team­dashboard voor jullie Stedin-operatie.
          </h2>
          <p className="mt-5 text-lg text-orange-50">
            Projecten, routes, brieven en administratie — alles op één plek.
            Iedere medewerker ziet precies wat er gedaan moet worden.
          </p>
        </div>

        <div className="relative z-10 text-sm text-orange-100">© {new Date().getFullYear()} Wire Solutions</div>
      </div>

      {/* Rechterkant — formulier */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <img src={logoSrc(bedrijf)} alt={bedrijf.naam || "Logo"} className="mb-8 h-20 w-auto" />

          {modus === "inloggen" ? (
            <>
              <h1 className="text-3xl font-bold text-ink-900">Inloggen</h1>
              <p className="mt-2 text-base text-ink-600">Log in met je werkaccount.</p>

              <form onSubmit={submit} className="mt-8 space-y-5">
                <div>
                  <label htmlFor="login-email" className="mb-1.5 block text-base font-semibold text-ink-800 sm:text-sm sm:font-medium sm:text-ink-700">E-mailadres</label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFout(""); }}
                    placeholder="naam@wiresolutions.nl"
                    className="w-full rounded-lg border-2 border-ink-300 px-4 py-3.5 text-base outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 sm:border sm:border-ink-200 sm:py-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="login-wachtwoord" className="mb-1.5 block text-base font-semibold text-ink-800 sm:text-sm sm:font-medium sm:text-ink-700">Wachtwoord</label>
                  <div className="relative">
                    <input
                      id="login-wachtwoord"
                      name="password"
                      type={toonWachtwoord ? "text" : "password"}
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={wachtwoord}
                      onChange={(e) => { setWachtwoord(e.target.value); setFout(""); }}
                      placeholder="••••••••"
                      className="w-full rounded-lg border-2 border-ink-300 py-3.5 pl-4 pr-14 text-base outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 sm:border sm:border-ink-200 sm:py-3 sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setToonWachtwoord((t) => !t)}
                      aria-label={toonWachtwoord ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                      aria-pressed={toonWachtwoord}
                      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100"
                    >
                      {toonWachtwoord ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setModus("vergeten"); setResetMelding(""); setResetOk(false); }}
                    className="mt-1 -ml-1 rounded-lg px-1 py-3 text-base font-semibold text-orange-700 hover:text-orange-800 hover:underline sm:py-2 sm:text-sm"
                  >
                    Wachtwoord vergeten?
                  </button>
                </div>

                {fout && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-3 text-base text-red-800 sm:py-2 sm:text-sm">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
                    <span>{fout}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={bezig}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:opacity-60 sm:py-3 sm:text-sm"
                >
                  {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  {bezig ? "Bezig met inloggen…" : "Inloggen"}
                </button>
              </form>

              <p className="mt-8 border-t border-ink-100 pt-5 text-sm text-ink-600">
                Geen toegang? Vraag je leidinggevende om een account of een nieuw wachtwoord.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setModus("inloggen"); setResetMelding(""); }}
                className="mb-4 -ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-3 text-base font-semibold text-ink-600 hover:text-ink-900"
              >
                <ArrowLeft className="h-4 w-4" /> Terug naar inloggen
              </button>
              <h1 className="text-3xl font-bold text-ink-900">Wachtwoord vergeten</h1>
              <p className="mt-2 text-ink-500">Vul je werk-e-mailadres in. We sturen je een nieuw wachtwoord waarmee je direct weer kunt inloggen.</p>

              <form onSubmit={vraagReset} className="mt-8 space-y-5">
                <div>
                  <label htmlFor="reset-email" className="mb-1.5 block text-base font-semibold text-ink-800 sm:text-sm sm:font-medium sm:text-ink-700">Werk-e-mailadres</label>
                  <input
                    id="reset-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setResetMelding(""); }}
                    placeholder="naam@wiresolutions.nl"
                    autoFocus
                    className="w-full rounded-lg border-2 border-ink-300 px-4 py-3.5 text-base outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 sm:border sm:border-ink-200 sm:py-3 sm:text-sm"
                  />
                </div>

                {resetMelding && (
                  <div role="status" className={`flex items-start gap-2 rounded-lg px-3 py-3 text-base sm:py-2 sm:text-sm ${resetOk ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                    {resetOk ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span>{resetMelding}</span>
                  </div>
                )}

                {!resetOk ? (
                  <button
                    type="submit"
                    disabled={resetBezig}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:opacity-60 sm:py-3 sm:text-sm"
                  >
                    {resetBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {resetBezig ? "Bezig met versturen…" : "Stuur mij een nieuw wachtwoord"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setModus("inloggen"); setResetMelding(""); }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 sm:py-3 sm:text-sm"
                  >
                    <ArrowLeft className="h-4 w-4" /> Terug naar inloggen
                  </button>
                )}
              </form>

              <p className="mt-8 border-t border-ink-100 pt-5 text-sm text-ink-600">
                Controleer ook je spam-map. Blijft de mail uit? Vraag je leidinggevende om een nieuw wachtwoord.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
