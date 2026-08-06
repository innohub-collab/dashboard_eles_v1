import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListChecks, Sparkles, Trophy, Settings2, Leaf, ChartNoAxesCombined, ListOrdered } from "lucide-react";

const nav = [
  { to: "/", label: "Összefoglaló", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/lista", label: "Ötletek listája", icon: ListChecks, testid: "nav-list" },
  { to: "/programok", label: "Programok", icon: Sparkles, testid: "nav-programs" },
  { to: "/toplistak", label: "Toplisták", icon: Trophy, testid: "nav-toplists" },
  { to: "/rangsor", label: "Rangsor", icon: ListOrdered, testid: "nav-ranking" },
  { to: "/ai-dashboard", label: "AI Dashboard", icon: ChartNoAxesCombined, testid: "nav-ai-dashboard" },
  { to: "/beallitasok", label: "Beállítások", icon: Settings2, testid: "nav-settings" },
];

export default function Sidebar() {
  return (
    <aside
      data-testid="sidebar"
      className="relative hidden md:flex w-[264px] flex-shrink-0 flex-col panel-dark rounded-none"
    >
      <div className="grain absolute inset-0 opacity-40 pointer-events-none" />
      <div className="relative z-10 px-6 pt-8 pb-6 border-b border-lime-800/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-lime-400/20 border border-lime-300/40 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-lime-300" strokeWidth={1.75} />
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-lime-50 leading-tight">InnoLab</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-lime-300/80">Ötlet dashboard</div>
          </div>
        </div>
      </div>
      <nav className="relative z-10 flex-1 px-3 py-6 space-y-1">
        {nav.map(({ to, label, icon: Icon, testid }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            data-testid={testid}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${
                isActive
                  ? "bg-lime-400/20 text-lime-50 shadow-inner"
                  : "text-lime-200/80 hover:bg-lime-800/40 hover:text-lime-50"
              }`
            }
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.6} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="relative z-10 px-6 py-5 border-t border-lime-800/40 text-[11px] text-lime-300/70">
        <div className="font-display text-lime-50 text-sm mb-1">Executive Insight</div>
        <p className="leading-relaxed">Prémium ötletmenedzsment és vezetői döntéstámogatás.</p>
      </div>
    </aside>
  );
}
