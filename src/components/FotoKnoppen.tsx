import { Camera, ImagePlus, Loader2 } from "lucide-react";

// Twee tegels om foto's toe te voegen: direct met de camera óf kiezen uit de galerij.
// Bedoeld om binnen een bestaand foto-raster (aspect-square tegels) te plaatsen.
const tegel =
  "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ink-300 text-ink-400 hover:border-brand-400 hover:text-brand-600";

export function FotoKnoppen({ onFiles, bezig }: { onFiles: (files: FileList | null) => void; bezig?: boolean }) {
  return (
    <>
      {/* Camera: opent op de telefoon direct de camera */}
      <label className={tegel}>
        {bezig ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <>
            <Camera className="h-6 w-6" />
            <span className="text-[11px] font-medium">Camera</span>
          </>
        )}
        <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </label>

      {/* Galerij: kies bestaande foto's van het toestel */}
      <label className={tegel}>
        <ImagePlus className="h-6 w-6" />
        <span className="text-[11px] font-medium">Galerij</span>
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </label>
    </>
  );
}
