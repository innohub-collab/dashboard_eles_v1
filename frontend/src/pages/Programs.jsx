import { useState } from "react";
import { useData } from "@/context/DataContext";
import { isProgram, isNamedProgram, isInnovationLab, programName, PROGRAM_TAGS, computeSummary, statusBreakdown, monthlyTrend, recordsForMonthlyTrend } from "@/lib/kpi";
import KPICard from "@/components/KPICard";
import StatusDonut from "@/components/charts/StatusDonut";
import TrendChart from "@/components/charts/TrendChart";
import { Sparkles, Trophy, Clock, CheckCircle2, XCircle, FlaskConical, Layers } from "lucide-react";
import { StatusBadge, OutcomeBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/format";

export default function Programs() {
  const { filtered, setSelectedId } = useData();
  const programRecords = filtered.filter(isProgram);
  const namedRecords = filtered.filter(isNamedProgram);
  const innovationLabRecords = filtered.filter(isInnovationLab);
  const s = computeSummary(programRecords);
  const status = statusBreakdown(programRecords);
  const trendRecords = recordsForMonthlyTrend(programRecords);
  const trend = monthlyTrend(trendRecords);

  // Split by program name
  const byProgram = {};
  for (const p of PROGRAM_TAGS) byProgram[p] = [];
  for (const r of namedRecords) {
    const p = programName(r);
    if (p && byProgram[p]) byProgram[p].push(r);
  }
  const other = innovationLabRecords;

  return (
    <div className="pt-6 space-y-6" data-testid="programs-page">
      <div>
        <h2 className="font-display text-2xl font-semibold text-forest-950">Programok</h2>
        <p className="text-sm text-forest-700/70 mt-1">
          Nevesített programok: VIP, Mentor, Futurebet, Futurebet2.0, InnoChallenge · InnovationLab: Innováció típusú, nem Programok kategóriájú ötletek
        </p>
      </div>

      {/* Split highlight */}
      <div className="rounded-3xl overflow-hidden border border-lime-900/10 shadow-soft-lg" data-testid="split-highlight">
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="panel-dark relative p-6">
            <div className="grain absolute inset-0 opacity-25" />
            <div className="relative z-10 flex items-start justify-between gap-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-lime-200/80 font-semibold flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} /> Nevesített programok
                </div>
                <div className="mt-2 font-display text-5xl md:text-6xl font-semibold text-white leading-none tracking-tight">
                  {namedRecords.length}
                </div>
                <p className="text-xs text-lime-200/80 mt-2 max-w-xs">
                  VIP · Mentor · Futurebet · Futurebet2.0 · InnoChallenge címkékkel jelölt ötletek
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.16em] text-lime-300/70">összes ötlet</div>
                <div className="font-display text-2xl text-white font-semibold">{programRecords.length}</div>
              </div>
            </div>
          </div>
          <div className="bg-lime-50 p-6 relative">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-forest-800/70 font-semibold flex items-center gap-2">
                  <FlaskConical className="w-3.5 h-3.5" strokeWidth={1.75} /> InnovationLab
                </div>
                <div className="mt-2 font-display text-5xl md:text-6xl font-semibold text-forest-950 leading-none tracking-tight">
                  {innovationLabRecords.length}
                </div>
                <p className="text-xs text-forest-700/80 mt-2 max-w-xs">
                  Feladattípusuk Innováció, Customer Request Type értékük pedig nem Programok
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.16em] text-forest-700/70">arány</div>
                <div className="font-display text-2xl text-forest-950 font-semibold">
                  {programRecords.length ? `${Math.round((innovationLabRecords.length / programRecords.length) * 100)}%` : "0%"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
        <KPICard label="Ötletek összesen" value={s.total} icon={Layers} testid="prog-kpi-total" />
        <KPICard label="Nyitott" value={s.open} icon={Clock} testid="prog-kpi-open" />
        <KPICard label="Megvalósítva" value={s.done} icon={CheckCircle2} testid="prog-kpi-done" />
        <KPICard label="Elutasítva" value={s.rejected} icon={XCircle} testid="prog-kpi-rejected" hint={s.total ? `${((s.rejected / s.total) * 100).toFixed(1)}% arány` : undefined} />
        <KPICard label="Jóváhagyási arány" value={s.approvalRate.toFixed(1)} suffix="%" icon={Trophy} testid="prog-kpi-approval" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2"><TrendChart data={trend} total={trendRecords.length} /></div>
        <StatusDonut data={status} />
      </div>

      <div>
        <h3 className="font-display text-lg font-semibold text-forest-950 mb-4">Nevesített programok</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {PROGRAM_TAGS.map((p) => (
            <ProgramCard key={p} name={p} items={byProgram[p]} onOpen={setSelectedId} />
          ))}
        </div>
      </div>

      {other.length > 0 && (
        <div>
          <h3 className="font-display text-lg font-semibold text-forest-950 mb-4 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-forest-800" strokeWidth={1.75} />
            InnovationLab ötletek
            <span className="text-xs font-medium text-forest-700/70">({other.length} db)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <ProgramCard name="InnovationLab" items={other} onOpen={setSelectedId} variant="innolab" />
          </div>
        </div>
      )}
    </div>
  );
}

export function ProgramCard({ name, items, onOpen, variant = "program" }) {
  const [activeOutcome, setActiveOutcome] = useState(null);
  const done = items.filter((r) => r.outcome === "Megvalósítva").length;
  const open = items.filter((r) => r.outcome === "Nyitott").length;
  const rejected = items.filter((r) => r.outcome === "Elutasítva").length;
  const visibleItems = activeOutcome
    ? items.filter((r) => r.outcome === activeOutcome)
    : items;
  const chips = [
    {
      outcome: "Megvalósítva",
      count: done,
      label: "megvalósítva",
      className: "bg-lime-400/20 text-lime-100 border-lime-400/40",
    },
    {
      outcome: "Nyitott",
      count: open,
      label: "nyitott",
      className: "bg-amber-400/15 text-amber-100 border-amber-400/40",
    },
    {
      outcome: "Elutasítva",
      count: rejected,
      label: "elutasítva",
      className: "bg-red-500/20 text-red-100 border-red-400/40",
    },
  ];

  return (
    <div className="h-[520px] flex flex-col rounded-3xl bg-white border border-forest-200/70 shadow-soft-lg overflow-hidden" data-testid={`program-card-${name}`}>
      <div className="p-5 panel-dark relative shrink-0">
        <div className="grain absolute inset-0 opacity-30" />
        <div className="relative z-10 flex items-baseline justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-lime-200/80 font-semibold">
              {variant === "innolab" ? "Kategória" : "Program"}
            </div>
            <h3 className="font-display text-xl text-white font-semibold mt-0.5">{name}</h3>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl text-white font-semibold">{items.length}</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-lime-200/70">ötlet</div>
          </div>
        </div>
        <div className="relative z-10 mt-3 flex flex-wrap gap-2 text-[11px]" data-testid={`program-chips-${name}`}>
          {chips.map((chip) => {
            const isActive = activeOutcome === chip.outcome;
            return (
              <button
                key={chip.outcome}
                type="button"
                aria-pressed={isActive}
                aria-label={`${name}: ${chip.count} ${chip.label} ötlet megjelenítése`}
                data-testid={`program-chip-${name}-${chip.outcome}`}
                onClick={() => setActiveOutcome((current) => current === chip.outcome ? null : chip.outcome)}
                className={`px-2 py-0.5 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${chip.className} ${
                  isActive ? "ring-2 ring-white/90" : "hover:brightness-125"
                }`}
              >
                {chip.count} {chip.label}
              </button>
            );
          })}
        </div>
      </div>
      <ul
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-forest-200/60 [scrollbar-gutter:stable]"
        aria-label={`${name} ötletei`}
        aria-live="polite"
        data-testid={`program-items-${name}`}
        tabIndex={visibleItems.length > 6 ? 0 : undefined}
      >
        {items.length === 0 && (
          <li className="px-5 py-8 text-center text-xs text-forest-700/60">Nincs bejegyzés ebben a programban.</li>
        )}
        {items.length > 0 && visibleItems.length === 0 && (
          <li className="px-5 py-8 text-center text-xs text-forest-700/60">
            Nincs {activeOutcome?.toLowerCase()} ötlet ebben a programban.
          </li>
        )}
        {visibleItems.map((r) => (
          <li
            key={r.id}
            className="px-5 py-3 hover:bg-forest-50 cursor-pointer"
            onClick={() => onOpen(r.id)}
            data-testid={`program-item-${r.id}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-forest-950 truncate">{r.cim}</span>
              <span className="text-[10px] text-forest-700/60 flex-shrink-0">{fmtDate(r.letrehozva)}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <StatusBadge status={r.allapot} />
              <OutcomeBadge outcome={r.outcome} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
