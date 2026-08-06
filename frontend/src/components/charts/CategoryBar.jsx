import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, LabelList } from "recharts";
import { useData } from "@/context/DataContext";

// Renders the numeric count with adaptive positioning:
//  - If the bar is wide enough (>= 48px), draw the count INSIDE (right-aligned, white)
//  - Otherwise draw it OUTSIDE the bar tip in dark forest colour so it's always readable.
const renderCountLabel = (max) => (props) => {
  const { x, y, width, height, value } = props;
  if (value === undefined || value === null) return null;
  const INSIDE_THRESHOLD = 48; // px
  if (width >= INSIDE_THRESHOLD) {
    return (
      <text
        x={x + width - 10}
        y={y + height / 2}
        fill="#ffffff"
        textAnchor="end"
        dominantBaseline="central"
        style={{ fontSize: 12, fontWeight: 700, fontFamily: "Outfit" }}
      >
        {value}
      </text>
    );
  }
  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      fill="#052E16"
      textAnchor="start"
      dominantBaseline="central"
      style={{ fontSize: 12, fontWeight: 700, fontFamily: "Outfit" }}
    >
      {value}
    </text>
  );
};

export default function CategoryBar({ data }) {
  const { setFilter } = useData();
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const chartHeight = Math.max(320, data.length * 38);

  return (
    <div className="rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg p-6" data-testid="category-bar">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-forest-950">Kategóriák</h3>
          <p className="text-xs text-forest-700/70">Ötletek típusonként</p>
        </div>
        <span className="text-xs text-forest-700/60">{data.length} kategória · összesen {total} ötlet</span>
      </div>
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 4 }}>
            <XAxis type="number" hide domain={[0, max * 1.05]} />
            <YAxis
              type="category"
              dataKey="name"
              width={160}
              tick={{ fill: "#052E16", fontSize: 12, fontFamily: "Manrope", fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v.length > 22 ? v.slice(0, 20) + "…" : v)}
            />
            <Tooltip
              cursor={{ fill: "rgba(16,185,129,0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-forest-950 text-lime-50 text-xs px-3 py-2 rounded-xl shadow-panel-deep border border-lime-800/40">
                    <div className="font-semibold max-w-[240px]">{d.name}</div>
                    <div>{d.value} ötlet</div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              radius={[6, 6, 6, 6]}
              onClick={(e) => e?.name && setFilter("kategoria", e.name)}
              className="cursor-pointer"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={`url(#catGrad${i % 3})`} />
              ))}
              <LabelList dataKey="value" content={renderCountLabel(max)} />
            </Bar>
            <defs>
              <linearGradient id="catGrad0" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#33691E" />
                <stop offset="100%" stopColor="#8BC34A" />
              </linearGradient>
              <linearGradient id="catGrad1" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3F6E18" />
                <stop offset="100%" stopColor="#A3D65C" />
              </linearGradient>
              <linearGradient id="catGrad2" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#588D22" />
                <stop offset="100%" stopColor="#CDDC39" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
