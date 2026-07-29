// Foto's uit de synchronisatie halen en in R2 zetten.
// ─────────────────────────────────────────────────────────────────────────────
// WAAROM
// De voorschouwfoto's zitten nu ín de gesynchroniseerde gegevens, als base64-tekst. Eén blok is
// daardoor bijna 18 MB. Elke keer dat iemand één foto toevoegt, wordt dat hele blok opnieuw
// weggeschreven én door elk apparaat opnieuw opgehaald. Dat is de bron van bijna alles wat er deze
// week is misgegaan: de rijlimiet van 2 MB, het opknippen in stukken, de 496 MB, en de daglimiet aan
// verzoeken.
//
// In R2 verandert dat: de database bewaart nog een verwijzing van een paar tientallen tekens, en een
// apparaat haalt een foto pas op als je hem opent. Blokken van 18 MB worden blokken van kilobytes.
//
// AANZETTEN
// R2 moet één keer in het Cloudflare-dashboard aangezet worden (Storage → R2 → Enable). Daarna:
//     npx wrangler r2 bucket create wire-fotos
// en in wrangler.toml de binding erbij:
//     [[r2_buckets]]
//     binding = "FOTOS"
//     bucket_name = "wire-fotos"
//
// Zolang die binding er niet is, doet deze module niets en werkt alles zoals het nu werkt. Zo kan de
// code alvast mee zonder dat er iets omvalt.

export type FotoEnv = { FOTOS?: R2Bucket };

const MAX_BYTES = 12_000_000;   // ruim boven een telefoonfoto; hoger is bijna altijd een vergissing
const TOEGESTAAN = ["image/jpeg", "image/png", "image/webp", "image/heic"];

// Een naam die niet te raden is en niet kan botsen. De map ervoor houdt het overzichtelijk in R2.
function nieuweNaam(soort: string): string {
  const ext = soort.includes("png") ? "png" : soort.includes("webp") ? "webp" : soort.includes("heic") ? "heic" : "jpg";
  const willekeurig = crypto.randomUUID().replace(/-/g, "");
  const dag = new Date().toISOString().slice(0, 10);
  return `voorschouw/${dag}/${willekeurig}.${ext}`;
}

export async function fotoRoutes(
  pad: string, methode: string, req: Request, env: FotoEnv,
  json: (o: unknown, s?: number) => Response,
): Promise<Response | null> {
  if (!pad.startsWith("/foto")) return null;
  if (!env.FOTOS) return json({ error: "Fotoruimte staat nog niet aan op deze omgeving." }, 503);

  // ── Opslaan ──
  if (pad === "/foto" && methode === "POST") {
    const soort = req.headers.get("content-type") ?? "";
    if (!TOEGESTAAN.some((t) => soort.startsWith(t))) {
      return json({ error: `Dit bestandstype kan niet: ${soort || "onbekend"}.` }, 400);
    }
    const lengte = Number(req.headers.get("content-length") ?? 0);
    if (lengte > MAX_BYTES) return json({ error: "Deze foto is te groot (meer dan 12 MB)." }, 413);

    const naam = nieuweNaam(soort);
    await env.FOTOS.put(naam, req.body, {
      httpMetadata: { contentType: soort, cacheControl: "public, max-age=31536000, immutable" },
    });
    // De app bewaart alleen deze naam in de gegevens — een paar tientallen tekens in plaats van
    // megabytes aan base64.
    return json({ ok: true, naam });
  }

  // ── Ophalen ──
  // Een foto verandert nooit meer nadat hij is opgeslagen, dus hij mag een jaar in de cache van de
  // browser blijven staan. Dat scheelt op een telefoon in de wijk het meeste verkeer.
  if (pad.startsWith("/foto/") && (methode === "GET" || methode === "HEAD")) {
    const naam = decodeURIComponent(pad.slice("/foto/".length));
    if (!naam || naam.includes("..")) return json({ error: "Onbekende foto." }, 400);
    const obj = await env.FOTOS.get(naam);
    if (!obj) return json({ error: "Deze foto bestaat niet (meer)." }, 404);
    const kop = new Headers();
    obj.writeHttpMetadata(kop);
    kop.set("etag", obj.httpEtag);
    kop.set("cache-control", "public, max-age=31536000, immutable");
    kop.set("access-control-allow-origin", "*");
    return new Response(methode === "HEAD" ? null : obj.body, { headers: kop });
  }

  // ── Weggooien ──
  if (pad.startsWith("/foto/") && methode === "DELETE") {
    const naam = decodeURIComponent(pad.slice("/foto/".length));
    if (!naam || naam.includes("..")) return json({ error: "Onbekende foto." }, 400);
    await env.FOTOS.delete(naam);
    return json({ ok: true });
  }

  return null;
}
