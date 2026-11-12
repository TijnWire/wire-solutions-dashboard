// Eén plek waar pdf.js wordt geladen (checklists, Stedin-brieven en tabellen uit PDF's).
// We gebruiken de legacy-build plus onze eigen aanvullingen, zodat het ook werkt in oudere Safari
// (Mac, iPhone, iPad). De worker krijgt dezelfde aanvullingen via pdfWorker.ts.
import "./polyfills";

let pdfjsKlaar: Promise<typeof import("pdfjs-dist")> | null = null;
export function laadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsKlaar) {
    pdfjsKlaar = (async () => {
      const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as typeof import("pdfjs-dist");
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("./pdfWorker.ts", import.meta.url), { type: "module" });
      }
      return pdfjs;
    })();
    pdfjsKlaar.catch(() => { pdfjsKlaar = null; });
  }
  return pdfjsKlaar;
}
