import { MededelingenBord } from "../components/MededelingenBord";

// Volledige pagina rond het bestaande prikbord-component. De beheerder plaatst mededelingen
// (compose), het hele team leest ze en tikt "gezien".
export function Mededelingen() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Mededelingen</h2>
        <p className="text-sm text-ink-500">Het prikbord van de beheerder voor het team.</p>
      </div>
      <MededelingenBord compose />
    </div>
  );
}
