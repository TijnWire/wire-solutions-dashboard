import { Sparkles, CheckCircle2, Clock } from "lucide-react";
import { Card } from "../components/ui";

type Feature = { titel: string; status: "Gepland" | "In ontwerp" };

type ModuleInfo = {
  titel: string;
  intro: string;
  features: Feature[];
};

export const MODULES: Record<string, ModuleInfo> = {
  afspraken: {
    titel: "Afspraken",
    intro:
      "Plan en beheer alle afspraken voor Stedin-klanten. Afspraken worden gebaseerd op de locatie van het huisadres en automatisch in de beste volgorde gezet.",
    features: [
      { titel: "Locatie-gebaseerd inplannen vanaf huisadres", status: "Gepland" },
      { titel: "Slimme dagplanning per werknemer", status: "Gepland" },
      { titel: "Koppeling met WhatsApp-bevestiging", status: "In ontwerp" },
      { titel: "Bedrijfspanden uitlichten (persoonlijk afgeven)", status: "In ontwerp" },
    ],
  },
  brieven: {
    titel: "Brieven & Routes",
    intro:
      "Van Stedin-batch tot printklare brieven én de beste looproute. Markeer op de kaart welke brieven gegooid zijn, inclusief blanco's, en maak direct een factuur.",
    features: [
      { titel: "Beste looproute via Claude + Maps API", status: "Gepland" },
      { titel: "Ontbrekende huisnummers detecteren", status: "Gepland" },
      { titel: "Op de kaart aanwijzen: gegooid + blanco's", status: "Gepland" },
      { titel: "Direct factuur genereren na bezorging", status: "In ontwerp" },
      { titel: "Live zichtbaar voor Wim & Remon", status: "Gepland" },
    ],
  },
  documenten: {
    titel: "Documenten",
    intro:
      "Automatiseer alle terugkerende documenten. Facturen met jullie logo, Excel-sheets die zichzelf invullen en archivering per klant.",
    features: [
      { titel: "Facturen inclusief logo", status: "Gepland" },
      { titel: "Excel-sheets automatisch invullen", status: "Gepland" },
      { titel: "Printbatch automatisch klaarzetten", status: "In ontwerp" },
    ],
  },
  communicatie: {
    titel: "Communicatie (AI)",
    intro:
      "AI-gestuurde WhatsApp, SMS en live vertaling. Bevestigingen, statusupdates en herinneringen volledig automatisch — met doorschakeling naar de juiste medewerker.",
    features: [
      { titel: "WhatsApp & SMS: afspraak bevestigen", status: "Gepland" },
      { titel: "Statusupdates (bv. 5 van 7 buren gesproken)", status: "Gepland" },
      { titel: "Herinneringen 24 uur voor de afspraak", status: "Gepland" },
      { titel: "Live realtime gespreksvertaling (spraak ↔ tekst)", status: "In ontwerp" },
      { titel: "AI-chat met doorschakeling naar afspraakmaker", status: "In ontwerp" },
    ],
  },
  klanten: {
    titel: "Klanten & Database",
    intro:
      "Eén centrale database met alle Stedin-klantgegevens, adressen en foto's van meterkasten gekoppeld aan het juiste adres.",
    features: [
      { titel: "Foto's meterkast met adresgegevens", status: "Gepland" },
      { titel: "Volledige klanthistorie per adres", status: "Gepland" },
      { titel: "Import vanuit Stedin-export", status: "In ontwerp" },
    ],
  },
  medewerkers: {
    titel: "Medewerkers",
    intro:
      "Persoonlijk dashboard per medewerker met alles wat ze nodig hebben — overzichtelijk en op één plek.",
    features: [
      { titel: "Deadlines & openstaande taken", status: "Gepland" },
      { titel: "Loonstroken inzien", status: "Gepland" },
      { titel: "Boetes & registraties", status: "In ontwerp" },
    ],
  },
  kennisbank: {
    titel: "Kennisbank",
    intro:
      "Interne kennisbank voor medewerkers met een AI-werknemerassistent die direct antwoord geeft op vragen in het veld.",
    features: [
      { titel: "AI-werknemerassistent", status: "Gepland" },
      { titel: "Doorzoekbare werkinstructies", status: "In ontwerp" },
    ],
  },
  beheer: {
    titel: "Gebruikersbeheer",
    intro: "Beheer wie toegang heeft tot welke onderdelen — van eigenaar tot werknemer.",
    features: [
      { titel: "Rollen & rechten", status: "Gepland" },
      { titel: "Toegang per module", status: "In ontwerp" },
    ],
  },
  instellingen: {
    titel: "Instellingen",
    intro: "Bedrijfsgegevens, logo, API-koppelingen (Maps, WhatsApp) en voorkeuren.",
    features: [
      { titel: "Bedrijfsprofiel & logo", status: "Gepland" },
      { titel: "API-koppelingen beheren", status: "In ontwerp" },
    ],
  },
};

export function Module({ moduleKey }: { moduleKey: string }) {
  const m = MODULES[moduleKey];
  if (!m) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
          <Sparkles className="h-3.5 w-3.5" />
          In ontwikkeling
        </div>
        <h2 className="text-xl font-bold text-ink-900">{m.titel}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">{m.intro}</p>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-ink-900">Geplande functies</h3>
        <ul className="space-y-3">
          {m.features.map((f) => {
            const planned = f.status === "Gepland";
            return (
              <li key={f.titel} className="flex items-center gap-3">
                {planned ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-500" />
                ) : (
                  <Clock className="h-5 w-5 shrink-0 text-amber-500" />
                )}
                <span className="flex-1 text-sm text-ink-700">{f.titel}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                    planned
                      ? "bg-brand-50 text-brand-700 ring-brand-200"
                      : "bg-amber-50 text-amber-700 ring-amber-200"
                  }`}
                >
                  {f.status}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
