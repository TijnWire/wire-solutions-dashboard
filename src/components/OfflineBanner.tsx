import { useEffect, useState } from "react";
import { WifiOff, Check } from "lucide-react";

// Zichtbare "muur" voor gemoedsrust: is er geen internet, dan zie je meteen dat alles tóch veilig
// lokaal wordt bewaard en automatisch synchroniseert zodra je weer verbinding hebt. Komt het internet
// terug, dan verschijnt kort een bevestiging. De data zelf staat sowieso al lokaal (IndexedDB) en
// wordt bij verbinding automatisch weggeschreven naar de centrale database.
export function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [netTerug, setNetTerug] = useState(false); // toon kort "weer online" na herstel

  useEffect(() => {
    const onOnline = () => { setOnline(true); setNetTerug(true); setTimeout(() => setNetTerug(false), 4000); };
    const onOffline = () => { setOnline(false); setNetTerug(false); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  if (online && !netTerug) return null;

  if (online) {
    return (
      <div className="flex items-center justify-center gap-2 bg-green-600 px-4 py-2 text-center text-sm font-semibold text-white">
        <Check className="h-4 w-4 shrink-0" /> Weer online — alles wordt automatisch gesynchroniseerd.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 bg-amber-500 px-4 py-2.5 text-sm font-medium text-white">
      <WifiOff className="h-5 w-5 shrink-0" />
      <span>Je bent momenteel offline. We bewaren alles veilig op dit apparaat — zodra je weer internet hebt, synchroniseren we automatisch alles voor je.</span>
    </div>
  );
}
