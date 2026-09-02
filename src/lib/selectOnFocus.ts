// Cijfervelden bij focus meteen volledig selecteren, zodat je direct kunt overtypen in plaats van
// achter het bestaande getal te belanden. Geldt voor het hele dashboard via één globale listener.
//
// Waarom niet gewoon onFocus={e => e.target.select()} overal? Dat zou honderden losse velden raken.
// Eén listener op document (capture) dekt alles, inclusief velden die later worden toegevoegd.
//
// De muis-subtiliteit: bij een klik krijgt het veld focus (→ we selecteren), maar de erop volgende
// mouseup zet de cursor alsnog en wist de selectie. Daarom onthouden we dat we net geselecteerd
// hebben en annuleren we die ene mouseup. Typen/Tab/plakken blijven gewoon werken.

// Alleen numerieke invoervelden — tekstvelden (zoeken, naam, e-mail…) laten we met rust.
function isCijferveld(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.disabled || el.readOnly) return false;
  const type = el.type;
  const mode = (el.getAttribute("inputmode") || "").toLowerCase();
  return type === "number" || mode === "numeric" || mode === "decimal";
}

export function installSelectOnFocus(): void {
  let netGeselecteerd = false;

  // Bij focus: selecteer de hele waarde. requestAnimationFrame zodat het ook werkt als de browser
  // de caret vlak ná focus nog verplaatst.
  document.addEventListener(
    "focusin",
    (e) => {
      const el = e.target;
      if (!isCijferveld(el)) return;
      netGeselecteerd = true;
      requestAnimationFrame(() => {
        try { el.select(); } catch { /* sommige input-types staan select() niet toe */ }
      });
    },
    true
  );

  // Annuleer alleen de éérste mouseup na focus, zodat de klik de selectie niet wist. Daarna niet
  // meer, zodat je gewoon met de muis een deel kunt selecteren als je nóg een keer klikt/sleept.
  document.addEventListener(
    "mouseup",
    (e) => {
      if (!netGeselecteerd) return;
      netGeselecteerd = false;
      if (isCijferveld(e.target)) e.preventDefault();
    },
    true
  );

  // Reset de vlag zodra het veld de focus verliest.
  document.addEventListener("focusout", () => { netGeselecteerd = false; }, true);
}
