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
  Schouwafspraak,
  BlancoBrief,
  AgendaItem,
  Todo,
  KennisArtikel,
  Instellingen,
  Klant,
  Opdrachtgever,
} from "../lib/types";
import { legeDag, legeSlots, PLANNING_TIJDEN } from "../lib/types";
import { verifieerWachtwoord } from "../lib/auth";
import { netjesPlaats } from "../lib/brieven";
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
  SEED_SCHOUW,
  SEED_BLANCO,
  SEED_AGENDA_ITEMS,
  SEED_TODOS,
  SEED_KENNIS,
  SEED_INSTELLINGEN,
  SEED_KLANTEN,
  SEED_OPDRACHTGEVERS,
  SEED_BUURTAANPAK,
} from "../lib/seed";
import { idbGet, idbSet } from "./db";
import { mergeCollection, mergeTombstones, type Tombstones } from "../lib/merge";
import { supabaseAan, sb, sbLeesAlles, sbSchrijf, sbVersies, sbLeesKeys, sbLogin, sbRegistreer, sbLogout, sbSessieEmail, bewaarSyncCred, wisSyncCred, sbHerstelSessie } from "../lib/supabase";

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
  schouwafspraken: "wire.schouwafspraken",
  blancoBrieven: "wire.blancoBrieven",
  agendaItems: "wire.agendaItems",
  todos: "wire.todos",
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
  synced: boolean; // true zodra dit apparaat een Supabase-sessie heeft (= cross-device sync actief)
  backupInfo: { tijd: string; totaal: number } | null; // laatste lokale veiligheidskopie
  herstelBackup: () => Promise<boolean>; // zet de gegevens terug vanuit de lokale veiligheidskopie
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
  schouwafspraken: Schouwafspraak[];
  blancoBrieven: BlancoBrief[];
  agendaItems: AgendaItem[];
  todos: Todo[];
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

  addSchouw: (s: Omit<Schouwafspraak, "id" | "aangemaakt">) => string;
  updateSchouw: (id: string, patch: Partial<Schouwafspraak>) => void;
  deleteSchouw: (id: string) => void;

  addBlanco: (b: Omit<BlancoBrief, "id" | "aangemaakt">) => string;
  updateBlanco: (id: string, patch: Partial<BlancoBrief>) => void;
  deleteBlanco: (id: string) => void;

  addAgendaItem: (a: Omit<AgendaItem, "id" | "aangemaakt">) => string;
  updateAgendaItem: (id: string, patch: Partial<AgendaItem>) => void;
  deleteAgendaItem: (id: string) => void;

  addTodo: (t: Omit<Todo, "id" | "aangemaakt">) => string;
  updateTodo: (id: string, patch: Partial<Todo>) => void;
  deleteTodo: (id: string) => void;

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
  const [schouwafspraken, setSchouwafspraken] = useState<Schouwafspraak[]>(SEED_SCHOUW);
  const [blancoBrieven, setBlancoBrieven] = useState<BlancoBrief[]>(SEED_BLANCO);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>(SEED_AGENDA_ITEMS);
  const [todos, setTodos] = useState<Todo[]>(SEED_TODOS);
  const [kennis, setKennis] = useState<KennisArtikel[]>(SEED_KENNIS);
  const [instellingen, setInstellingen] = useState<Instellingen>(SEED_INSTELLINGEN);
  const [klanten, setKlanten] = useState<Klant[]>(SEED_KLANTEN);
  // Tombstones: welke records verwijderd zijn (per onderdeel). Zo brengt een samenvoeging een
  // verwijderd record niet terug, maar blijft alle overige data behouden.
  const [deletes, setDeletes] = useState<Tombstones>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Supabase: actieve sessie + bijhouden wat we al gesynct hebben (tegen terugkaats-lussen).
  const [sbSessie, setSbSessie] = useState(false);
  const sync = useRef<{ klaar: boolean; gezien: Record<string, string>; bezig: Set<string>; laatsteFout: string; versies: Record<string, string> }>({ klaar: false, gezien: {}, bezig: new Set(), laatsteFout: "", versies: {} });
  // Laatst-gepushte referentie per slice — zo serialiseren we alleen de slice die écht wijzigde (niet alle 23 per klik).
  const pushRef = useRef<Record<string, unknown>>({});

  // Eenmalig inladen vanuit de lokale database (IndexedDB).
  useEffect(() => {
    let actief = true;
    (async () => {
      let [u, p, t, pp, pl, san, tw, v, r, af, fac, bed, loon, boe, communicatie, verl, kn, inst, kl, s, vm, med, og, ba, del, sch, ai, td, bl] = await Promise.all([
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
        laadSlice<Tombstones>("deletes", "wire.deletes", {}),
        laadSlice<Schouwafspraak[]>("schouwafspraken", LS.schouwafspraken, SEED_SCHOUW),
        laadSlice<AgendaItem[]>("agendaItems", LS.agendaItems, SEED_AGENDA_ITEMS),
        laadSlice<Todo[]>("todos", LS.todos, SEED_TODOS),
        laadSlice<BlancoBrief[]>("blancoBrieven", LS.blancoBrieven, SEED_BLANCO),
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
          plaats: netjesPlaats(o.plaats), // nette plaatsnaam i.p.v. HOOFDLETTERS (bruikbaar in Google Maps)
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
      setSchouwafspraken(sch ?? []);
      setBlancoBrieven(bl ?? []);
      setAgendaItems(ai ?? []);
      setTodos(td ?? []);
      setKennis(kn);
      setInstellingen({ ...SEED_INSTELLINGEN, ...inst });
      setKlanten(kl);
      setDeletes(del ?? {});
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
    if (hydrated) void idbSet("schouwafspraken", schouwafspraken);
  }, [schouwafspraken, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("blancoBrieven", blancoBrieven);
  }, [blancoBrieven, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("agendaItems", agendaItems);
  }, [agendaItems, hydrated]);
  useEffect(() => {
    if (hydrated) void idbSet("todos", todos);
  }, [todos, hydrated]);
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
  useEffect(() => {
    if (hydrated) void idbSet("deletes", deletes);
  }, [deletes, hydrated]);

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
    rondes: (v) => setRondes((v as Brievenronde[]).map((o) => ({ ...o, plaats: netjesPlaats(o.plaats) }))),
    afspraken: (v) => setAfspraken(v as Afspraak[]),
    facturen: (v) => setFacturen(v as Factuur[]),
    opdrachtgevers: (v) => setOpdrachtgevers(v as Opdrachtgever[]),
    bedrijf: (v) => setBedrijf(v as Bedrijf),
    loonstroken: (v) => setLoonstroken(v as Loonstrook[]),
    boetes: (v) => setBoetes(v as Boete[]),
    comm: (v) => setComm(v as Communicatie),
    verlof: (v) => setVerlof(v as Verlof[]),
    schouwafspraken: (v) => setSchouwafspraken(v as Schouwafspraak[]),
    blancoBrieven: (v) => setBlancoBrieven(v as BlancoBrief[]),
    agendaItems: (v) => setAgendaItems(v as AgendaItem[]),
    todos: (v) => setTodos(v as Todo[]),
    kennis: (v) => setKennis(v as KennisArtikel[]),
    instellingen: (v) => setInstellingen(v as Instellingen),
    klanten: (v) => setKlanten(v as Klant[]),
    deletes: (v) => setDeletes((prev) => mergeTombstones(prev, v as Tombstones)),
  };
  const waarden: Record<string, unknown> = {
    users, projects, taken, projectPosts, planningen, saneringen, tauw: tauwOpdrachten,
    voorschouwen, voorschouwMappen, mededelingen, rondes, afspraken, facturen, bedrijf,
    loonstroken, boetes, comm, verlof, schouwafspraken, blancoBrieven, agendaItems, todos, kennis, instellingen, klanten, opdrachtgevers, buurtaanpak,
    deletes,
  };
  // Altijd de NIEUWSTE lokale waarden beschikbaar in de sync-effecten (die niet bij elke data-wijziging
  // opnieuw opgebouwd worden). Nodig voor de wipe-bescherming hieronder.
  const waardenRef = useRef(waarden);
  waardenRef.current = waarden;
  const deletesRef = useRef(deletes);
  deletesRef.current = deletes;

  // Onderdelen die een lijst van records met een `id` zijn — deze voegen we per record samen (nooit iets kwijt).
  // De overige onderdelen (bedrijf, comm, instellingen) zijn losse objecten: daar wint de laatste versie.
  const COLLECTIONS = new Set([
    "users", "projects", "taken", "projectPosts", "planningen", "saneringen", "buurtaanpak", "tauw",
    "voorschouwen", "voorschouwMappen", "mededelingen", "rondes", "afspraken", "facturen",
    "opdrachtgevers", "loonstroken", "boetes", "verlof", "schouwafspraken", "blancoBrieven", "agendaItems", "todos", "kennis", "klanten",
  ]);

  // Past binnenkomende centrale data toe: lijsten worden per record samengevoegd met wat er lokaal staat
  // (zo verdwijnt een record nooit), verwijderde records blijven verwijderd. Losse objecten: laatste wint.
  const applyRemote = (key: string, val: unknown) => {
    if (key === "deletes") {
      // Ref meteen (synchroon) bijwerken zodat lijst-samenvoegingen verderop in dezelfde ronde de
      // nieuwe tombstones al meenemen — anders zou een net-verwijderd record heel even terugkomen.
      deletesRef.current = mergeTombstones(deletesRef.current, val as Tombstones);
      setDeletes(deletesRef.current);
      return;
    }
    if (!(key in setters)) return;
    if (COLLECTIONS.has(key)) {
      const merged = mergeCollection(
        waardenRef.current[key] as { id: string }[] | undefined,
        val as { id: string }[] | undefined,
        deletesRef.current[key]
      );
      setters[key](merged);
    } else {
      setters[key](val);
    }
  };

  // Onthoud dat records verwijderd zijn, zodat een samenvoeging (van dit of een ander apparaat) ze niet terugbrengt.
  const tomb = (slice: string, ...ids: string[]) => {
    if (!ids.length) return;
    const nu = new Date().toISOString();
    // Ref meteen bijwerken (synchroon) zodat de opschoon-effecten en samenvoegingen de verwijdering direct kennen.
    const volgend: Tombstones = { ...deletesRef.current, [slice]: { ...(deletesRef.current[slice] ?? {}) } };
    for (const id of ids) volgend[slice][id] = nu;
    deletesRef.current = volgend;
    setDeletes(volgend);
  };

  // Houd verwijderde records altijd uit de lijsten — ook als de verwijdering (tombstone) via een ander
  // apparaat binnenkomt vóór of ná de bijbehorende lijst-update. Idempotent: draait alleen als er iets weg moet.
  useEffect(() => {
    if (!hydrated) return;
    for (const key of COLLECTIONS) {
      const tombs = deletes[key];
      const setter = setters[key];
      if (!tombs || !setter) continue;
      const arr = waardenRef.current[key] as { id: string }[] | undefined;
      if (Array.isArray(arr) && arr.some((it) => it && tombs[it.id])) {
        setter(arr.filter((it) => !(it && tombs[it.id])));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deletes, hydrated]);

  // ── Automatische veiligheidskopie (lokaal, IndexedDB) ──
  // Bewaart periodiek én vóór elke synchronisatie een back-up van alle gegevens. Een lege/kleinere staat
  // overschrijft nooit een vollere back-up, zodat data nooit verloren gaat — ook niet bij een onbekende fout.
  const [backupInfo, setBackupInfo] = useState<{ tijd: string; totaal: number } | null>(null);
  const totaalRecords = (d: Record<string, unknown>) => Object.values(d).reduce<number>((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
  const maakSnapshot = async () => {
    try {
      const data: Record<string, unknown> = { ...waardenRef.current };
      const totaal = totaalRecords(data);
      if (totaal === 0) return; // niets zinnigs om te bewaren
      const bestaand = await idbGet<{ totaal: number }>("backup");
      if (bestaand && bestaand.totaal > totaal) return; // bestaande back-up is voller → niet overschrijven
      const snap = { tijd: new Date().toISOString(), totaal, data };
      await idbSet("backup", snap);
      setBackupInfo({ tijd: snap.tijd, totaal });
    } catch { /* back-up is niet kritisch voor de werking */ }
  };
  const herstelBackup = async (): Promise<boolean> => {
    try {
      const snap = await idbGet<{ tijd: string; data: Record<string, unknown> }>("backup");
      if (!snap?.data) return false;
      // Tombstones uit de kopie terugzetten (vervangen, niet samenvoegen) — anders zou de opschoning een
      // teruggezet record meteen weer als "verwijderd" weghalen.
      const snapDel = (snap.data.deletes as Tombstones) ?? {};
      deletesRef.current = snapDel;
      setDeletes(snapDel);
      for (const [key, val] of Object.entries(snap.data)) {
        if (key === "deletes") continue;
        setters[key]?.(val);
      }
      return true;
    } catch { return false; }
  };
  const maakSnapshotRef = useRef(maakSnapshot);
  maakSnapshotRef.current = maakSnapshot;

  // Periodieke back-up: bij opstart + elke 10 minuten. Laadt ook de bestaande back-up-info voor de UI.
  useEffect(() => {
    if (!hydrated) return;
    void idbGet<{ tijd: string; totaal: number }>("backup").then((s) => { if (s) setBackupInfo({ tijd: s.tijd, totaal: s.totaal }); });
    const t = setTimeout(() => void maakSnapshotRef.current(), 4000); // even na het laden
    const iv = setInterval(() => void maakSnapshotRef.current(), 10 * 60 * 1000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [hydrated]);

  // 1) Houd bij of er een Supabase-sessie is — en herstel die bij opstart automatisch met de lokaal
  //    bewaarde inloggegevens, zodat dit apparaat na heropenen vanzelf weer gekoppeld is.
  useEffect(() => {
    if (!supabaseAan) return;
    let actief = true;
    void sbHerstelSessie().then((ok) => { if (actief) setSbSessie(ok); });
    const { data: sub } = sb().auth.onAuthStateChange((_e, session) => { if (actief) setSbSessie(!!session); });
    // Probeer het ook opnieuw zodra het apparaat weer online komt of het tabblad weer zichtbaar wordt.
    const opnieuw = () => { if (actief) void sbHerstelSessie().then((ok) => { if (actief && ok) setSbSessie(true); }); };
    window.addEventListener("online", opnieuw);
    document.addEventListener("visibilitychange", opnieuw);
    return () => { actief = false; sub.subscription.unsubscribe(); window.removeEventListener("online", opnieuw); document.removeEventListener("visibilitychange", opnieuw); };
  }, []);

  // 2) Bij een actieve sessie: haal de gedeelde data op, zet ontbrekende onderdelen klaar,
  //    bepaal wie is ingelogd, en luister naar realtime-wijzigingen van andere apparaten.
  useEffect(() => {
    if (!supabaseAan || !sbSessie || !hydrated) return;
    let actief = true;
    // Past binnenkomende remote-data toe — alleen écht gewijzigde slices, en niet terwijl we die zelf
    // aan het wegschrijven zijn (anders zou een net-gemaakte wijziging worden teruggedraaid).
    const pasToe = (remote: Record<string, unknown>) => {
      // Tombstones eerst toepassen, zodat verwijderde records niet heel even terugkomen.
      if ("deletes" in remote) {
        const j = JSON.stringify(remote.deletes);
        if (sync.current.gezien.deletes !== j) { sync.current.gezien.deletes = j; applyRemote("deletes", remote.deletes); }
      }
      for (const [key, val] of Object.entries(remote)) {
        if (key === "deletes" || !(key in setters) || sync.current.bezig.has(key)) continue;
        const j = JSON.stringify(val);
        if (sync.current.gezien[key] === j) continue;
        sync.current.gezien[key] = j;
        applyRemote(key, val); // lijsten worden samengevoegd → een gevulde lokale lijst raakt nooit records kwijt
      }
    };
    const onthoudVersie = (key: string) => (ua: string) => { sync.current.versies[key] = ua; };
    void maakSnapshotRef.current(); // veiligheidskopie vóór we remote data toepassen
    (async () => {
      try {
        const remote = await sbLeesAlles();
        if (!actief) return;
        // Tombstones eerst, zodat verwijderde records niet via de samenvoeging terugkomen.
        if ("deletes" in remote) { sync.current.gezien.deletes = JSON.stringify(remote.deletes); applyRemote("deletes", remote.deletes); }
        for (const [key, val] of Object.entries(remote)) {
          if (key === "deletes" || !(key in setters)) continue;
          // Lokaal + centraal per record samenvoegen: een gevulde lokale lijst raakt nooit records kwijt,
          // en records die alleen centraal staan komen erbij. Push (stap 3) stuurt de samenvoeging terug.
          sync.current.gezien[key] = JSON.stringify(val);
          applyRemote(key, val);
        }
        for (const key of Object.keys(setters)) {
          if (!(key in remote)) {
            sync.current.gezien[key] = JSON.stringify(waardenRef.current[key]);
            sync.current.bezig.add(key);
            void sbSchrijf(key, waardenRef.current[key]).then(onthoudVersie(key)).catch((e) => { sync.current.laatsteFout = String((e as Error)?.message ?? e); }).finally(() => sync.current.bezig.delete(key));
          }
        }
        const email = await sbSessieEmail();
        if (actief && email) {
          const lijst = (remote.users as User[] | undefined) ?? users;
          const ik = lijst.find((u) => u.email.toLowerCase() === email.toLowerCase());
          if (ik) setCurrentUserId(ik.id);
        }
        try { sync.current.versies = { ...sync.current.versies, ...(await sbVersies()) }; } catch { /* tijdstempels niet kritisch */ }
        sync.current.klaar = true;
        sync.current.laatsteFout = "";
      } catch (e) { sync.current.laatsteFout = String((e as Error)?.message ?? e); /* blijf local-first werken */ }
    })();
    const kanaal = sb()
      .channel("wire_state")
      .on("postgres_changes", { event: "*", schema: "public", table: "wire_state" }, (payload) => {
        const row = (payload.new ?? payload.old) as { key?: string; data?: unknown; updated_at?: string } | null;
        if (!row?.key || !(row.key in setters)) return;
        if (row.updated_at) sync.current.versies[row.key] = row.updated_at; // bijgewerkt → 5s-poll haalt 'm niet nogmaals op
        if (sync.current.bezig.has(row.key)) return; // eigen push onderweg
        const j = JSON.stringify(row.data);
        if (sync.current.gezien[row.key] === j) return; // eigen wijziging — overslaan
        sync.current.gezien[row.key] = j;
        applyRemote(row.key, row.data); // lijsten samenvoegen → nooit een record kwijt
      })
      .subscribe();
    // Vangnet-poll elke 2 seconden: eerst een piepkleine check op tijdstempels, en alléén de
    // daadwerkelijk gewijzigde onderdelen ophalen. De realtime-subscription hierboven (postgres_changes)
    // levert wijzigingen doorgaans binnen ~1s; deze poll is de terugval als de websocket even wegvalt,
    // zodat wijzigingen van collega's óók dan snel (≤2s) verschijnen — zónder telkens alle data te downloaden.
    const interval = setInterval(() => {
      if (!actief || !sync.current.klaar) return;
      void (async () => {
        try {
          const versies = await sbVersies();
          if (!actief) return;
          const gewijzigd = Object.keys(versies).filter((k) => k in setters && !sync.current.bezig.has(k) && versies[k] !== sync.current.versies[k]);
          if (gewijzigd.length) {
            const data = await sbLeesKeys(gewijzigd);
            if (!actief) return;
            pasToe(data);
          }
          for (const k of gewijzigd) sync.current.versies[k] = versies[k];
          // Veiligheidsnet: lokale onderdelen die data hebben maar nog NIET in de centrale database staan,
          // worden vanzelf geüpload (geen handmatige actie nodig). Eenmaal geüpload staan ze in 'versies'.
          for (const key of Object.keys(setters)) {
            if (key in versies || sync.current.bezig.has(key)) continue;
            const lokaal = waardenRef.current[key];
            const heeftData = Array.isArray(lokaal) ? lokaal.length > 0 : !!lokaal;
            if (!heeftData) continue;
            sync.current.bezig.add(key);
            void sbSchrijf(key, lokaal).then((ua) => { sync.current.versies[key] = ua; }).catch((e) => { sync.current.laatsteFout = String((e as Error)?.message ?? e); }).finally(() => sync.current.bezig.delete(key));
          }
          sync.current.laatsteFout = "";
        } catch (e) { sync.current.laatsteFout = String((e as Error)?.message ?? e); }
      })();
    }, 2000);
    return () => { actief = false; sync.current.klaar = false; clearInterval(interval); void sb().removeChannel(kanaal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseAan, sbSessie, hydrated]);

  // 3) Push elke lokale wijziging naar de cloud (alleen ná de eerste synchronisatie).
  useEffect(() => {
    if (!supabaseAan || !sbSessie || !hydrated || !sync.current.klaar) return;
    for (const key of Object.keys(setters)) {
      if (pushRef.current[key] === waarden[key]) continue; // referentie ongewijzigd → slice niet veranderd, niet serialiseren
      pushRef.current[key] = waarden[key];
      const j = JSON.stringify(waarden[key]);
      if (sync.current.gezien[key] === j) continue;
      // Wipe-bescherming: een lijst die net leeg is geraakt mag een gevulde remote NIET overschrijven
      // (bijna altijd ongewenst dataverlies, bv. door een opschoning op een ander apparaat).
      if (Array.isArray(waarden[key]) && (waarden[key] as unknown[]).length === 0 && sync.current.gezien[key] && sync.current.gezien[key] !== "[]") {
        sync.current.laatsteFout = `Wissen van ${key} geblokkeerd (lokaal leeg, centraal gevuld).`;
        continue;
      }
      sync.current.gezien[key] = j;
      sync.current.bezig.add(key); // markeer als 'wordt geschreven' zodat de 5s-pull 'm niet terughaalt
      void sbSchrijf(key, waarden[key]).then((ua) => { sync.current.versies[key] = ua; }).catch((e) => { sync.current.laatsteFout = String((e as Error)?.message ?? e); }).finally(() => sync.current.bezig.delete(key));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseAan, sbSessie, hydrated, users, projects, taken, projectPosts, planningen, saneringen, tauwOpdrachten, voorschouwen, voorschouwMappen, mededelingen, rondes, afspraken, facturen, bedrijf, loonstroken, boetes, comm, verlof, schouwafspraken, blancoBrieven, agendaItems, todos, kennis, instellingen, klanten, opdrachtgevers, buurtaanpak, deletes]);

  const currentUser = users.find((u) => u.id === currentUserId) ?? null;

  const login: AppState["login"] = async (email, wachtwoord) => {
    const e = email.trim().toLowerCase();
    // Eerst via Supabase (centrale database). Lukt dat, dan is er meteen een sessie en synct dit apparaat.
    if (supabaseAan) {
      try {
        if (await sbLogin(e, wachtwoord)) {
          const u = users.find((x) => x.email.toLowerCase() === e);
          if (u) setCurrentUserId(u.id);
          bewaarSyncCred(e, wachtwoord); // lokaal bewaren → blijft vanzelf gekoppeld na heropenen
          return true;
        }
      } catch { /* val terug op de lokale controle */ }
    }
    const u = users.find((x) => x.email.toLowerCase() === e);
    if (!u) return false;
    const ok = await verifieerWachtwoord(wachtwoord, u);
    if (!ok) return false;
    // Lokaal correct, maar (nog) geen Supabase-sessie. Registreer + meld aan zodat OOK dit apparaat met de
    // centrale database synchroniseert (self-healing). Faalt dit (signup uit, of bestaand account met ander
    // wachtwoord), dan blijft de app gewoon lokaal werken.
    if (supabaseAan) {
      try { await sbRegistreer(e, wachtwoord); await sbLogin(e, wachtwoord); } catch { /* lokaal blijven werken */ }
      bewaarSyncCred(e, wachtwoord); // ook nu lokaal bewaren → automatisch herstellen bij volgende start
    }
    setCurrentUserId(u.id);
    return true;
  };

  const logout = () => { if (supabaseAan) { void sbLogout(); wisSyncCred(); } setCurrentUserId(null); };
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
    tomb("users", id);
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
    const takenWeg = taken.filter((t) => t.projectId === id).map((t) => t.id);
    const postsWeg = projectPosts.filter((p) => p.projectId === id).map((p) => p.id);
    const planningWeg = planningen.filter((pl) => pl.projectId === id).map((pl) => pl.id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setTaken((prev) => prev.filter((t) => t.projectId !== id));
    setProjectPosts((prev) => prev.filter((p) => p.projectId !== id));
    setPlanningen((prev) => prev.filter((pl) => pl.projectId !== id));
    tomb("projects", id);
    if (takenWeg.length) tomb("taken", ...takenWeg);
    if (postsWeg.length) tomb("projectPosts", ...postsWeg);
    if (planningWeg.length) tomb("planningen", ...planningWeg);
  };

  const updateTaak: AppState["updateTaak"] = (id, patch) =>
    setTaken((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const addTaak: AppState["addTaak"] = (t) =>
    setTaken((prev) => [...prev, { ...t, id: nextId("t") }]);

  const deleteTaak: AppState["deleteTaak"] = (id) => {
    setTaken((prev) => prev.filter((t) => t.id !== id));
    tomb("taken", id);
  };

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

  const deleteProjectPost: AppState["deleteProjectPost"] = (id) => {
    setProjectPosts((prev) => prev.filter((p) => p.id !== id));
    tomb("projectPosts", id);
  };

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

  const deletePlanning: AppState["deletePlanning"] = (projectId) => {
    const weg = planningen.filter((p) => p.projectId === projectId).map((p) => p.id);
    setPlanningen((prev) => prev.filter((p) => p.projectId !== projectId));
    if (weg.length) tomb("planningen", ...weg);
  };

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
  const deleteSanering: AppState["deleteSanering"] = (id) => {
    setSaneringen((prev) => prev.filter((s) => s.id !== id));
    tomb("saneringen", id);
  };

  const addBuurtaanpak: AppState["addBuurtaanpak"] = (b) => {
    const id = nextId("ba");
    setBuurtaanpak((prev) => [{ ...b, id }, ...prev]);
    return id;
  };
  const updateBuurtaanpak: AppState["updateBuurtaanpak"] = (id, patch) =>
    setBuurtaanpak((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const deleteBuurtaanpak: AppState["deleteBuurtaanpak"] = (id) => {
    setBuurtaanpak((prev) => prev.filter((b) => b.id !== id));
    tomb("buurtaanpak", id);
  };
  const addTauw: AppState["addTauw"] = (t) => {
    const id = nextId("tauw");
    setTauwOpdrachten((prev) => [{ ...t, id }, ...prev]);
    return id;
  };
  const updateTauw: AppState["updateTauw"] = (id, patch) =>
    setTauwOpdrachten((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const deleteTauw: AppState["deleteTauw"] = (id) => {
    setTauwOpdrachten((prev) => prev.filter((t) => t.id !== id));
    tomb("tauw", id);
  };
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

  const deleteVoorschouw: AppState["deleteVoorschouw"] = (id) => {
    setVoorschouwen((prev) => prev.filter((v) => v.id !== id));
    tomb("voorschouwen", id);
  };
  const addVoorschouwMap: AppState["addVoorschouwMap"] = (naam) => {
    const id = nextId("vmap");
    setVoorschouwMappen((prev) => {
      const maxVolgorde = prev.reduce((m, x) => Math.max(m, x.volgorde ?? -1), -1);
      return [...prev, { id, naam: naam.trim() || "Nieuwe map", volgorde: maxVolgorde + 1, aangemaakt: new Date().toISOString() }];
    });
    return id;
  };
  const updateVoorschouwMap: AppState["updateVoorschouwMap"] = (id, patch) =>
    setVoorschouwMappen((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch, naam: (patch.naam ?? m.naam).trim() || m.naam } : m)));
  const deleteVoorschouwMap: AppState["deleteVoorschouwMap"] = (id) => {
    setVoorschouwMappen((prev) => prev.filter((m) => m.id !== id));
    tomb("voorschouwMappen", id);
    // Adressen in deze map losmaken (de voorschouwen zelf blijven bestaan).
    setVoorschouwen((prev) => prev.map((v) => (v.mapId === id ? { ...v, mapId: undefined } : v)));
  };

  const addMededeling: AppState["addMededeling"] = (m) => {
    const id = nextId("med");
    setMededelingen((prev) => [{ ...m, id, aangemaakt: new Date().toISOString(), gezienDoor: [] }, ...prev]);
    return id;
  };
  const deleteMededeling: AppState["deleteMededeling"] = (id) => {
    setMededelingen((prev) => prev.filter((m) => m.id !== id));
    tomb("mededelingen", id);
  };
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

  const deleteRonde: AppState["deleteRonde"] = (id) => {
    setRondes((prev) => prev.filter((r) => r.id !== id));
    tomb("rondes", id);
  };

  const addAfspraak: AppState["addAfspraak"] = (a) => {
    const id = nextId("af");
    setAfspraken((prev) => [...prev, { ...a, id }]);
    return id;
  };

  const updateAfspraak: AppState["updateAfspraak"] = (id, patch) =>
    setAfspraken((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const deleteAfspraak: AppState["deleteAfspraak"] = (id) => {
    setAfspraken((prev) => prev.filter((a) => a.id !== id));
    tomb("afspraken", id);
  };

  const addFactuur: AppState["addFactuur"] = (f) => {
    const id = nextId("f");
    setFacturen((prev) => [{ ...f, id }, ...prev]);
    return id;
  };

  const updateFactuur: AppState["updateFactuur"] = (id, patch) =>
    setFacturen((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const deleteFactuur: AppState["deleteFactuur"] = (id) => {
    setFacturen((prev) => prev.filter((f) => f.id !== id));
    tomb("facturen", id);
  };

  const addOpdrachtgever: AppState["addOpdrachtgever"] = (o) => {
    const id = nextId("og");
    setOpdrachtgevers((prev) => [...prev, { ...o, id }]);
    return id;
  };
  const updateOpdrachtgever: AppState["updateOpdrachtgever"] = (id, patch) =>
    setOpdrachtgevers((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const deleteOpdrachtgever: AppState["deleteOpdrachtgever"] = (id) => {
    setOpdrachtgevers((prev) => prev.filter((o) => o.id !== id));
    tomb("opdrachtgevers", id);
  };

  const updateBedrijf: AppState["updateBedrijf"] = (patch) =>
    setBedrijf((prev) => ({ ...prev, ...patch }));

  const addLoonstrook: AppState["addLoonstrook"] = (l) => {
    const id = nextId("ls");
    setLoonstroken((prev) => [{ ...l, id }, ...prev]);
    return id;
  };
  const updateLoonstrook: AppState["updateLoonstrook"] = (id, patch) =>
    setLoonstroken((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const deleteLoonstrook: AppState["deleteLoonstrook"] = (id) => {
    setLoonstroken((prev) => prev.filter((l) => l.id !== id));
    tomb("loonstroken", id);
  };

  const addBoete: AppState["addBoete"] = (b) => {
    const id = nextId("bo");
    setBoetes((prev) => [{ ...b, id }, ...prev]);
    return id;
  };
  const updateBoete: AppState["updateBoete"] = (id, patch) =>
    setBoetes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const deleteBoete: AppState["deleteBoete"] = (id) => {
    setBoetes((prev) => prev.filter((b) => b.id !== id));
    tomb("boetes", id);
  };

  const updateComm: AppState["updateComm"] = (patch) =>
    setComm((prev) => ({ ...prev, ...patch }));

  const addVerlof: AppState["addVerlof"] = (vl) => {
    const id = nextId("vl");
    setVerlof((prev) => [{ ...vl, id }, ...prev]);
    return id;
  };
  const updateVerlof: AppState["updateVerlof"] = (id, patch) =>
    setVerlof((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteVerlof: AppState["deleteVerlof"] = (id) => {
    setVerlof((prev) => prev.filter((x) => x.id !== id));
    tomb("verlof", id);
  };

  const addSchouw: AppState["addSchouw"] = (s) => {
    const id = nextId("sa");
    setSchouwafspraken((prev) => [{ ...s, id, aangemaakt: new Date().toISOString() }, ...prev]);
    return id;
  };
  const updateSchouw: AppState["updateSchouw"] = (id, patch) =>
    setSchouwafspraken((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteSchouw: AppState["deleteSchouw"] = (id) => {
    setSchouwafspraken((prev) => prev.filter((x) => x.id !== id));
    tomb("schouwafspraken", id);
  };

  const addBlanco: AppState["addBlanco"] = (b) => {
    const id = nextId("bl");
    setBlancoBrieven((prev) => [{ ...b, id, aangemaakt: new Date().toISOString() }, ...prev]);
    return id;
  };
  const updateBlanco: AppState["updateBlanco"] = (id, patch) =>
    setBlancoBrieven((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteBlanco: AppState["deleteBlanco"] = (id) => {
    setBlancoBrieven((prev) => prev.filter((x) => x.id !== id));
    tomb("blancoBrieven", id);
  };

  const addAgendaItem: AppState["addAgendaItem"] = (a) => {
    const id = nextId("ag");
    setAgendaItems((prev) => [{ ...a, id, aangemaakt: new Date().toISOString() }, ...prev]);
    return id;
  };
  const updateAgendaItem: AppState["updateAgendaItem"] = (id, patch) =>
    setAgendaItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteAgendaItem: AppState["deleteAgendaItem"] = (id) => {
    setAgendaItems((prev) => prev.filter((x) => x.id !== id));
    tomb("agendaItems", id);
  };

  const addTodo: AppState["addTodo"] = (t) => {
    const id = nextId("todo");
    setTodos((prev) => [{ ...t, id, aangemaakt: new Date().toISOString() }, ...prev]);
    return id;
  };
  const updateTodo: AppState["updateTodo"] = (id, patch) =>
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteTodo: AppState["deleteTodo"] = (id) => {
    setTodos((prev) => prev.filter((x) => x.id !== id));
    tomb("todos", id);
  };

  const addKennis: AppState["addKennis"] = (k) => {
    const id = nextId("kb");
    setKennis((prev) => [{ ...k, id }, ...prev]);
    return id;
  };
  const updateKennis: AppState["updateKennis"] = (id, patch) =>
    setKennis((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteKennis: AppState["deleteKennis"] = (id) => {
    setKennis((prev) => prev.filter((x) => x.id !== id));
    tomb("kennis", id);
  };

  const updateInstellingen: AppState["updateInstellingen"] = (patch) =>
    setInstellingen((prev) => ({ ...prev, ...patch }));

  const addKlant: AppState["addKlant"] = (k) => {
    const id = nextId("kl");
    setKlanten((prev) => [{ ...k, id }, ...prev]);
    return id;
  };
  const updateKlant: AppState["updateKlant"] = (id, patch) =>
    setKlanten((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteKlant: AppState["deleteKlant"] = (id) => {
    setKlanten((prev) => prev.filter((x) => x.id !== id));
    tomb("klanten", id);
  };

  return (
    <AppCtx.Provider
      value={{
        hydrated,
        synced: supabaseAan && sbSessie,
        backupInfo,
        herstelBackup,
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
        schouwafspraken,
        blancoBrieven,
        agendaItems,
        todos,
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
        addSchouw,
        updateSchouw,
        deleteSchouw,
        addBlanco,
        updateBlanco,
        deleteBlanco,
        addAgendaItem,
        updateAgendaItem,
        deleteAgendaItem,
        addTodo,
        updateTodo,
        deleteTodo,
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
