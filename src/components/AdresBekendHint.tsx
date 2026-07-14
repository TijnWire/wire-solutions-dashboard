import { useMemo, useState } from "react";
import { Info, X, MapPin } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { bouwAdresIndex, zoekTreffers, straatSleutel } from "../lib/adresIndex";

// Subtiel infobalkje: "dit adres kennen we misschien al". Verschijnt alléén als er op deze straat al
// eerder iets is gedaan (in welk project dan ook). Niet opdringerig: weg te klikken (× voor nu), of
// permanent uit te zetten voor dit adres ("komt vaker terug — niet meer melden", synct via instellingen).
export function AdresBekendHint({
  straat,
  postcode,
  plaats,
  negeerRecordId,
}: {
  straat: string;
  postcode: string;
  plaats: string;
  negeerRecordId?: string; // het huidige record niet als "al gedaan" tellen
}) {
  const { voorschouwen, rondes, saneringen, buurtaanpak, tauwOpdrachten, afspraken, klanten, instellingen, updateInstellingen } = useApp();
  const { navigeer } = useNav();
  const [verborgen, setVerborgen] = useState(false);

  const idx = useMemo(
    () => bouwAdresIndex({ voorschouwen, rondes, saneringen, buurtaanpak, tauwOpdrachten, afspraken, klanten }),
    [voorschouwen, rondes, saneringen, buurtaanpak, tauwOpdrachten, afspraken, klanten],
  );
  const treffers = useMemo(
    () => zoekTreffers(idx, straat, plaats, postcode, negeerRecordId),
    [idx, straat, plaats, postcode, negeerRecordId],
  );

  const sleutel = straatSleutel(straat, plaats, postcode);
  const genegeerd = (instellingen.adresNegeer ?? []).includes(sleutel);
  if (verborgen || genegeerd || !sleutel || treffers.length === 0) return null;

  const nietMeerMelden = () => updateInstellingen({ adresNegeer: [...(instellingen.adresNegeer ?? []), sleutel] });

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-900">Dit adres kennen we misschien al</p>
          <p className="mt-0.5 text-xs text-blue-700">
            We hebben op deze straat eerder iets gedaan — misschien kun je informatie overnemen in plaats van dubbel invullen.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {treffers.slice(0, 8).map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => navigeer(t.navKey)}
                title={`Ga naar ${t.bron}`}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
              >
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="font-semibold">{t.bron}</span>
                <span className="text-blue-500">·</span>
                <span className="truncate">{t.titel}</span>
                {t.detail && <span className="text-blue-400">({t.detail})</span>}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={nietMeerMelden}
            className="mt-2 text-xs font-medium text-blue-600 underline-offset-2 hover:underline"
          >
            Dit adres komt vaker terug — niet meer melden
          </button>
        </div>
        <button
          type="button"
          onClick={() => setVerborgen(true)}
          title="Verbergen"
          className="shrink-0 rounded-lg p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
