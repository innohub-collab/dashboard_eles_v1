import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { STATUS_COLORS } from "@/lib/kpi";
import { useData } from "@/context/DataContext";

// Show percentage label on each slice (only when >= 4% so tiny slices stay clean)
const renderPercentLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 12, fontWeight: 700, fontFamily: "Outfit", letterSpacing: "-0.01em" }}
      pointerEvents="none"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function StatusDonut({ data }) {
  const { setFilter } = useData();
  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <div className="rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg p-6" data-testid="status-donut">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-forest-950">Státusz megoszlás</h3>
          <p className="text-xs text-forest-700/70">Kattints egy szeletre a szűréshez</p>
        </div>
        <span className="text-xs text-forest-700/60">{total} ötlet</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-center">
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={58}
                outerRadius={98}
                paddingAngle={2}
                strokeWidth={0}
                label={renderPercentLabel}
                labelLine={false}
                onClick={(e) => e?.name && setFilter("allapot", e.name)}
              >
                {data.map((d) => (
                  <Cell
                    key={d.name}
                    fill={STATUS_COLORS[d.name] || "#22C55E"}
                    className="cursor-pointer transition-opacity hover:opacity-80"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-2">
          {data.map((d) => (
            <li
              key={d.name}
              onClick={() => setFilter("allapot", d.name)}
              className="flex items-center justify-between gap-3 cursor-pointer group px-2 py-1.5 rounded-lg hover:bg-forest-50"
              data-testid={`status-item-${d.name}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: STATUS_COLORS[d.name] || "#22C55E" }}
                />
                <span className="text-sm text-forest-900 truncate">{d.name}</span>
              </div>
              <div className="flex items-baseline gap-2 flex-shrink-0">
                <span className="font-display font-semibold text-forest-950">{d.value}</span>
                <span className="text-[11px] text-forest-700/60 w-10 text-right">
                  {((d.value / total) * 100).toFixed(0)}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-forest-950 text-lime-50 text-xs px-3 py-2 rounded-xl shadow-panel-deep border border-lime-800/40">
      <div className="font-semibold">{d.name}</div>
      <div>{d.value} db · {((d.value / total) * 100).toFixed(1)}%</div>
    </div>
  );
}
