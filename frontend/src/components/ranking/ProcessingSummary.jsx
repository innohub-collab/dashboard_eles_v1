import { useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LoaderCircle,
  Play,
  RefreshCw,
  ScanSearch,
  ShieldQuestion,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeProcessLimit } from "@/lib/ranking";

const SUMMARY_CARDS = [
  { key: "eligibleCount", label: "Jogosult ötlet", icon: FileCheck2, tone: "text-forest-800 bg-lime-50 border-lime-200" },
  { key: "processedCount", label: "Feldolgozott", icon: CheckCircle2, tone: "text-emerald-800 bg-emerald-50 border-emerald-200" },
  { key: "newCount", label: "Új ötlet", icon: Clock3, tone: "text-blue-800 bg-blue-50 border-blue-200" },
  { key: "passedCount", label: "Pontozásra átment", icon: ScanSearch, tone: "text-forest-800 bg-lime-50 border-lime-200" },
  { key: "closureRecommendedCount", label: "Lezárásra javasolt", icon: AlertTriangle, tone: "text-amber-800 bg-amber-50 border-amber-200", target: "prescreen-close" },
  { key: "clarificationCount", label: "Pontosítandó", icon: ShieldQuestion, tone: "text-blue-800 bg-blue-50 border-blue-200", target: "prescreen-clarification" },
  { key: "closureAcceptedCount", label: "Lezárandó", icon: CheckCircle2, tone: "text-amber-800 bg-amber-50 border-amber-200", target: "prescreen-closure-accepted" },
  { key: "clarificationAcceptedCount", label: "Pontosításra visszaküldendő", icon: CheckCircle2, tone: "text-blue-800 bg-blue-50 border-blue-200", target: "prescreen-clarification-accepted" },
  { key: "humanReviewCount", label: "Emberi felülvizsgálat", icon: ShieldQuestion, tone: "text-violet-800 bg-violet-50 border-violet-200", target: "prescreen-human-review" },
  { key: "failedCount", label: "Technikai hiba", icon: AlertTriangle, tone: "text-red-800 bg-red-50 border-red-200", target: "prescreen-failed" },
];

export default function ProcessingSummary({
  status,
  canProcess,
  processing,
  onProcess,
  canRescore,
  rescoring,
  onRescore,
  canReset,
  resettingAll,
  onResetAll,
  canFullReevaluate,
  reevaluating,
  onFullReevaluate,
  onNavigate,
}) {
  const [limit, setLimit] = useState(5);
  const [retryFailed, setRetryFailed] = useState(false);
  const [retryReevaluation, setRetryReevaluation] = useState(false);
  const [requestedBatchSize, setRequestedBatchSize] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetReason, setResetReason] = useState("");

  if (!status) {
    return <div className="h-44 animate-pulse rounded-3xl border border-lime-900/10 bg-white/70" aria-label="Feldolgozási összesítő betöltése" />;
  }

  const progress = status.reevaluation || {};
  const weightRescoreRequired = status.weightRescore?.required === true;
  const resetValid = resetConfirmation === "TELJES ÚJRAKEZDÉS" && resetReason.trim().length >= 5;
  const activeBatch = status.batchProcessing?.state === "RUNNING" ? status.batchProcessing : null;
  const batchTotal = Number(activeBatch?.totalCount ?? requestedBatchSize ?? 0);
  const batchCompleted = Number(activeBatch?.completedCount || 0);
  const batchPercent = batchTotal ? Math.max(0, Math.min(100, Math.round((batchCompleted / batchTotal) * 100))) : 0;
  const run = () => {
    const normalizedLimit = normalizeProcessLimit(limit);
    const available = Number(status.newCount || 0) + (retryFailed ? Number(status.failedCount || 0) : 0);
    setRequestedBatchSize(Math.min(normalizedLimit, available));
    onProcess({ limit: normalizedLimit, retryFailed });
  };
  const runFullReevaluation = () => onFullReevaluate({ limit: 20, retryFailed: retryReevaluation });
  const submitFullReset = async (event) => {
    event.preventDefault();
    if (!resetValid || resettingAll) return;
    try {
      await onResetAll({ confirmation: resetConfirmation, reason: resetReason.trim() });
      setResetConfirmation("");
      setResetReason("");
      setResetOpen(false);
    } catch (_) {
      // Sikertelen kérésnél megőrizzük a megerősítést és az indokot.
    }
  };

  return (
    <section className="rounded-3xl border border-lime-900/10 bg-white p-5 shadow-soft-lg md:p-6" data-testid="ranking-summary">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-forest-950">Feldolgozási összesítő</h2>
          <p className="mt-1 text-xs text-forest-700/65">Utolsó frissítés: {formatDateTime(status.lastUpdated)}</p>
        </div>
        {canProcess && (
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-lime-200 bg-forest-50 p-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.13em] text-forest-700/70">Batch mérete</span>
              <Input type="number" min="1" max="20" value={limit} onChange={(event) => setLimit(event.target.value)} disabled={processing} className="h-9 w-24 rounded-xl bg-white" aria-label="Feldolgozási batch mérete" />
            </label>
            <label className="flex h-9 items-center gap-2 text-xs text-forest-900">
              <Checkbox checked={retryFailed} onCheckedChange={(checked) => setRetryFailed(checked === true)} disabled={processing} />
              Hibák újrapróbálása
            </label>
            <Button type="button" onClick={run} disabled={processing || (!status.newCount && !(retryFailed && status.failedCount))} className="h-9 rounded-full bg-forest-950 px-4 text-lime-50 hover:bg-forest-900" data-testid="ranking-process">
              {processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {processing ? "Feldolgozás…" : "Új ötletek feldolgozása"}
            </Button>
            {processing && (
              <div className="basis-full rounded-xl border border-lime-200 bg-white p-3" data-testid="active-batch-progress">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-forest-950">{formatNumber(batchCompleted)}/{formatNumber(batchTotal)} ötlet elkészült</div>
                    <div className="mt-0.5 text-[11px] text-forest-700/70">{batchStepLabel(activeBatch, batchCompleted, batchTotal)}</div>
                  </div>
                  <span className="rounded-full bg-lime-100 px-2.5 py-1 text-xs font-semibold text-forest-900">{formatNumber(batchPercent)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-forest-50" role="progressbar" aria-label="Az aktuális ötletbatch feldolgozási készültsége" aria-valuemin="0" aria-valuemax="100" aria-valuenow={batchPercent}>
                  <div className="h-full rounded-full bg-forest-800 transition-[width] duration-500" style={{ width: `${batchPercent}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-forest-700/75">
                  <span>Eltelt idő: {formatElapsed(activeBatch?.elapsedSeconds)}</span>
                  <span>Becsült hátralévő idő: {formatRemaining(activeBatch?.estimatedRemainingSeconds, batchCompleted)}</span>
                  {activeBatch && <span>Sikeres: {formatNumber(activeBatch.successfulCount)} · Hibás: {formatNumber(activeBatch.failedCount)}</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10">
        {SUMMARY_CARDS.map(({ key, label, icon: Icon, tone, target }) => {
          const content = (
            <>
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${tone}`}><Icon className="h-4 w-4" strokeWidth={1.7} /></div>
              <div className="mt-3 font-display text-2xl font-semibold text-forest-950">{formatNumber(status[key])}</div>
              <div className="mt-0.5 text-[10px] font-medium leading-snug text-forest-700/70">{label}</div>
            </>
          );
          return target ? (
            <button key={key} type="button" onClick={() => onNavigate(target)} className="rounded-2xl border border-lime-900/10 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-lime-400 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 focus-visible:ring-offset-2" aria-label={`${label} szekció megnyitása`}>
              {content}
            </button>
          ) : <div key={key} className="rounded-2xl border border-lime-900/10 bg-white p-3">{content}</div>;
        })}
      </div>

      {(canRescore || canFullReevaluate) && (
        <div className="mt-5 grid gap-4 border-t border-lime-900/10 pt-5 lg:grid-cols-2">
          {canRescore && (
            <div className="rounded-2xl border border-lime-200 bg-lime-50/60 p-4">
              <h3 className="font-display text-base font-semibold text-forest-950">Súlyalapú újrapontozás</h3>
              <p className="mt-1 text-xs leading-relaxed text-forest-700/70">Csak elmentett súlyváltozás után érhető el. Az új súlyokkal, AI-hívás nélkül számolja újra a kompatibilis eredményeket; addig a korábbi rangsor változatlan marad.</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold text-forest-800">{weightRescoreRequired ? `${formatNumber(status.weightRescore?.compatibleCount ?? status.rescoreCompatibleCount)} kompatibilis ötlet · újrapontozás szükséges` : "Nincs alkalmazásra váró súlyváltozás"}</span>
                <Button type="button" variant="outline" onClick={onRescore} disabled={rescoring || !weightRescoreRequired} className="rounded-full border-lime-300 bg-white text-forest-900 hover:bg-lime-100" data-testid="ranking-rescore-all">
                  {rescoring ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  {rescoring ? "Újraszámítás…" : "Összes pontszám újraszámítása"}
                </Button>
              </div>
            </div>
          )}

          {canFullReevaluate && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4" data-testid="full-reevaluation-progress">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-forest-950">Teljes újraértékelés</h3>
                  <p className="mt-1 text-xs leading-relaxed text-amber-900/80">Új módszertan esetén, legfeljebb 20 ötletes batch-ekben fut. A sikeres részeredmények megmaradnak.</p>
                </div>
                <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-900">Batch {formatNumber(progress.currentBatch)}/{formatNumber(progress.batchCount)}</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <ProgressValue label="Összes" value={progress.totalCount} />
                <ProgressValue label="Feldolgozott" value={progress.processedCount} />
                <ProgressValue label="Hátralévő" value={progress.remainingCount} />
                <ProgressValue label="Hiba" value={progress.errorCount} />
              </dl>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-amber-950">
                  <Checkbox checked={retryReevaluation} onCheckedChange={(checked) => setRetryReevaluation(checked === true)} disabled={reevaluating} />
                  Hibás ötletek újrapróbálása
                </label>
                <Button type="button" onClick={runFullReevaluation} disabled={reevaluating || !progress.remainingCount || (progress.errorCount > 0 && progress.remainingCount === progress.errorCount && !retryReevaluation)} className="rounded-full bg-amber-800 text-white hover:bg-amber-900" data-testid="ranking-full-reevaluation">
                  {reevaluating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {reevaluating ? "Újraértékelés…" : progress.processedCount ? "Újraértékelés folytatása" : "Teljes újraértékelés"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {canReset && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-red-950">Feldolgozás teljes újrakezdése</h3>
              <p className="mt-1 text-xs leading-relaxed text-red-900/75">Törli az előszűréseket, pontozásokat, feldolgozási állapotokat és emberi felülbírálásokat. A beállítások és az auditnapló megmaradnak.</p>
            </div>
            <AlertDialog open={resetOpen} onOpenChange={(open) => !resettingAll && setResetOpen(open)}>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" className="rounded-full border-red-300 bg-white text-red-800 hover:bg-red-100" data-testid="ranking-reset-all"><Trash2 className="h-4 w-4" /> Feldolgozott adatok törlése</Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl border-red-200 bg-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Biztosan teljesen 0-ról indítod az értékelést?</AlertDialogTitle>
                  <AlertDialogDescription>Ez a művelet a feldolgozott rangsoradatokat végleg törli. Írd be pontosan: <strong>TELJES ÚJRAKEZDÉS</strong>, és add meg az auditindokot.</AlertDialogDescription>
                </AlertDialogHeader>
                <label className="block text-xs font-semibold text-forest-900">Megerősítés<Input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} disabled={resettingAll} className="mt-2 rounded-xl" autoComplete="off" /></label>
                <label className="block text-xs font-semibold text-forest-900">Auditindok<Textarea value={resetReason} onChange={(event) => setResetReason(event.target.value)} disabled={resettingAll} rows={4} maxLength={2000} className="mt-2 resize-y rounded-xl" placeholder="Miért szükséges a teljes újrakezdés?" /></label>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full" disabled={resettingAll}>Mégse</AlertDialogCancel>
                  <AlertDialogAction onClick={submitFullReset} disabled={!resetValid || resettingAll} className="rounded-full bg-red-700 text-white hover:bg-red-800">{resettingAll ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{resettingAll ? "Törlés…" : "Teljes újrakezdés"}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      <div className="sr-only" aria-live="polite">
        {processing || reevaluating || rescoring ? "A rangsor feldolgozása folyamatban van." : "A feldolgozás jelenleg nem fut."}
      </div>
    </section>
  );
}

function ProgressValue({ label, value }) {
  return <div className="rounded-xl bg-white/80 px-3 py-2"><dt className="text-[10px] uppercase tracking-wide text-forest-700/60">{label}</dt><dd className="mt-0.5 font-display text-lg font-semibold text-forest-950">{formatNumber(value)}</dd></div>;
}

export function PendingProcessing({ status, canProcess, processing, onProcess }) {
  const pending = Number(status?.newCount || 0);
  const failed = Number(status?.failedCount || 0);
  return (
    <section className="rounded-3xl border border-lime-900/10 bg-white p-5 shadow-soft-lg md:p-6" data-testid="ranking-pending">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-forest-950">Értékelésre váró vagy sikertelen ötletek</h2>
          <p className="mt-1 text-sm text-forest-700/70">{pending} új ötlet vár feldolgozásra, {failed} technikailag sikertelen ötlet próbálható újra.</p>
        </div>
        {canProcess && failed > 0 && (
          <Button type="button" variant="outline" onClick={() => onProcess({ limit: normalizeProcessLimit(failed), retryFailed: true })} disabled={processing} className="rounded-full border-red-200 text-red-800 hover:bg-red-50">
            {processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sikertelenek újrapróbálása
          </Button>
        )}
      </div>
    </section>
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function batchStepLabel(batch, completed, total) {
  if (!batch) return total ? "A batch indítása folyamatban van…" : "Feldolgozás előkészítése…";
  if (batch.currentItemNumber) {
    const phase = batch.phase === "EVALUATION" ? "pontozása" : batch.phase === "PRESCREEN" ? "előszűrése" : "feldolgozása";
    return `${batch.currentItemNumber}. ötlet ${phase} folyamatban`;
  }
  return completed >= total ? "A batch befejezése…" : "A következő ötlet előkészítése…";
}

function formatElapsed(value) {
  const seconds = Math.max(0, Number(value) || 0);
  if (seconds < 60) return `${Math.round(seconds)} mp`;
  return `${Math.floor(seconds / 60)} p ${Math.round(seconds % 60)} mp`;
}

function formatRemaining(value, completed) {
  if (!completed || value === null || value === undefined) return "becslés az első ötlet után";
  const seconds = Math.max(0, Number(value) || 0);
  if (seconds < 60) return "kevesebb mint 1 perc";
  return `kb. ${Math.ceil(seconds / 60)} perc`;
}
