import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, CheckCircle2, Database, ListOrdered, Sparkles } from "lucide-react";

const COLORS = ["#33691E", "#6FA82F", "#8BC34A", "#A3D65C", "#CDDC39", "#3F6E18", "#588D22"];

export default function AIDashboardReport({ report }) {
  const rows = report.rows || [];
  const charts = (report.visualizations || []).filter(
    (item) => !["kpi", "table", "summary"].includes(item.type),
  );

  return (
    <div className="p-5 md:p-7 space-y-6" data-testid="ai-dashboard-report">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold text-forest-700/60">
            <Sparkles className="w-3.5 h-3.5" /> AI által tervezett · adatokból számított
          </div>
          <h2 className="font-display text-2xl font-semibold text-forest-950 mt-1">{report.title}</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-forest-700/70">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-50 border border-lime-200 px-3 py-1.5">
            <Database className="w-3 h-3" /> {report.filteredRecordCount} rekord
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-50 border border-lime-200 px-3 py-1.5">
            <CheckCircle2 className="w-3 h-3" /> validált terv
          </span>
        </div>
      </div>

      {report.summary && (
        <div className="rounded-2xl panel-dark relative overflow-hidden px-5 py-4">
          <div className="grain absolute inset-0 opacity-25" />
          <div className="relative z-10 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-lime-300 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-lime-300/80 font-semibold">Összefoglaló</div>
              <p className="text-sm text-lime-50 mt-1 leading-relaxed">{report.summary}</p>
            </div>
          </div>
        </div>
      )}

      {(report.kpis || []).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {report.kpis.map((kpi, index) => (
            <div key={kpi.label + "-" + index} className="rounded-2xl bg-white border border-lime-900/10 shadow-soft-lg p-5">
              <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-forest-700/60">{kpi.label}</div>
              <div className="font-display text-4xl font-semibold text-forest-950 mt-3">{formatValue(kpi.value)}</div>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-lime-300 bg-lime-50/60 px-6 py-12 text-center text-sm text-forest-700">
          Nincs a feltételeknek megfelelő adat.
        </div>
      ) : (
        <>
          {charts.map((visualization, index) => (
            <DynamicVisualization
              key={visualization.type + "-" + visualization.title + "-" + index}
              visualization={visualization}
              rows={rows}
            />
          ))}
          <DataTable report={report} />
        </>
      )}
    </div>
  );
}

function DynamicVisualization({ visualization, rows }) {
  if (visualization.type === "ranking") {
    return <Ranking visualization={visualization} rows={rows} />;
  }
  if (["pie", "donut"].includes(visualization.type)) {
    return <PieVisualization visualization={visualization} rows={rows} />;
  }
  if (visualization.type === "line") {
    return <LineVisualization visualization={visualization} rows={rows} />;
  }
  return <BarVisualization visualization={visualization} rows={rows} />;
}

function ChartShell({ title, children, icon: Icon = BarChart3 }) {
  return (
    <div className="rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg p-5 md:p-6">
      <div className="flex items-center gap-2 mb-5">
        <Icon className="w-4 h-4 text-forest-800" strokeWidth={1.75} />
        <h3 className="font-display text-lg font-semibold text-forest-950">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function BarVisualization({ visualization, rows }) {
  const horizontal = visualization.type === "bar";
  const data = rows.slice(0, 20);
  return (
    <ChartShell title={visualization.title}>
      <div className="h-[330px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 8, right: 20, bottom: horizontal ? 8 : 50, left: horizontal ? 50 : 0 }}
          >
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(51,105,30,0.12)" />
            {horizontal ? (
              <>
                <XAxis type="number" tick={{ fontSize: 11, fill: "#3F6E18" }} />
                <YAxis type="category" dataKey={visualization.categoryField} width={115} tick={{ fontSize: 10, fill: "#1B3A0C" }} />
              </>
            ) : (
              <>
                <XAxis dataKey={visualization.categoryField} angle={-28} textAnchor="end" height={70} tick={{ fontSize: 10, fill: "#1B3A0C" }} />
                <YAxis tick={{ fontSize: 11, fill: "#3F6E18" }} />
              </>
            )}
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey={visualization.valueField} fill="#6FA82F" radius={[7, 7, 3, 3]}>
              {data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

function LineVisualization({ visualization, rows }) {
  return (
    <ChartShell title={visualization.title}>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows.slice(0, 40)} margin={{ top: 8, right: 20, bottom: 40, left: 0 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(51,105,30,0.12)" />
            <XAxis dataKey={visualization.categoryField} angle={-25} textAnchor="end" height={60} tick={{ fontSize: 10, fill: "#1B3A0C" }} />
            <YAxis tick={{ fontSize: 11, fill: "#3F6E18" }} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey={visualization.valueField} stroke="#33691E" strokeWidth={2.5} dot={{ r: 3, fill: "#8BC34A" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

function PieVisualization({ visualization, rows }) {
  const data = rows.slice(0, 12);
  return (
    <ChartShell title={visualization.title}>
      <div className="h-[330px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={visualization.valueField}
              nameKey={visualization.categoryField}
              innerRadius={visualization.type === "donut" ? 72 : 0}
              outerRadius={112}
              paddingAngle={visualization.type === "donut" ? 2 : 0}
            >
              {data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

function Ranking({ visualization, rows }) {
  const max = Math.max(...rows.map((row) => Number(row[visualization.valueField]) || 0), 1);
  return (
    <ChartShell title={visualization.title} icon={ListOrdered}>
      <div className="space-y-3">
        {rows.slice(0, 15).map((row, index) => {
          const value = Number(row[visualization.valueField]) || 0;
          const width = Math.max((value / max) * 100, 2) + "%";
          return (
            <div key={index} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3">
              <div className="font-display text-sm font-semibold text-forest-700">{index + 1}.</div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-forest-950 truncate">{formatValue(row[visualization.categoryField])}</div>
                <div className="h-1.5 rounded-full bg-lime-100 mt-1.5 overflow-hidden">
                  <div className="h-full rounded-full bg-forest-700" style={{ width }} />
                </div>
              </div>
              <div className="font-display text-sm font-semibold text-forest-950">{formatValue(row[visualization.valueField])}</div>
            </div>
          );
        })}
      </div>
    </ChartShell>
  );
}

function DataTable({ report }) {
  return (
    <div className="rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg overflow-hidden" data-testid="ai-dashboard-table">
      <div className="px-5 py-4 border-b border-lime-900/10 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-forest-950">Részletes adatok</h3>
          <p className="text-xs text-forest-700/60">Ugyanabból a backend-eredményből</p>
        </div>
        <span className="text-xs text-forest-700/60">
          {report.rows.length + "/" + report.totalRows + " sor" + (report.truncated ? " · korlátozott nézet" : "")}
        </span>
      </div>
      <div className="overflow-auto max-h-[460px]">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="sticky top-0 bg-forest-50 z-10">
            <tr>
              {report.columns.map((column) => (
                <th key={column.key} className="px-4 py-3 uppercase tracking-[0.12em] text-[10px] font-semibold text-forest-700 border-b border-lime-200">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-lime-900/8">
            {report.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-lime-50/60">
                {report.columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 text-forest-900 align-top max-w-[320px]">
                    <span className="line-clamp-3">{formatValue(row[column.key])}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-xl bg-forest-950 border border-lime-800/40 shadow-panel-deep px-3 py-2 text-xs text-lime-50">
      <div className="font-semibold">{formatValue(label ?? item.name)}</div>
      <div className="text-lime-200 mt-0.5">{item.dataKey + ": " + formatValue(item.value)}</div>
    </div>
  );
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "number") {
    return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(value);
  }
  return String(value);
}
