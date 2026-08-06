import { useData } from "@/context/DataContext";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PROGRAM_TAGS } from "@/lib/kpi";

const feladatChips = [
  { id: "osszes", label: "Összes" },
  { id: "Innováció", label: "Innováció (új ötletek)" },
  { id: "Feladat", label: "Feladat (régi)" },
];

const periods = [
  { id: "all", label: "Teljes időszak" },
  { id: "3m", label: "Utolsó 3 hónap" },
  { id: "6m", label: "Utolsó 6 hónap" },
  { id: "12m", label: "Utolsó 12 hónap" },
];

export default function FilterBar() {
  const { filters, setFilter, resetFilters, options, activeFilterChips } = useData();

  return (
    <div data-testid="filter-bar" className="px-6 md:px-10 pt-6">
      <div className="rounded-2xl bg-white/70 backdrop-blur border border-lime-900/10 shadow-soft-lg">
        <div className="p-5 flex flex-col gap-4">
          {/* Row 1: Feladattípus chips + search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 pr-4 border-r border-lime-900/10 mr-1">
              <SlidersHorizontal className="w-4 h-4 text-forest-800" strokeWidth={1.75} />
              <span className="text-[11px] uppercase tracking-[0.16em] font-semibold text-forest-800/70">
                Feladat típus
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {feladatChips.map((c) => {
                const active = filters.feladattipus === c.id;
                return (
                  <button
                    key={c.id}
                    data-testid={`chip-feladattipus-${c.id}`}
                    onClick={() => setFilter("feladattipus", c.id)}
                    className={`px-4 py-2 text-sm font-medium rounded-full border transition-colors duration-200 ${
                      active
                        ? "bg-forest-950 text-lime-50 border-forest-950 shadow-mint-glow"
                        : "bg-white text-forest-900 border-lime-900/15 hover:border-lime-700/40"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-w-[200px]" />
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forest-700/60" strokeWidth={1.75} />
              <Input
                data-testid="search-input"
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                placeholder="Keresés ötletek között…"
                className="pl-9 h-10 rounded-full bg-white border-lime-900/15 focus-visible:ring-lime-500/40"
              />
            </div>
          </div>

          {/* Row 2: Dropdowns */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <SelectFilter label="Állapot" value={filters.allapot} onChange={(v) => setFilter("allapot", v)} testid="filter-allapot" options={options.allapot} />
            <SelectFilter label="Kategória" value={filters.kategoria} onChange={(v) => setFilter("kategoria", v)} testid="filter-kategoria" options={options.kategoria} />
            <SelectFilter label="Igazgatóság" value={filters.igazgatosag} onChange={(v) => setFilter("igazgatosag", v)} testid="filter-igazgatosag" options={options.igazgatosag} />
            <SelectFilter label="Bejelentő" value={filters.bejelento} onChange={(v) => setFilter("bejelento", v)} testid="filter-bejelento" options={options.bejelento} />
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-[0.16em] font-semibold text-forest-800/70 px-1">Program</label>
              <Select value={filters.program} onValueChange={(v) => setFilter("program", v)}>
                <SelectTrigger data-testid="filter-program" className="h-10 rounded-xl bg-white border-lime-900/15">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Összes</SelectItem>
                  <SelectItem value="any">Bármelyik program</SelectItem>
                  <SelectItem value="InnovationLab">InnovationLab</SelectItem>
                  {PROGRAM_TAGS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-[0.16em] font-semibold text-forest-800/70 px-1">Időszak</label>
              <Select value={filters.period} onValueChange={(v) => setFilter("period", v)}>
                <SelectTrigger data-testid="filter-period" className="h-10 rounded-xl bg-white border-lime-900/15">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active chips */}
          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] uppercase tracking-[0.16em] font-semibold text-forest-800/60">
                Aktív szűrők
              </span>
              {activeFilterChips.map((c) => (
                <span
                  key={c.key}
                  data-testid={`active-chip-${c.key}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-lime-100 text-forest-950 text-xs font-medium border border-lime-200"
                >
                  {c.label}
                  <button
                    onClick={() => setFilter(c.key, c.key === "search" ? "" : c.key === "feladattipus" ? "osszes" : "all")}
                    className="hover:text-red-600"
                    aria-label="Törlés"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <Button
                data-testid="clear-filters"
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-xs text-forest-700 hover:text-forest-950 rounded-full"
              >
                Összes törlése
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectFilter({ label, value, onChange, options, testid }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-[0.16em] font-semibold text-forest-800/70 px-1">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testid} className="h-10 rounded-xl bg-white border-lime-900/15">
          <SelectValue placeholder="Összes" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="all">Összes</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
