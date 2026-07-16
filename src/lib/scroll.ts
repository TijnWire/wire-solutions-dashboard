// De app scrollt niet op de pagina zelf, maar in de <main>-kolom naast het menu (zie App.tsx).
// window.scrollTo doet daar dus niets. Open je vanuit een lijst een detailpagina, dan blijft die kolom
// staan waar je stond — en land je middenin de nieuwe pagina. Vandaar deze helper.
export const HOOFDINHOUD_ID = "hoofdinhoud";

export function scrollNaarBoven(): void {
  const el = document.getElementById(HOOFDINHOUD_ID);
  if (el) el.scrollTop = 0;
  else window.scrollTo(0, 0); // terugval als de opbouw ooit verandert
}
