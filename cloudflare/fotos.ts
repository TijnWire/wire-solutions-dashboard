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
const TOEGESTAAN = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

// Een naam die niet te raden is en niet kan botsen. De map ervoor houdt het overzichtelijk in R2.
function nieuweNaam(soort: string, map = "voorschouw"): string {
  const ext = soort.includes("pdf") ? "pdf"
    : soort.includes("png") ? "png" : soort.includes("webp") ? "webp" : soort.includes("heic") ? "heic" : "jpg";
  const willekeurig = crypto.randomUUID().replace(/-/g, "");
  const dag = new Date().toISOString().slice(0, 10);
  return `${map}/${dag}/${willekeurig}.${ext}`;
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

    // Een archief-PDF krijgt zijn eigen map, zodat je in de fotoruimte ziet wat wat is.
    const naam = nieuweNaam(soort, soort.includes("pdf") ? "archief" : "voorschouw");
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

// ── Bestaande foto's verhuizen ──
// De voorschouwen die er al staan hebben hun foto's als data-URL in de gegevens. Die halen we eruit
// en zetten we in R2, met alleen de naam terug in de gegevens. Dat gebeurt hier op de server: er
// hoeft geen megabyte het internet over, en geen enkel apparaat merkt er iets van.
//
// Eén onderdeel per aanroep, zodat een verhuizing nooit halverwege stukloopt op een tijdslimiet.
export async function verhuisFotos(
  env: FotoEnv,
  lees: (key: string) => Promise<unknown>,
  schrijf: (key: string, data: unknown) => Promise<void>,
  key: string,
): Promise<{ verplaatst: number; bespaard: number }> {
  if (!env.FOTOS) return { verplaatst: 0, bespaard: 0 };
  const lijst = await lees(key);
  if (!Array.isArray(lijst)) return { verplaatst: 0, bespaard: 0 };

  let verplaatst = 0;
  let bespaard = 0;
  for (const v of lijst as { fotos?: string[] }[]) {
    if (!v || !Array.isArray(v.fotos)) continue;
    for (let i = 0; i < v.fotos.length; i++) {
      const f = v.fotos[i];
      if (typeof f !== "string" || !f.startsWith("data:")) continue;
      const m = /^data:([^;,]+)[^,]*,(.*)$/s.exec(f);
      if (!m) continue;
      try {
        const ruw = atob(m[2]);
        const bytes = new Uint8Array(ruw.length);
        for (let j = 0; j < ruw.length; j++) bytes[j] = ruw.charCodeAt(j);
        const naam = nieuweNaam(m[1] || "image/jpeg");
        await env.FOTOS.put(naam, bytes, {
          httpMetadata: { contentType: m[1] || "image/jpeg", cacheControl: "public, max-age=31536000, immutable" },
        });
        bespaard += f.length;
        v.fotos[i] = `r2:${naam}`;
        verplaatst++;
      } catch { /* onleesbare foto laten staan; die verliezen we liever niet */ }
    }
  }
  if (verplaatst > 0) await schrijf(key, lijst);
  return { verplaatst, bespaard };
}
