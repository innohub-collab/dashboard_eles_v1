import { OUTCOME_COLORS } from "@/lib/kpi";
import { fmtNumber } from "@/lib/format";

export default function OutcomeFunnel({ data, total }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg p-6" data-testid="outcome-funnel">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-forest-950">Életciklus – kimenet</h3>
          <p className="text-xs text-forest-700/70">Ötletek megoszlása üzleti eredmény szerint</p>
        </div>
        <span className="text-xs text-forest-700/60">{total} ötlet</span>
      </div>
      <div className="space-y-4">
        {data.map((d, i) => (
          <div key={d.name} data-testid={`funnel-row-${d.name}`}>
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: OUTCOME_COLORS[d.name] }} />
                <span className="text-sm font-medium text-forest-900">{d.name}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display font-semibold text-forest-950">{fmtNumber(d.value)}</span>
                <span className="text-[11px] text-forest-700/60">
                  {((d.value / total) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-lime-50 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${(d.value / max) * 100}%`,
                  background: `linear-gradient(90deg, ${OUTCOME_COLORS[d.name]} 0%, ${OUTCOME_COLORS[d.name]}bb 100%)`,
                  animationDelay: `${i * 80}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
