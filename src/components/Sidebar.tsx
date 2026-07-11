import { memo, useMemo } from "react";
import { LogOut } from "lucide-react";
import { NAV, GROUPS, magZien } from "../lib/nav";
import { ROL_LABEL, type User } from "../lib/types";

export const Sidebar = memo(function Sidebar({
  active,
  onSelect,
  currentUser,
  onLogout,
}: {
  active: string;
  onSelect: (key: string) => void;
  currentUser: User | null;
  onLogout: () => void;
}) {
  const items = useMemo(() => (currentUser ? NAV.filter((n) => magZien(currentUser, n)) : []), [currentUser]);
  const groups = useMemo(() => GROUPS.filter((g) => items.some((i) => i.group === g)), [items]);
  if (!currentUser) return null;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-ink-600">
      <button type="button" onClick={() => onSelect("home")} title="Naar het startscherm" className="flex items-center justify-center px-5 py-5 transition-opacity hover:opacity-80">
        <img src="/wire-logo.png" alt="Wire Solutions — startscherm" className="h-16 w-auto" />
      </button>

      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {groups.map((group) => (
          <div key={group}>
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              {group}
            </div>
            <div className="space-y-0.5">
              {items
                .filter((n) => n.group === group)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = active === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => onSelect(item.key)}
                      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-brand-600 text-white shadow-sm"
                          : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            isActive
                              ? "bg-white/25 text-white"
                              : "bg-ink-100 text-ink-500 group-hover:bg-ink-200"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
            {currentUser.initialen}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium text-ink-900">{currentUser.naam}</div>
            <div className="truncate text-[11px] text-ink-400">{ROL_LABEL[currentUser.rol]}</div>
          </div>
          <button
            onClick={onLogout}
            title="Uitloggen"
            className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );
});
