import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  User,
  Project,
  Taak,
  ProjectPost,
  ProjectReactie,
  Weekplanning,
  PlanningDag,
  PlanningSlot,
  Sanering,
  Buurtaanpak,
  TauwOpdracht,
  FlowStap,
  Voorschouw,
  VoorschouwMap,
  Mededeling,
  Brievenronde,
  Afspraak,
  Factuur,
  Bedrijf,
  Loonstrook,
  Boete,
  Communicatie,
  Verlof,
  KennisArtikel,
  Instellingen,
  Klant,
  Opdrachtgever,
} from "../lib/types";
import { legeDag, legeSlots, PLANNING_TIJDEN } from "../lib/types";
import { verifieerWachtwoord } from "../lib/auth";
import {
  SEED_USERS,
  SEED_PROJECTS,
  SEED_TAKEN,
  SEED_PROJECT_POSTS,
  SEED_SANERINGEN,
  SEED_TAUW,
  SEED_RONDES,
  SEED_AFSPRAKEN,
  SEED_FACTUREN,
  SEED_BEDRIJF,
  SEED_LOONSTROKEN,
  SEED_BOETES,
  SEED_COMM,
  SEED_VERLOF,
  SEED_KENNIS,
  SEED_INSTELLINGEN,
  SEED_KLANTEN,
  SEED_OPDRACHTGEVERS,
  SEED_BUURTAANPAK,
} from "../lib/seed";
import { idbGet, idbSet } from "./db";
import { supabaseAan, sb, sbLeesAlles, sbSchrijf, sbLogin, sbLogout, sbSessieEmail } from "../lib/supabase";

// Oude browseropslag-sleutels — alleen nog om eenmalig naar IndexedDB te migreren.
const LS = {
  users: "wire.users",
  projects: "wire.projects",
  taken: "wire.taken",
  projectPosts: "wire.projectPosts",
  planningen: "wire.planningen",
  saneringen: "wire.saneringen",
  buurtaanpak: "wire.buurtaanpak",
  tauw: "wire.tauw",
  voorschouwen: "wire.voorschouwen",
  voorschouwMappen: "wire.voorschouwMappen",
  mededelingen: "wire.mededelingen",
  rondes: "wire.rondes",
  afspraken: "wire.afspraken",
  facturen: "wire.facturen",
  opdrachtgevers: "wire.opdrachtgevers",
  bedrijf: "wire.bedrijf",
  loonstroken: "wire.loonstroken",
  boetes: "wire.boetes",
  comm: "wire.comm",
  verlof: "wire.verlof",
  kennis: "wire.kennis",
  instellingen: "wire.instellingen",
  klanten: "wire.klanten",
  session: "wire.session",
};

// Laadt een onderdeel uit IndexedDB; migreert eenmalig vanuit oude browseropslag; anders seed.
async function laadSlice<T>(key: string, lsKey: string, seed: T): Promise<T> {
  const fromIdb = await idbGet<T>(key);
  if (fromIdb !== undefined) return fromIdb;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const val = JSON.parse(raw) as T;
      await idbSet(key, val);
      return val;
    }
  } catch {
    // negeren — dan valt het terug op seed
  }
  return seed;
}

type AppState = {
  hydrated: boolean;
  users: User[];
  projects: Project[];
  taken: Taak[];
  projectPosts: ProjectPost[];
  planningen: Weekplanning[];
  saneringen: Sanering[];
  buurtaanpak: Buurtaanpak[];
  tauwOpdrachten: TauwOpdracht[];
  voorschouwen: Voorschouw[];
  voorschouwMappen: VoorschouwMap[];
  mededelingen: Mededeling[];
  rondes: Brievenronde[];
  afspraken: Afspraak[];
  facturen: Factuur[];
  opdrachtgevers: Opdrachtgever[];
  bedrijf: Bedrijf;
  loonstroken: Loonstrook[];
  boetes: Boete[];
  comm: Communicatie;
  verlof: Verlof[];
  kennis: KennisArtikel[];
  instellingen: Instellingen;
  klanten: Klant[];
  currentUser: User | null;

  login: (email: string, wachtwoord: string) => Promise<boolean>;
  logout: () => void;
  wisselGebruiker: (id: string) => void; // dev/demo: direct van account wisselen zonder wachtwoord

  addUser: (u: Omit<User, "id">) => string;
  updateUser: (id: string, patch: Partial<User>) => void;
  deleteUser: (id: string) => void;

  updateTaak: (id: string, patch: Partial<Taak>) => void;
  addTaak: (t: Omit<Taak, "id">) => void;
  deleteTaak: (id: string) => void;
  addProject: (p: Omit<Project, "id">) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // Projectberichten (updates & vragen) en hun reacties / afhandeling
  addProjectPost: (p: Omit<ProjectPost, "id" | "aangemaakt" | "afgehandeld" | "reacties">) => string;
  deleteProjectPost: (id: string) => void;
  addProjectReactie: (postId: string, r: Omit<ProjectReactie, "id" | "aangemaakt">) => void;
  setPostAfgehandeld: (id: string, afgehandeld: boolean, doorUserId: string) => void;

  // Weekplanning per project (1:1) + Excel-export elders
  ensurePlanning: (projectId: string, jaar?: number) => void;
  updatePlanning: (projectId: string, patch: Partial<Pick<Weekplanning, "jaar">>) => void;
  deletePlanning: (projectId: string) => void;
  addPlanningDag: (projectId: string, datum: string) => void;
  deletePlanningDag: (projectId: string, dagId: string) => void;
  updatePlanningDag: (projectId: string, dagId: string, patch: Partial<Pick<PlanningDag, "dna" | "datum">>) => void;
  updatePlanningSlot: (projectId: string, dagId: string, slotId: string, patch: Partial<PlanningSlot>) => void;
  leegPlanningSlot: (projectId: string, dagId: string, slotId: string) => void;

  // Saneren-projecten (wijk + adressenlijst)
  addSanering: (s: Omit<Sanering, "id">) => string;
  updateSanering: (id: string, patch: Partial<Sanering>) => void;
  deleteSanering: (id: string) => void;
  addBuurtaanpak: (b: Omit<Buurtaanpak, "id">) => string;
  updateBuurtaanpak: (id: string, patch: Partial<Buurtaanpak>) => void;
  deleteBuurtaanpak: (id: string) => void;

  // TAUW-opdrachten + werkstroomstappen
  addTauw: (t: Omit<TauwOpdracht, "id">) => string;
  updateTauw: (id: string, patch: Partial<TauwOpdracht>) => void;
  deleteTauw: (id: string) => void;
  updateTauwStap: (id: string, key: string, patch: Partial<FlowStap>) => void;

  addVoorschouw: (v: Omit<Voorschouw, "id">) => string;
  updateVoorschouw: (id: string, patch: Partial<Voorschouw>) => void;
  deleteVoorschouw: (id: string) => void;
  addVoorschouwMap: (naam: string) => string;
  updateVoorschouwMap: (id: string, patch: Partial<Omit<VoorschouwMap, "id">>) => void;
  deleteVoorschouwMap: (id: string) => void;
  addMededeling: (m: Omit<Mededeling, "id" | "aangemaakt" | "gezienDoor">) => string;
  deleteMededeling: (id: string) => void;
  toggleMededelingGezien: (id: string, userId: string) => void;
  toggleMededelingPin: (id: string) => void;

  addRonde: (r: Omit<Brievenronde, "id">) => string;
  updateRonde: (id: string, patch: Partial<Brievenronde>) => void;
  deleteRonde: (id: string) => void;

  addAfspraak: (a: Omit<Afspraak, "id">) => string;
  updateAfspraak: (id: string, patch: Partial<Afspraak>) => void;
  deleteAfspraak: (id: string) => void;

  addFactuur: (f: Omit<Factuur, "id">) => string;
  updateFactuur: (id: string, patch: Partial<Factuur>) => void;
  deleteFactuur: (id: string) => void;
  addOpdrachtgever: (o: Omit<Opdrachtgever, "id">) => string;
  updateOpdrachtgever: (id: string, patch: Partial<Opdrachtgever>) => void;
  deleteOpdrachtgever: (id: string) => void;
  updateBedrijf: (patch: Partial<Bedrijf>) => void;

  addLoonstrook: (l: Omit<Loonstrook, "id">) => string;
  updateLoonstrook: (id: string, patch: Partial<Loonstrook>) => void;
  deleteLoonstrook: (id: string) => void;

  addBoete: (b: Omit<Boete, "id">) => string;
  updateBoete: (id: string, patch: Partial<Boete>) => void;
  deleteBoete: (id: string) => void;

  updateComm: (patch: Partial<Communicatie>) => void;

  addVerlof: (v: Omit<Verlof, "id">) => string;
  updateVerlof: (id: string, patch: Partial<Verlof>) => void;
  deleteVerlof: (id: string) => void;

  addKennis: (k: Omit<KennisArtikel, "id">) => string;
  updateKennis: (id: string, patch: Partial<KennisArtikel>) => void;
  deleteKennis: (id: string) => void;

  updateInstellingen: (patch: Partial<Instellingen>) => void;

  addKlant: (k: Omit<Klant, "id">) => string;
  updateKlant: (id: string, patch: Partial<Klant>) => void;
  deleteKlant: (id: string) => void;
};

const AppCtx = createContext<AppState | null>(null);

let idCounter = Date.now();
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [users, setUsers] = useState<User[]>(SEED_USERS);
  const [projects, setProjects] = useState<Project[]>(SEED_PROJECTS);
  const [taken, setTaken] = useState<Taak[]>(SEED_TAKEN);
  const [projectPosts, setProjectPosts] = useState<ProjectPost[]>(SEED_PROJECT_POSTS);
  const [planningen, setPlanningen] = useState<Weekplanning[]>([]);
  const [saneringen, setSaneringen] = useState<Sanering[]>(SEED_SANERINGEN);
  const [buurtaanpak, setBuurtaanpak] = useState<Buurtaanpak[]>(SEED_BUURTAANPAK);
  const [tauwOpdrachten, setTauwOpdrachten] = useState<TauwOpdracht[]>(SEED_TAUW);
  const [voorschouwen, setVoorschouwen] = useState<Voorschouw[]>([]);
  const [voorschouwMappen, setVoorschouwMappen] = useState<VoorschouwMap[]>([]);
  const [mededelingen, setMededelingen] = useState<Mededeling[]>([]);
  const [rondes, setRondes] = useState<Brievenronde[]>(SEED_RONDES);
  const [afspraken, setAfspraken] = useState<Afspraak[]>(SEED_AFSPRAKEN);
  const [facturen, setFacturen] = useState<Factuur[]>(SEED_FACTUREN);
  const [opdrachtgevers, setOpdrachtgevers] = useState<Opdrachtgever[]>(SEED_OPDRACHTGEVERS);
  const [bedrijf, setBedrijf] = useState<Bedrijf>(SEED_BEDRIJF);
  const [loonstroken, setLoonstroken] = useState<Loonstrook[]>(SEED_LOONSTROKEN);
  const [boetes, setBoetes] = useState<Boete[]>(SEED_BOETES);
  const [comm, setComm] = useState<Communicatie>(SEED_COMM);
  const [verlof, setVerlof] = useState<Verlof[]>(SEED_VERLOF);
  const [kennis, setKennis] = useState<KennisArtikel[]>(SEED_KENNIS);
  const [instellingen, setInstellingen] = useState<Instellingen>(SEED_INSTELLINGEN);
  const [klanten, setKlanten] = useState<Klant[]>(SEED_KLANTEN);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Supabase: actieve sessie + bijhouden wat we al gesynct hebben (tegen terugkaats-lussen).
  const [sbSessie, setSbSessie] = useState(false);
  const sync = useRef<{ klaar: boolean; gezien: Record<string, string> }>({ klaar: false, gezien: {} });

  // Eenmalig inladen vanuit de lokale database (IndexedDB).
  useEffect(() => {
    let actief = true;
    (async () => {
      let [u, p, t, pp, pl, san, tw, v, r, af, fac, bed, loon, boe, communicatie, verl, kn, inst, kl, s, vm, med, og, ba] = await Promise.all([
        laadSlice<User[]>("users", LS.users, SEED_USERS),
        laadSlice<Project[]>("projects", LS.projects, SEED_PROJECTS),
        laadSlice<Taak[]>("taken", LS.taken, SEED_TAKEN),
        laadSlice<ProjectPost[]>("projectPosts", LS.projectPosts, SEED_PROJECT_POSTS),
        laadSlice<Weekplanning[]>("planningen", LS.planningen, []),
        laadSlice<Sanering[]>("saneringen", LS.saneringen, SEED_SANERINGEN),
        laadSlice<TauwOpdracht[]>("tauw", LS.tauw, SEED_TAUW),
        laadSlice<Voorschouw[]>("voorschouwen", LS.voorschouwen, []),
        laadSlice<Brievenronde[]>("rondes", LS.rondes, SEED_RONDES),
        laadSlice<Afspraak[]>("afspraken", LS.afspraken, SEED_AFSPRAKEN),
        laadSlice<Factuur[]>("facturen", LS.facturen, SEED_FACTUREN),
        laadSlice<Bedrijf>("bedrijf", LS.bedrijf, SEED_BEDRIJF),
        laadSlice<Loonstrook[]>("loonstroken", LS.loonstroken, SEED_LOONSTROKEN),
        laadSlice<Boete[]>("boetes", LS.boetes, SEED_BOETES),
        laadSlice<Communicatie>("comm", LS.comm, SEED_COMM),
        laadSlice<Verlof[]>("verlof", LS.verlof, SEED_VERLOF),
        laadSlice<KennisArtikel[]>("kennis", LS.kennis, SEED_KENNIS),
        laadSlice<Instellingen>("instellingen", LS.instellingen, SEED_INSTELLINGEN),
        laadSlice<Klant[]>("klanten", LS.klanten, SEED_KLANTEN),
        laadSlice<string | null>("session", LS.session, null),
        laadSlice<VoorschouwMap[]>("voorschouwMappen", LS.voorschouwMappen, []),
        laadSlice<Mededeling[]>("mededelingen", LS.mededelingen, []),
        laadSlice<Opdrachtgever[]>("opdrachtgevers", LS.opdrachtgevers, SEED_OPDRACHTGEVERS),
        laadSlice<Buurtaanpak[]>("buurtaanpak", LS.buurtaanpak, SEED_BUURTAANPAK),
      ]);
      if (!actief) return;
      // Eenmalige schoonmaak: verwijder de voorbeeld-/demoprojecten en bijbehorende data, zodat het
      // team met eigen projecten begint. Draait één keer per tag; alles wat je daarna zelf toevoegt
      // blijft staan. Team, bedrijfsgegevens, kennisbank en sjablonen worden NIET gewist.
      const SCHOON_TAG = "2026-06-eigen-start";
      if (typeof localStorage !== "undefined" && localStorage.getItem("wire.schoon") !== SCHOON_TAG) {
        p = []; t = []; pp = []; pl = []; san = []; tw = []; v = []; r = []; af = []; fac = []; loon = []; boe = []; verl = []; kl = []; vm = [];
        localStorage.setItem("wire.schoon", SCHOON_TAG);
      }
      // Migratie: oude (platte-tekst) accounts zonder versleuteld wachtwoord vervangen door het echte team.
      let basisUsers = u.length === 0 || u.some((x) => !x.wachtwoordHash) ? SEED_USERS : u;
      // Eenmalige wachtwoord-sync: bestaande apparaten nemen de (opnieuw ingestelde) wachtwoorden uit
      // de seed over, per account-id. Draait één keer per tag, zodat latere wijzigingen blijven staan.
      const CRED_SYNC_TAG = "2026-06-pwreset";
      if (typeof localStorage !== "undefined" && localStorage.getItem("wire.credsSync") !== CRED_SYNC_TAG) {
        const seedById = new Map(SEED_USERS.map((s) => [s.id, s]));
        basisUsers = basisUsers.map((x) => {
          const s = seedById.get(x.id);
          return s ? { ...x, wachtwoordHash: s.wachtwoordHash, wachtwoordSalt: s.wachtwoordSalt, wachtwoordIter: s.wachtwoordIter } : x;
        });
        localStorage.setItem("wire.credsSync", CRED_SYNC_TAG);
      }
      // Bestaande gebruikers: oude functie "Monteur" → "Werknemer" (we noemen ze nu werknemers).
      setUsers(basisUsers.map((x) => (x.functie === "Monteur" ? { ...x, functie: "Werknemer" } : x)));
      setProjects(p);
      setTaken(t);
      // Repareer oudere posts zonder reacties-array
      setProjectPosts(pp.map((x) => ({ ...x, reacties: x.reacties ?? [] })));
      // Normaliseer elke dag naar exact 8 sloten in de vaste tijd-volgorde (defensief bij oude/incomplete data).
      setPlanningen(
        pl.map((wp) => ({
          ...wp,
          dagen: (wp.dagen ?? []).map((d) => {
            const reserve = legeSlots(nextId);
            return {
              ...d,
              slots: PLANNING_TIJDEN.map((tijd, i) => d.slots?.find((sl) => sl.tijd === tijd) ?? reserve[i]),
            };
          }),
        }))
      );
      // Migreer oude enkel-adres-saneringen (intake + checklist) naar het nieuwe project-model (wijk + adressenlijst).
      setSaneringen(
        san.map((s) => {
          if (Array.isArray(s.adressen)) return { ...s, naam: s.naam || s.regio || "Sanering", regio: s.regio ?? "", status: s.status ?? (s.toegewezenAan ? "toegewezen" : "nieuw"), adressen: s.adressen };
          const o = s as unknown as { klantNaam?: string; straat?: string; huisnummer?: string; postcode?: string; plaats?: string; telefoon?: string; referentie?: string };
          const heeftAdres = !!(o.straat || o.huisnummer || o.klantNaam || o.postcode);
          return {
            id: s.id,
            aangemaakt: s.aangemaakt,
            naam: s.naam || o.plaats || o.referentie || o.straat || o.klantNaam || "Sanering",
            regio: s.regio ?? "",
            toegewezenAan: s.toegewezenAan,
            status: s.toegewezenAan ? "toegewezen" : "nieuw",
            adressen: heeftAdres
              ? [{ id: nextId("sad"), straat: o.straat ?? "", huisnummer: o.huisnummer ?? "", postcode: o.postcode ?? "", plaats: o.plaats ?? "", naam: o.klantNaam ?? "", telefoon: o.telefoon ?? "", datum: "", tijd: "", bevestigd: false, notitie: "" }]
              : [],
            afgerondOp: s.afgerondOp,
            gearchiveerd: s.gearchiveerd,
            gearchiveerdOp: s.gearchiveerdOp,
          };
        })
      );
      // Repareer oudere TAUW-opdrachten van vóór het type/levenscyclus-model.
      setTauwOpdrachten(
        tw.map((o) => ({
          ...o,
          type: o.type ?? "bodemonderzoek",
          adressen: o.adressen ?? [],
          stappen: o.stappen ?? [],
          // Invariant: heeft de opdracht een toegewezene, dan staat hij "bij werknemer"; anders "nieuw".
          status: o.status ?? (o.toegewezenAan ? "toegewezen" : "nieuw"),
        }))
      );
      setVoorschouwen(v);
      setVoorschouwMappen(vm);
      setMededelingen(med.map((m) => ({ ...m, gezienDoor: m.gezienDoor ?? [], belangrijk: !!m.belangrijk })));
      // Repareer oudere brievenrondes van vóór het levenscyclus-model: leid status af uit de oude fase/velden.
      setRondes(
        r.map((o) => ({
          ...o,
          status: o.status ?? (
            o.mailVerstuurdOp || o.factuurId || o.fase === "gefactureerd" ? "verstuurd"
              : o.fase === "bevestigd" || o.fase === "gecontroleerd" ? "gecontroleerd"
                : o.toegewezenAan ? "toegewezen"
                  : "nieuw"
          ),
        }))
      );
      // Repareer oudere afspraken zonder locatie/soort (van vóór het groep-model)
      setAfspraken(
        af.map((a) => ({
          ...a,
          locatie: a.locatie && a.locatie.trim() ? a.locatie : a.straat || a.plaats || "Onbekend",
          soort: a.soort ?? "straat",
        }))
      );
      setFacturen(fac);
      setOpdrachtgevers(og);
      setBuurtaanpak(ba);
      // Start met de echte bedrijfsgegevens en zet daar de (niet-lege) opgeslagen waarden overheen.
      // Zo ontbreken vaste velden als BTW/IBAN/BIC nooit — ook niet bij oudere, onvolledige lokale data.
      const schoonBed: Bedrijf = { ...SEED_BEDRIJF };
      (Object.entries(bed) as [keyof Bedrijf, string][]).forEach(([k, v]) => { if (v && v !== "12345678") schoonBed[k] = v; });
      setBedrijf(schoonBed);
      // Repareer oudere loonstroken zonder de nieuwe velden
      setLoonstroken(
        loon.map((l) => ({
          ...l,
          periodeType: l.periodeType ?? "Maand",
          refDatum: l.refDatum ?? "2026-05-01",
          bijtelling: l.bijtelling ?? 0,
          boetes: l.boetes ?? 0,
        }))
      );
      setBoetes(boe);
      setComm({ ...SEED_COMM, ...communicatie });
      setVerlof(verl);
      setKennis(kn);
      setInstellingen({ ...SEED_INSTELLINGEN, ...inst });
      setKlanten(kl);
      setCurrentUserId(s);
      setHydrated(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Opslaan in de lokale database bij elke wijziging (pas ná inladen).
  useEffect(() => {
    if (hydrated) void idbSet("users", users);
  }, [users, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("projects", projects);
  }, [projects, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("taken", taken);
  }, [taken, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("projectPosts", projectPosts);
  }, [projectPosts, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("planningen", planningen);
  }, [planningen, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("saneringen", saneringen);
  }, [saneringen, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("buurtaanpak", buurtaanpak);
  }, [buurtaanpak, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("tauw", tauwOpdrachten);
  }, [tauwOpdrachten, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("voorschouwen", voorschouwen);
  }, [voorschouwen, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("voorschouwMappen", voorschouwMappen);
  }, [voorschouwMappen, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("mededelingen", mededelingen);
  }, [mededelingen, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("rondes", rondes);
  }, [rondes, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("afspraken", afspraken);
  }, [afspraken, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("facturen", facturen);
  }, [facturen, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("opdrachtgevers", opdrachtgevers);
  }, [opdrachtgevers, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("bedrijf", bedrijf);
  }, [bedrijf, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("loonstroken", loonstroken);
  }, [loonstroken, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("boetes", boetes);
  }, [boetes, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("comm", comm);
  }, [comm, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("verlof", verlof);
  }, [verlof, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("kennis", kennis);
  }, [kennis, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("instellingen", instellingen);
  }, [instellingen, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("klanten", klanten);
  }, [klanten, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("session", currentUserId);
  }, [currentUserId, hydrated]);

  // ── Centrale database (Supabase) — alle onderdelen synchroniseren tussen apparaten ──
  // Per onderdeel: een setter (om binnenkomende data toe te passen) en de huidige waarde (om te pushen).
  const setters: Record<string, (v: unknown) => void> = {
    users: (v) => setUsers(v as User[]),
    projects: (v) => setProjects(v as Project[]),
    taken: (v) => setTaken(v as Taak[]),
    projectPosts: (v) => setProjectPosts(v as ProjectPost[]),
    planningen: (v) => setPlanningen(v as Weekplanning[]),
    saneringen: (v) => setSaneringen(v as Sanering[]),
    buurtaanpak: (v) => setBuurtaanpak(v as Buurtaanpak[]),
    tauw: (v) => setTauwOpdrachten(v as TauwOpdracht[]),
    voorschouwen: (v) => setVoorschouwen(v as Voorschouw[]),
    voorschouwMappen: (v) => setVoorschouwMappen(v as VoorschouwMap[]),
    mededelingen: (v) => setMededelingen(v as Mededeling[]),
    rondes: (v) => setRondes(v as Brievenronde[]),
    afspraken: (v) => setAfspraken(v as Afspraak[]),
    facturen: (v) => setFacturen(v as Factuur[]),
    opdrachtgevers: (v) => setOpdrachtgevers(v as Opdrachtgever[]),
    bedrijf: (v) => setBedrijf(v as Bedrijf),
    loonstroken: (v) => setLoonstroken(v as Loonstrook[]),
    boetes: (v) => setBoetes(v as Boete[]),
    comm: (v) => setComm(v as Communicatie),
    verlof: (v) => setVerlof(v as Verlof[]),
    kennis: (v) => setKennis(v as KennisArtikel[]),
    instellingen: (v) => setInstellingen(v as Instellingen),
    klanten: (v) => setKlanten(v as Klant[]),
  };
  const waarden: Record<string, unknown> = {
    users, projects, taken, projectPosts, planningen, saneringen, tauw: tauwOpdrachten,
    voorschouwen, voorschouwMappen, mededelingen, rondes, afspraken, facturen, bedrijf,
    loonstroken, boetes, comm, verlof, kennis, instellingen, klanten, opdrachtgevers, buurtaanpak,
  };

  // 1) Houd bij of er een Supabase-sessie is.
  useEffect(() => {
    if (!supabaseAan) return;
    let actief = true;
    void sb().auth.getSession().then(({ data }) => { if (actief) setSbSessie(!!data.session); });
    const { data: sub } = sb().auth.onAuthStateChange((_e, session) => { if (actief) setSbSessie(!!session); });
    return () => { actief = false; sub.subscription.unsubscribe(); };
  }, []);

  // 2) Bij een actieve sessie: haal de gedeelde data op, zet ontbrekende onderdelen klaar,
  //    bepaal wie is ingelogd, en luister naar realtime-wijzigingen van andere apparaten.
  useEffect(() => {
    if (!supabaseAan || !sbSessie || !hydrated) return;
    let actief = true;
    (async () => {
      try {
        const remote = await sbLeesAlles();
        if (!actief) return;
        for (const [key, val] of Object.entries(remote)) {
          sync.current.gezien[key] = JSON.stringify(val);
          setters[key]?.(val);
        }
        for (const key of Object.keys(setters)) {
          if (!(key in remote)) {
            sync.current.gezien[key] = JSON.stringify(waarden[key]);
            void sbSchrijf(key, waarden[key]).catch(() => {});
          }
        }
        const email = await sbSessieEmail();
        if (actief && email) {
          const lijst = (remote.users as User[] | undefined) ?? users;
          const ik = lijst.find((u) => u.email.toLowerCase() === email.toLowerCase());
          if (ik) setCurrentUserId(ik.id);
        }
        sync.current.klaar = true;
      } catch { /* netwerk/permissie weg — blijf local-first werken */ }
    })();
    const kanaal = sb()
      .channel("wire_state")
      .on("postgres_changes", { event: "*", schema: "public", table: "wire_state" }, (payload) => {
        const row = (payload.new ?? payload.old) as { key?: string; data?: unknown } | null;
        if (!row?.key || !(row.key in setters)) return;
        const j = JSON.stringify(row.data);
        if (sync.current.gezien[row.key] === j) return; // eigen wijziging — overslaan
        sync.current.gezien[row.key] = j;
        setters[row.key](row.data);
      })
      .subscribe();
    return () => { actief = false; sync.current.klaar = false; void sb().removeChannel(kanaal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseAan, sbSessie, hydrated]);

  // 3) Push elke lokale wijziging naar de cloud (alleen ná de eerste synchronisatie).
  useEffect(() => {
    if (!supabaseAan || !sbSessie || !hydrated || !sync.current.klaar) return;
    for (const key of Object.keys(setters)) {
      const j = JSON.stringify(waarden[key]);
      if (sync.current.gezien[key] !== j) {
        sync.current.gezien[key] = j;
        void sbSchrijf(key, waarden[key]).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseAan, sbSessie, hydrated, users, projects, taken, projectPosts, planningen, saneringen, tauwOpdrachten, voorschouwen, voorschouwMappen, mededelingen, rondes, afspraken, facturen, bedrijf, loonstroken, boetes, comm, verlof, kennis, instellingen, klanten, opdrachtgevers, buurtaanpak]);

  const currentUser = users.find((u) => u.id === currentUserId) ?? null;

  const login: AppState["login"] = async (email, wachtwoord) => {
    // Eerst via Supabase (centrale database). Lukt dat niet, val terug op de lokale controle —
    // zo raakt niemand buitengesloten als Supabase nog niet is ingericht of even onbereikbaar is.
    if (supabaseAan) {
      try {
        if (await sbLogin(email, wachtwoord)) {
          const u = users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
          if (u) setCurrentUserId(u.id);
          return true;
        }
      } catch { /* val terug op de lokale controle */ }
    }
    const u = users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) return false;
    const ok = await verifieerWachtwoord(wachtwoord, u);
    if (ok) {
      setCurrentUserId(u.id);
      return true;
    }
    return false;
  };

  const logout = () => { if (supabaseAan) void sbLogout(); setCurrentUserId(null); };
  // Demo-switcher: direct als een ander account verdergaan (alle data is gedeeld in dezelfde store).
  const wisselGebruiker: AppState["wisselGebruiker"] = (id) => { if (users.some((u) => u.id === id)) setCurrentUserId(id); };

  const addUser: AppState["addUser"] = (u) => {
    const id = nextId("u");
    setUsers((prev) => [...prev, { ...u, id }]);
    return id;
  };

  const updateUser: AppState["updateUser"] = (id, patch) =>
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const deleteUser: AppState["deleteUser"] = (id) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    // Verwijder de medewerker ook uit alle projecttoewijzingen
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        toegewezenAan: p.toegewezenAan.filter((uid) => uid !== id),
      }))
    );
  };

  const updateProject: AppState["updateProject"] = (id, patch) =>
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // Project verwijderen + de bijbehorende taken en projectberichten opruimen (geen wezen).
  const deleteProject: AppState["deleteProject"] = (id) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setTaken((prev) => prev.filter((t) => t.projectId !== id));
    setProjectPosts((prev) => prev.filter((p) => p.projectId !== id));
  };

  const updateTaak: AppState["updateTaak"] = (id, patch) =>
    setTaken((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const addTaak: AppState["addTaak"] = (t) =>
    setTaken((prev) => [...prev, { ...t, id: nextId("t") }]);

  const deleteTaak: AppState["deleteTaak"] = (id) =>
    setTaken((prev) => prev.filter((t) => t.id !== id));

  const addProject: AppState["addProject"] = (p) => {
    const id = nextId("p");
    setProjects((prev) => [{ ...p, id }, ...prev]); // nieuw project bovenaan
    return id;
  };

  const addProjectPost: AppState["addProjectPost"] = (p) => {
    const id = nextId("pp");
    const post: ProjectPost = { ...p, id, aangemaakt: new Date().toISOString(), afgehandeld: false, reacties: [] };
    setProjectPosts((prev) => [post, ...prev]);
    return id;
  };

  const deleteProjectPost: AppState["deleteProjectPost"] = (id) =>
    setProjectPosts((prev) => prev.filter((p) => p.id !== id));

  const addProjectReactie: AppState["addProjectReactie"] = (postId, r) =>
    setProjectPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, reacties: [...p.reacties, { ...r, id: nextId("pr"), aangemaakt: new Date().toISOString() }] }
          : p
      )
    );

  const setPostAfgehandeld: AppState["setPostAfgehandeld"] = (id, afgehandeld, doorUserId) =>
    setProjectPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              afgehandeld,
              afgehandeldDoor: afgehandeld ? doorUserId : undefined,
              afgehandeldOp: afgehandeld ? new Date().toISOString() : undefined,
            }
          : p
      )
    );

  // Weekplanning — upsert: maakt de planning aan als die nog niet bestaat, zodat acties nooit crashen.
  const muteerPlanning = (projectId: string, fn: (pl: Weekplanning) => Weekplanning) =>
    setPlanningen((prev) => {
      const nu = new Date().toISOString();
      const bestaand = prev.find((p) => p.projectId === projectId);
      const basis: Weekplanning = bestaand ?? { id: nextId("wp"), projectId, jaar: new Date().getFullYear(), aangemaakt: nu, bijgewerkt: nu, dagen: [] };
      const volgend = { ...fn(basis), bijgewerkt: nu };
      return bestaand ? prev.map((p) => (p.projectId === projectId ? volgend : p)) : [volgend, ...prev];
    });

  const ensurePlanning: AppState["ensurePlanning"] = (projectId, jaar) =>
    muteerPlanning(projectId, (pl) => (jaar !== undefined ? { ...pl, jaar } : pl));

  const updatePlanning: AppState["updatePlanning"] = (projectId, patch) =>
    muteerPlanning(projectId, (pl) => ({ ...pl, ...patch }));

  const deletePlanning: AppState["deletePlanning"] = (projectId) =>
    setPlanningen((prev) => prev.filter((p) => p.projectId !== projectId));

  const addPlanningDag: AppState["addPlanningDag"] = (projectId, datum) =>
    muteerPlanning(projectId, (pl) =>
      pl.dagen.some((d) => d.datum === datum)
        ? pl
        : { ...pl, dagen: [...pl.dagen, legeDag(datum, nextId)].sort((a, b) => a.datum.localeCompare(b.datum)) }
    );

  const deletePlanningDag: AppState["deletePlanningDag"] = (projectId, dagId) =>
    muteerPlanning(projectId, (pl) => ({ ...pl, dagen: pl.dagen.filter((d) => d.id !== dagId) }));

  const updatePlanningDag: AppState["updatePlanningDag"] = (projectId, dagId, patch) =>
    muteerPlanning(projectId, (pl) => ({
      ...pl,
      dagen: pl.dagen.map((d) => (d.id === dagId ? { ...d, ...patch } : d)).sort((a, b) => a.datum.localeCompare(b.datum)),
    }));

  const updatePlanningSlot: AppState["updatePlanningSlot"] = (projectId, dagId, slotId, patch) =>
    muteerPlanning(projectId, (pl) => ({
      ...pl,
      dagen: pl.dagen.map((d) => (d.id === dagId ? { ...d, slots: d.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)) } : d)),
    }));

  const leegPlanningSlot: AppState["leegPlanningSlot"] = (projectId, dagId, slotId) =>
    muteerPlanning(projectId, (pl) => ({
      ...pl,
      dagen: pl.dagen.map((d) =>
        d.id === dagId
          ? { ...d, slots: d.slots.map((s) => (s.id === slotId ? { ...legeSlots(nextId)[0], id: s.id, tijd: s.tijd } : s)) }
          : d
      ),
    }));

  const addSanering: AppState["addSanering"] = (s) => {
    const id = nextId("san");
    setSaneringen((prev) => [{ ...s, id }, ...prev]);
    return id;
  };
  const updateSanering: AppState["updateSanering"] = (id, patch) =>
    setSaneringen((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const deleteSanering: AppState["deleteSanering"] = (id) =>
    setSaneringen((prev) => prev.filter((s) => s.id !== id));

  const addBuurtaanpak: AppState["addBuurtaanpak"] = (b) => {
    const id = nextId("ba");
    setBuurtaanpak((prev) => [{ ...b, id }, ...prev]);
    return id;
  };
  const updateBuurtaanpak: AppState["updateBuurtaanpak"] = (id, patch) =>
    setBuurtaanpak((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const deleteBuurtaanpak: AppState["deleteBuurtaanpak"] = (id) =>
    setBuurtaanpak((prev) => prev.filter((b) => b.id !== id));
  const addTauw: AppState["addTauw"] = (t) => {
    const id = nextId("tauw");
    setTauwOpdrachten((prev) => [{ ...t, id }, ...prev]);
    return id;
  };
  const updateTauw: AppState["updateTauw"] = (id, patch) =>
    setTauwOpdrachten((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const deleteTauw: AppState["deleteTauw"] = (id) =>
    setTauwOpdrachten((prev) => prev.filter((t) => t.id !== id));
  const updateTauwStap: AppState["updateTauwStap"] = (id, key, patch) =>
    setTauwOpdrachten((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const nu = new Date().toISOString();
        // Upsert: voeg de stap toe als die (bij oudere opdrachten) nog niet bestaat, zodat de actie niet stil verloren gaat.
        if (t.stappen.some((st) => st.key === key)) {
          return { ...t, stappen: t.stappen.map((st) => (st.key === key ? { ...st, ...patch, bijgewerkt: nu } : st)) };
        }
        const nieuw: FlowStap = { key, status: "open", notitie: "", ...patch, bijgewerkt: nu };
        return { ...t, stappen: [...t.stappen, nieuw] };
      })
    );

  const addVoorschouw: AppState["addVoorschouw"] = (v) => {
    const id = nextId("vs");
    setVoorschouwen((prev) => [{ ...v, id }, ...prev]);
    return id;
  };

  const updateVoorschouw: AppState["updateVoorschouw"] = (id, patch) =>
    setVoorschouwen((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const deleteVoorschouw: AppState["deleteVoorschouw"] = (id) =>
    setVoorschouwen((prev) => prev.filter((v) => v.id !== id));
  const addVoorschouwMap: AppState["addVoorschouwMap"] = (naam) => {
    const id = nextId("vmap");
    setVoorschouwMappen((prev) => [...prev, { id, naam: naam.trim() || "Nieuwe map" }]);
    return id;
  };
  const updateVoorschouwMap: AppState["updateVoorschouwMap"] = (id, patch) =>
    setVoorschouwMappen((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch, naam: (patch.naam ?? m.naam).trim() || m.naam } : m)));
  const deleteVoorschouwMap: AppState["deleteVoorschouwMap"] = (id) => {
    setVoorschouwMappen((prev) => prev.filter((m) => m.id !== id));
    // Adressen in deze map losmaken (de voorschouwen zelf blijven bestaan).
    setVoorschouwen((prev) => prev.map((v) => (v.mapId === id ? { ...v, mapId: undefined } : v)));
  };

  const addMededeling: AppState["addMededeling"] = (m) => {
    const id = nextId("med");
    setMededelingen((prev) => [{ ...m, id, aangemaakt: new Date().toISOString(), gezienDoor: [] }, ...prev]);
    return id;
  };
  const deleteMededeling: AppState["deleteMededeling"] = (id) =>
    setMededelingen((prev) => prev.filter((m) => m.id !== id));
  const toggleMededelingGezien: AppState["toggleMededelingGezien"] = (id, userId) =>
    setMededelingen((prev) => prev.map((m) => (m.id === id ? { ...m, gezienDoor: m.gezienDoor.includes(userId) ? m.gezienDoor.filter((u) => u !== userId) : [...m.gezienDoor, userId] } : m)));
  const toggleMededelingPin: AppState["toggleMededelingPin"] = (id) =>
    setMededelingen((prev) => prev.map((m) => (m.id === id ? { ...m, vastgepind: !m.vastgepind } : m)));

  const addRonde: AppState["addRonde"] = (r) => {
    const id = nextId("r");
    setRondes((prev) => [{ ...r, id }, ...prev]);
    return id;
  };

  const updateRonde: AppState["updateRonde"] = (id, patch) =>
    setRondes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const deleteRonde: AppState["deleteRonde"] = (id) =>
    setRondes((prev) => prev.filter((r) => r.id !== id));

  const addAfspraak: AppState["addAfspraak"] = (a) => {
    const id = nextId("af");
    setAfspraken((prev) => [...prev, { ...a, id }]);
    return id;
  };

  const updateAfspraak: AppState["updateAfspraak"] = (id, patch) =>
    setAfspraken((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const deleteAfspraak: AppState["deleteAfspraak"] = (id) =>
    setAfspraken((prev) => prev.filter((a) => a.id !== id));

  const addFactuur: AppState["addFactuur"] = (f) => {
    const id = nextId("f");
    setFacturen((prev) => [{ ...f, id }, ...prev]);
    return id;
  };

  const updateFactuur: AppState["updateFactuur"] = (id, patch) =>
    setFacturen((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const deleteFactuur: AppState["deleteFactuur"] = (id) =>
    setFacturen((prev) => prev.filter((f) => f.id !== id));

  const addOpdrachtgever: AppState["addOpdrachtgever"] = (o) => {
    const id = nextId("og");
    setOpdrachtgevers((prev) => [...prev, { ...o, id }]);
    return id;
  };
  const updateOpdrachtgever: AppState["updateOpdrachtgever"] = (id, patch) =>
    setOpdrachtgevers((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const deleteOpdrachtgever: AppState["deleteOpdrachtgever"] = (id) =>
    setOpdrachtgevers((prev) => prev.filter((o) => o.id !== id));

  const updateBedrijf: AppState["updateBedrijf"] = (patch) =>
    setBedrijf((prev) => ({ ...prev, ...patch }));

  const addLoonstrook: AppState["addLoonstrook"] = (l) => {
    const id = nextId("ls");
    setLoonstroken((prev) => [{ ...l, id }, ...prev]);
    return id;
  };
  const updateLoonstrook: AppState["updateLoonstrook"] = (id, patch) =>
    setLoonstroken((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const deleteLoonstrook: AppState["deleteLoonstrook"] = (id) =>
    setLoonstroken((prev) => prev.filter((l) => l.id !== id));

  const addBoete: AppState["addBoete"] = (b) => {
    const id = nextId("bo");
    setBoetes((prev) => [{ ...b, id }, ...prev]);
    return id;
  };
  const updateBoete: AppState["updateBoete"] = (id, patch) =>
    setBoetes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const deleteBoete: AppState["deleteBoete"] = (id) =>
    setBoetes((prev) => prev.filter((b) => b.id !== id));

  const updateComm: AppState["updateComm"] = (patch) =>
    setComm((prev) => ({ ...prev, ...patch }));

  const addVerlof: AppState["addVerlof"] = (vl) => {
    const id = nextId("vl");
    setVerlof((prev) => [{ ...vl, id }, ...prev]);
    return id;
  };
  const updateVerlof: AppState["updateVerlof"] = (id, patch) =>
    setVerlof((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteVerlof: AppState["deleteVerlof"] = (id) =>
    setVerlof((prev) => prev.filter((x) => x.id !== id));

  const addKennis: AppState["addKennis"] = (k) => {
    const id = nextId("kb");
    setKennis((prev) => [{ ...k, id }, ...prev]);
    return id;
  };
  const updateKennis: AppState["updateKennis"] = (id, patch) =>
    setKennis((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteKennis: AppState["deleteKennis"] = (id) =>
    setKennis((prev) => prev.filter((x) => x.id !== id));

  const updateInstellingen: AppState["updateInstellingen"] = (patch) =>
    setInstellingen((prev) => ({ ...prev, ...patch }));

  const addKlant: AppState["addKlant"] = (k) => {
    const id = nextId("kl");
    setKlanten((prev) => [{ ...k, id }, ...prev]);
    return id;
  };
  const updateKlant: AppState["updateKlant"] = (id, patch) =>
    setKlanten((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteKlant: AppState["deleteKlant"] = (id) =>
    setKlanten((prev) => prev.filter((x) => x.id !== id));

  return (
    <AppCtx.Provider
      value={{
        hydrated,
        users,
        projects,
        taken,
        projectPosts,
        planningen,
        saneringen,
        buurtaanpak,
        tauwOpdrachten,
        voorschouwen,
        voorschouwMappen,
        mededelingen,
        rondes,
        afspraken,
        facturen,
        opdrachtgevers,
        bedrijf,
        loonstroken,
        boetes,
        comm,
        verlof,
        kennis,
        instellingen,
        klanten,
        currentUser,
        login,
        logout,
        wisselGebruiker,
        addUser,
        updateUser,
        deleteUser,
        updateTaak,
        addTaak,
        deleteTaak,
        addProject,
        updateProject,
        deleteProject,
        addProjectPost,
        deleteProjectPost,
        addProjectReactie,
        setPostAfgehandeld,
        ensurePlanning,
        updatePlanning,
        deletePlanning,
        addPlanningDag,
        deletePlanningDag,
        updatePlanningDag,
        updatePlanningSlot,
        leegPlanningSlot,
        addSanering,
        updateSanering,
        deleteSanering,
        addBuurtaanpak,
        updateBuurtaanpak,
        deleteBuurtaanpak,
        addTauw,
        updateTauw,
        deleteTauw,
        updateTauwStap,
        addVoorschouw,
        updateVoorschouw,
        deleteVoorschouw,
        addVoorschouwMap,
        updateVoorschouwMap,
        deleteVoorschouwMap,
        addMededeling,
        deleteMededeling,
        toggleMededelingGezien,
        toggleMededelingPin,
        addRonde,
        updateRonde,
        deleteRonde,
        addAfspraak,
        updateAfspraak,
        deleteAfspraak,
        addFactuur,
        updateFactuur,
        deleteFactuur,
        addOpdrachtgever,
        updateOpdrachtgever,
        deleteOpdrachtgever,
        updateBedrijf,
        addLoonstrook,
        updateLoonstrook,
        deleteLoonstrook,
        addBoete,
        updateBoete,
        deleteBoete,
        updateComm,
        addVerlof,
        updateVerlof,
        deleteVerlof,
        addKennis,
        updateKennis,
        deleteKennis,
        updateInstellingen,
        addKlant,
        updateKlant,
        deleteKlant,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp moet binnen AppProvider gebruikt worden");
  return ctx;
}
