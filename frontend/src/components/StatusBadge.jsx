import { STATUS_COLORS, OUTCOME_COLORS } from "@/lib/kpi";

export function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || "#22C55E";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
      style={{ background: `${color}18`, color, borderColor: `${color}40` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {status || "—"}
    </span>
  );
}

export function OutcomeBadge({ outcome }) {
  const color = OUTCOME_COLORS[outcome] || "#22C55E";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: `${color}20`, color }}
    >
      {outcome}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const map = {
    Legmagasabb: "bg-red-100 text-red-700 border-red-200",
    Magas: "bg-orange-100 text-orange-700 border-orange-200",
    Közepes: "bg-amber-100 text-amber-800 border-amber-200",
    Alacsony: "bg-slate-100 text-slate-700 border-slate-200",
  };
  const cls = map[priority] || "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${cls}`}>
      {priority || "—"}
    </span>
  );
}
