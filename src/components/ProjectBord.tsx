import { useEffect, useState } from "react";
import { MessagesSquare, CheckCircle2, HelpCircle, ChevronDown, Send, Trash2, Check, RotateCcw, Plus, type LucideIcon } from "lucide-react";
import { useApp } from "../store/AppContext";
import { PROJECT_POST_TYPES, type ProjectPost, type ProjectPostType, type User } from "../lib/types";

// Relatieve tijd in het Nederlands ("5 min geleden", "3 uur geleden", "gisteren").
function geleden(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const uur = Math.floor(min / 60);
  if (uur < 24) return `${uur} uur geleden`;
  const dag = Math.floor(uur / 24);
  if (dag === 1) return "gisteren";
  if (dag < 7) return `${dag} dagen geleden`;
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

const TYPE_STIJL: Record<ProjectPostType, { label: string; chip: string; icon: LucideIcon }> = {
  update: { label: "Update", chip: "bg-green-50 text-green-700", icon: CheckCircle2 },
  vraag: { label: "Vraag", chip: "bg-amber-50 text-amber-700", icon: HelpCircle },
};

function PostKaart({ post, users, currentUser, isLeiding }: { post: ProjectPost; users: User[]; currentUser: User; isLeiding: boolean }) {
  const { deleteProjectPost, addProjectReactie, setPostAfgehandeld } = useApp();
  const [reactie, setReactie] = useState("");
  const auteur = users.find((u) => u.id === post.auteurId);
  const magVerwijderen = isLeiding || post.auteurId === currentUser.id;
  const stijl = TYPE_STIJL[post.type];
  const TypeIcon = stijl.icon;

  const stuurReactie = () => {
    if (!reactie.trim()) return;
    addProjectReactie(post.id, { auteurId: currentUser.id, tekst: reactie.trim() });
    setReactie("");
  };

  const kaartStijl = post.afgehandeld
    ? "border-ink-200 bg-ink-50/50"
    : post.type === "vraag"
    ? "border-amber-200 bg-amber-50/40"
    : "border-ink-200 bg-white";

  return (
    <div className={`rounded-xl border p-3.5 ${kaartStijl}`}>
      {/* Kop: auteur, type, tijd, afgehandeld-badge */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[10px] font-semibold text-white">
          {auteur?.initialen ?? "?"}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-ink-900">{auteur?.naam ?? "Onbekend"}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stijl.chip}`}>
            <TypeIcon className="h-3 w-3" />
            {stijl.label}
          </span>
          <span className="text-xs text-ink-400">{geleden(post.aangemaakt)}</span>
        </div>
        {post.afgehandeld && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
            <Check className="h-3 w-3" />
            Afgehandeld
          </span>
        )}
      </div>

      {/* Bericht */}
      <p className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed ${post.afgehandeld ? "text-ink-500" : "text-ink-700"}`}>{post.tekst}</p>

      {/* Reacties */}
      {post.reacties.length > 0 && (
        <div className="mt-3 space-y-2 border-l-2 border-ink-200 pl-3">
          {post.reacties.map((r) => {
            const ra = users.find((u) => u.id === r.auteurId);
            return (
              <div key={r.id} className="text-sm">
                <span className="font-semibold text-ink-800">{ra?.naam.split(" ")[0] ?? "?"}</span>
                <span className="ml-1.5 text-xs text-ink-400">{geleden(r.aangemaakt)}</span>
                <div className="whitespace-pre-wrap text-ink-600">{r.tekst}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reageren + acties */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[180px] flex-1 items-center gap-2">
          <input
            value={reactie}
            onChange={(e) => setReactie(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && stuurReactie()}
            placeholder={post.type === "vraag" ? "Antwoord geven…" : "Reageer…"}
            className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <button
            onClick={stuurReactie}
            disabled={!reactie.trim()}
            className="shrink-0 rounded-lg bg-ink-800 p-2 text-white hover:bg-ink-900 disabled:opacity-40"
            title="Versturen"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {isLeiding && (
          <button
            onClick={() => setPostAfgehandeld(post.id, !post.afgehandeld, currentUser.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
              post.afgehandeld ? "text-ink-500 hover:bg-ink-100" : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            {post.afgehandeld ? (
              <>
                <RotateCcw className="h-4 w-4" />
                Heropenen
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Afhandelen
              </>
            )}
          </button>
        )}
        {magVerwijderen && (
          <button onClick={() => deleteProjectPost(post.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-red-500 hover:bg-red-50" title="Verwijderen">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {post.afgehandeld && post.afgehandeldDoor && (
        <p className="mt-2 text-[11px] text-ink-400">
          Afgehandeld door {users.find((u) => u.id === post.afgehandeldDoor)?.naam.split(" ")[0] ?? "leiding"}
          {post.afgehandeldOp ? " · " + geleden(post.afgehandeldOp) : ""}
        </p>
      )}
    </div>
  );
}

// Berichtenbord per project: teamleden plaatsen updates ("afgerond") of vragen,
// de leiding ziet alles en kan het afhandelen.
export function ProjectBord({ projectId, defaultOpen = false }: { projectId: string; defaultOpen?: boolean }) {
  const { currentUser, users, projectPosts, addProjectPost } = useApp();
  const [open, setOpen] = useState(defaultOpen);
  const [type, setType] = useState<ProjectPostType>("update");
  const [tekst, setTekst] = useState("");

  // Bij navigatie vanuit een melding: klap dit bord open.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";

  const posts = projectPosts
    .filter((p) => p.projectId === projectId)
    .sort((a, b) => {
      if (a.afgehandeld !== b.afgehandeld) return a.afgehandeld ? 1 : -1; // open eerst
      return a.aangemaakt < b.aangemaakt ? 1 : -1; // dan nieuwste eerst
    });
  const openItems = posts.filter((p) => !p.afgehandeld).length;

  const plaats = () => {
    if (!tekst.trim()) return;
    addProjectPost({ projectId, type, auteurId: currentUser.id, tekst: tekst.trim() });
    setTekst("");
    setType("update");
    setOpen(true);
  };

  return (
    <div className="border-t border-ink-100">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-ink-50">
        <MessagesSquare className="h-4 w-4 text-ink-500" />
        <span className="text-sm font-semibold text-ink-700">Updates &amp; vragen</span>
        {posts.length > 0 && <span className="text-xs text-ink-400">({posts.length})</span>}
        {openItems > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{openItems} open</span>}
        <ChevronDown className={`ml-auto h-4 w-4 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {/* Nieuw bericht plaatsen */}
          <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <div className="mb-2 inline-flex overflow-hidden rounded-lg border border-ink-200 bg-white">
              {PROJECT_POST_TYPES.map((t) => {
                const actief = type === t;
                const s = TYPE_STIJL[t];
                const Icon = s.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${actief ? "bg-brand-600 text-white" : "text-ink-500 hover:bg-ink-50"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {s.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              rows={2}
              placeholder={type === "vraag" ? "Stel je vraag aan het team of de leiding…" : "Wat heb je gedaan of afgerond?"}
              className="w-full resize-none rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={plaats}
                disabled={!tekst.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Plaatsen
              </button>
            </div>
          </div>

          {/* Berichtenlijst */}
          {posts.length === 0 ? (
            <p className="px-1 py-2 text-sm text-ink-400">Nog geen updates of vragen. Plaats hierboven de eerste.</p>
          ) : (
            posts.map((p) => <PostKaart key={p.id} post={p} users={users} currentUser={currentUser} isLeiding={isLeiding} />)
          )}
        </div>
      )}
    </div>
  );
}
