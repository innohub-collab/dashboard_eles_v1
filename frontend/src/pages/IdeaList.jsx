import { useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { StatusBadge, OutcomeBadge, PriorityBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/format";
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;

const columns = [
  { key: "id", label: "Azonosító", width: "w-[120px]" },
  { key: "cim", label: "Cím / Összefoglaló", width: "min-w-[280px]" },
  { key: "feladattipus", label: "Típus", width: "w-[110px]" },
  { key: "allapot", label: "Állapot", width: "w-[160px]" },
  { key: "outcome", label: "Kimenet", width: "w-[130px]" },
  { key: "bejelento", label: "Bejelentő", width: "w-[160px]" },
  { key: "prioritas", label: "Prioritás", width: "w-[110px]" },
  { key: "letrehozva", label: "Létrehozva", width: "w-[130px]" },
];

export default function IdeaList() {
  const { filtered, setSelectedId } = useData();
  const [sort, setSort] = useState({ key: "letrehozva", dir: "desc" });
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const va = a[key] ?? "";
      const vb = b[key] ?? "";
      if (va < vb) return dir === "asc" ? -1 : 1;
      if (va > vb) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const rows = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  return (
    <div className="pt-6 space-y-4" data-testid="idea-list">
      <div className="rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg overflow-hidden">
        <div className="p-6 border-b border-lime-900/10 flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-forest-950">Ötletek részletes listája</h2>
            <p className="text-xs text-forest-700/70">{sorted.length} rekord a jelenlegi szűrés alapján</p>
          </div>
          <div className="text-xs text-forest-700/60">
            Oldal {currentPage + 1} / {totalPages}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-forest-700/70 bg-forest-50/60">
                {columns.map((c) => (
                  <th key={c.key} className={`px-6 py-3 font-semibold ${c.width}`}>
                    <button
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-forest-950"
                      data-testid={`sort-${c.key}`}
                    >
                      {c.label}
                      <ArrowUpDown className="w-3 h-3 opacity-50" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  data-testid={`row-${r.id}`}
                  onClick={() => setSelectedId(r.id)}
                  className="cursor-pointer border-t border-lime-900/5 hover:bg-lime-50/40 transition-colors"
                >
                  <td className="px-6 py-4 font-mono text-[11px] text-forest-700">{r.id}</td>
                  <td className="px-6 py-4 max-w-[360px]">
                    <div className="font-medium text-forest-950 truncate">{r.cim}</div>
                    <div className="text-[11px] text-forest-700/60 truncate">{r.customer_request_type}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold ${r.feladattipus === "Innováció" ? "text-lime-700" : "text-blue-700"}`}>
                      {r.feladattipus}
                    </span>
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={r.allapot} /></td>
                  <td className="px-6 py-4"><OutcomeBadge outcome={r.outcome} /></td>
                  <td className="px-6 py-4 text-forest-900 truncate max-w-[160px]">{r.bejelento}</td>
                  <td className="px-6 py-4"><PriorityBadge priority={r.prioritas} /></td>
                  <td className="px-6 py-4 text-forest-700/80 text-[13px]">{fmtDate(r.letrehozva)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-16 text-center text-forest-700/60">
                    Nincs a szűrésnek megfelelő ötlet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-lime-900/10 flex items-center justify-end gap-2">
          <Button
            data-testid="prev-page"
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-full border-lime-900/15"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Előző
          </Button>
          <Button
            data-testid="next-page"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="rounded-full border-lime-900/15"
          >
            Következő <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
