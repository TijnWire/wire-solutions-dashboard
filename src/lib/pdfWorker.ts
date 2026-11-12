// De PDF-worker van pdf.js, maar eerst met de aanvullingen voor oudere browsers (zie polyfills.ts).
// Zonder die aanvullingen faalt het uitlezen in o.a. Safari vóór 17.4.
import "./polyfills";
import "pdfjs-dist/legacy/build/pdf.worker.mjs";
