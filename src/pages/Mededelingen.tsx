import { Megaphone, MessagesSquare } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "../components/ui";
import { MededelingComposer, MededelingenFeed } from "../components/MededelingenBord";

// Tweekoloms-layout: links stuur je een melding, rechts staat de chat met álle mededelingen.
// Werknemers (geen leiding) zien alleen de chat.
export function Mededelingen() {
  const { currentUser } = useApp();
  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";

  const chat = (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-5 py-3.5">
        <MessagesSquare className="h-5 w-5 text-brand-600" />
        <h3 className="text-sm font-bold text-ink-900">Chat</h3>
        <span className="hidden text-xs text-ink-400 sm:inline">alle mededelingen</span>
      </div>
      <MededelingenFeed scrollClass="h-[72vh]" />
    </Card>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Mededelingen</h2>
        <p className="text-sm text-ink-500">
          {isLeiding
            ? "Stuur links een melding naar het team; rechts zie je in de chat alles langskomen."
            : "Alle mededelingen van de beheerder voor het team."}
        </p>
      </div>

      {isLeiding ? (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-5 py-3.5">
              <Megaphone className="h-5 w-5 text-brand-600" />
              <h3 className="text-sm font-bold text-ink-900">Nieuwe melding</h3>
              <span className="hidden text-xs text-ink-400 sm:inline">voor het team of één persoon</span>
            </div>
            <MededelingComposer className="p-4" />
          </Card>
          {chat}
        </div>
      ) : (
        <div className="mx-auto max-w-2xl">{chat}</div>
      )}
    </div>
  );
}
