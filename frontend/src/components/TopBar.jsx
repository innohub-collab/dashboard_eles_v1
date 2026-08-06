import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useData } from "@/context/DataContext";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";

export default function TopBar() {
  const { pathname } = useLocation();
  const isAIDashboard = pathname === "/ai-dashboard";
  const isRanking = pathname === "/rangsor";
  const hideGlobalRefresh = isAIDashboard || isRanking;
  const { loadedAt, refreshing, reload, records, error } = useData();

  const handleRefresh = async () => {
    const t = toast.loading("Adatok frissítése az Excel fájlból…");
    const res = await reload();
    toast.dismiss(t);
    if (res?.ok) {
      toast.success(`Sikeres frissítés — ${res.count} rekord`, {
        icon: <CheckCircle2 className="w-4 h-4" />,
      });
    } else {
      toast.error(`Frissítés sikertelen — ${res?.error || "ismeretlen hiba"}`, {
        icon: <AlertCircle className="w-4 h-4" />,
      });
    }
  };

  return (
    <header
      data-testid="topbar"
      className="sticky top-0 z-30 glass border-b border-lime-900/10"
    >
      <div className="px-6 md:px-10 py-5 flex items-center justify-between gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-forest-700/70 font-medium">
            {isRanking ? "AI-alapú ötletértékelés" : isAIDashboard ? "Chat-to-Dashboard" : "Innovation Command Center"}
          </div>
          <h1 className="font-display text-2xl md:text-[28px] font-semibold text-forest-950 leading-tight mt-0.5">
            {isRanking ? "Rangsor" : isAIDashboard ? "AI Dashboard" : "Ötlet és igény riport"}
          </h1>
        </div>
        {!hideGlobalRefresh && <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-[10px] uppercase tracking-[0.18em] text-forest-700/60 font-semibold">
              Utolsó frissítés
            </span>
            <span data-testid="last-refresh" className="font-display text-sm text-forest-900">
              {loadedAt ? fmtDateTime(loadedAt) : "—"}
            </span>
            <span className="text-[11px] text-forest-700/70">{records.length} rekord</span>
          </div>
          <motion.div whileTap={{ scale: 0.96 }}>
            <Button
              data-testid="refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-11 px-5 rounded-full bg-forest-950 hover:bg-forest-900 text-lime-50 font-medium shadow-panel-deep"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={1.75}
              />
              {refreshing ? "Frissítés…" : "Adatok frissítése"}
            </Button>
          </motion.div>
        </div>}
      </div>
      {error && (
        <div data-testid="topbar-error" className="px-6 md:px-10 py-2 text-xs text-red-700 bg-red-50/70 border-t border-red-100">
          {error}
        </div>
      )}
    </header>
  );
}
