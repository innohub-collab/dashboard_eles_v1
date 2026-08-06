import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, LabelList } from "recharts";
import { monthLabel } from "@/lib/format";

// Renders "+42%" / "-18%" chip above each data point, coloured green/red.
// Hidden for first point (no previous month) or when delta is null.
const renderDeltaLabel = (props) => {
  const { x, y, value, index, viewBox } = props;
  if (index === 0 || value === null || value === undefined) return null;
  const positive = value >= 0;
  const text = `${positive ? "+" : ""}${value}%`;
  const w = text.length * 7 + 10;
  // Position above the point but keep in-frame
  const chipY = Math.max(y - 22, 6);
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        x={x - w / 2}
        y={chipY}
        width={w}
        height={16}
        rx={8}
        ry={8}
        fill={positive ? "rgba(139,195,74,0.20)" : "rgba(239,68,68,0.16)"}
        stroke={positive ? "rgba(111,168,47,0.60)" : "rgba(239,68,68,0.55)"}
        strokeWidth={1}
      />
      <text
        x={x}
        y={chipY + 11}
        textAnchor="middle"
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          fontFamily: "Outfit",
          fill: positive ? "#3F6E18" : "#B91C1C",
          letterSpacing: "-0.01em",
        }}
      >
        {text}
      </text>
    </g>
  );
};

export default function TrendChart({ data, total, title = "Havi beérkezési trend", subtitle = "Új ötletek és igények havi eloszlása (előző hónaphoz képest)" }) {
  const overallTotal = total ?? data.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg p-6" data-testid="trend-chart">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-forest-950">{title}</h3>
          <p className="text-xs text-forest-700/70">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-forest-700/70">
          <span>Összesen: {overallTotal}</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-lime-500" /> növekedés
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" /> csökkenés
          </span>
        </div>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 28, right: 16, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8BC34A" stopOpacity={0.65} />
                <stop offset="100%" stopColor="#8BC34A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(51,105,30,0.15)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: "#052E16", fontSize: 12, fontWeight: 500, fontFamily: "Manrope" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={monthLabel}
              tickMargin={8}
            />
            <YAxis
              tick={{ fill: "#052E16", fontSize: 12, fontWeight: 600, fontFamily: "Manrope" }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              tickMargin={4}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                const deltaTxt =
                  d.delta === null || d.delta === undefined
                    ? "—"
                    : `${d.delta >= 0 ? "+" : ""}${d.delta}% az előző hónaphoz`;
                const deltaColor =
                  d.delta === null || d.delta === undefined
                    ? "#A7F3D0"
                    : d.delta >= 0
                    ? "#BBF7A0"
                    : "#FCA5A5";
                return (
                  <div className="bg-forest-950 text-lime-50 text-xs px-3 py-2 rounded-xl shadow-panel-deep border border-lime-800/40">
                    <div className="font-semibold">{monthLabel(d.month)}</div>
                    <div>{d.count} új ötlet</div>
                    <div style={{ color: deltaColor }}>{deltaTxt}</div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#33691E"
              strokeWidth={2.4}
              fill="url(#trendFill)"
              dot={{ r: 3, stroke: "#33691E", strokeWidth: 2, fill: "#ffffff" }}
              activeDot={{ r: 5, stroke: "#33691E", strokeWidth: 2, fill: "#8BC34A" }}
            >
              <LabelList dataKey="delta" content={renderDeltaLabel} />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
