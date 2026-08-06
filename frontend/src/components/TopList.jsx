import { Users } from "lucide-react";

export default function TopList({ title, subtitle, items, total, icon: Icon = Users, testid }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg p-6" data-testid={testid}>
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h3 className="font-display text-lg font-semibold text-forest-950">{title}</h3>
          {subtitle && <p className="text-xs text-forest-700/70">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs text-forest-700/60">
          {total !== undefined && <span>Összesen: {total}</span>}
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </div>
      </div>
      <ul className="space-y-3">
        {items.length === 0 && (
          <li className="text-sm text-forest-700/60">Nincs elérhető adat.</li>
        )}
        {items.map((i, idx) => (
          <li key={i.name} className="flex items-center gap-3" data-testid={`toplist-item-${idx}`}>
            <span className="w-6 text-center font-display text-sm font-semibold text-forest-700/70">{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-forest-950 truncate">{i.name}</span>
                <span className="font-display font-semibold text-forest-950">{i.value}</span>
              </div>
              <div className="h-1.5 mt-1.5 rounded-full bg-lime-50 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(i.value / max) * 100}%`,
                    background: "linear-gradient(90deg, #33691E 0%, #A3D65C 100%)",
                  }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
