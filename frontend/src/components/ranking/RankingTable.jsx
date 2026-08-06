import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListRestart,
  LockKeyhole,
  Save,
  ShieldAlert,
  Sparkles,
  Undo2,
} from "lucide-react";
import OriginalIdeaPanel from "@/components/ranking/OriginalIdeaPanel";
import { Button } from "@/components/ui/button";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CONFIDENCE_LABELS, DEFAULT_RANKING_PAGE_SIZE, paginateRanking } from "@/lib/ranking";

export default function RankingTable({
  items,
  highlightedIdeaIds = [],
  rankingVersion,
  canReorder,
  dirty,
  saving,
  resetting,
  onMove,
  onSave,
  onCancel,
  onReset,
}) {
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const highlightedSet = useMemo(() => new Set(highlightedIdeaIds || []), [highlightedIdeaIds]);
  const highlightedItems = useMemo(
    () => (items || []).filter((item) => highlightedSet.has(item.ideaId)),
    [highlightedSet, items],
  );
  const pagination = paginateRanking(items, page);
  const hasManualOrder = (items || []).some((item) => item.manualOverride || Number(item.finalRank) !== Number(item.aiRank));

  useEffect(() => {
    if (page !== pagination.page) setPage(pagination.page);
  }, [page, pagination.page]);

  useEffect(() => {
    const firstHighlightedIndex = (items || []).findIndex((item) => highlightedSet.has(item.ideaId));
    if (firstHighlightedIndex >= 0) {
      setPage(Math.floor(firstHighlightedIndex / DEFAULT_RANKING_PAGE_SIZE) + 1);
    }
  }, [highlightedSet, items]);

  const showHighlightedIdea = (ideaId) => {
    const index = (items || []).findIndex((item) => item.ideaId === ideaId);
    if (index >= 0) setPage(Math.floor(index / DEFAULT_RANKING_PAGE_SIZE) + 1);
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-lime-900/10 bg-white shadow-soft-lg" data-testid="ranking-table">
      <div className="flex flex-col gap-4 border-b border-lime-900/10 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold text-forest-950">Aktuális rangsor</h2>
            {dirty && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-800">Nem mentett változások</span>}
            {highlightedItems.length > 0 && <span className="rounded-full border border-lime-300 bg-lime-100 px-2.5 py-1 text-[10px] font-semibold text-forest-900">{highlightedItems.length} új az utolsó feldolgozásból</span>}
          </div>
          <p className="mt-1 text-xs text-forest-700/65">
            {items?.length || 0} pontozott ötlet · rangsorverzió: {rankingVersion || "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!canReorder && <span className="inline-flex items-center gap-1.5 text-xs text-forest-700/60"><LockKeyhole className="h-3.5 w-3.5" /> Csak olvasható</span>}
          {canReorder && hasManualOrder && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" disabled={saving || resetting} className="rounded-full border-lime-900/15">
                  <ListRestart className="h-4 w-4" /> AI-sorrend visszaállítása
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl border-lime-900/10 bg-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Visszaállítod a végleges sorrendet?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A kézzel mentett sorrend helyére az aktuális AI-helyezés kerül. Az AI-pontszámok nem változnak.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Mégse</AlertDialogCancel>
                  <AlertDialogAction onClick={onReset} className="rounded-full bg-forest-950 text-lime-50 hover:bg-forest-900">
                    Visszaállítás
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canReorder && (
            <>
              <Button type="button" variant="outline" onClick={onCancel} disabled={!dirty || saving} className="rounded-full border-lime-900/15">
                <Undo2 className="h-4 w-4" /> Mégse
              </Button>
              <Button type="button" onClick={onSave} disabled={!dirty || saving} className="rounded-full bg-forest-950 text-lime-50 hover:bg-forest-900">
                {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-lime-100 border-t-transparent" /> : <Save className="h-4 w-4" />}
                {saving ? "Mentés…" : "Sorrend mentése"}
              </Button>
            </>
          )}
        </div>
      </div>

      {highlightedItems.length > 0 && (
        <div className="border-b border-lime-300 bg-lime-50 px-5 py-4 md:px-6" data-testid="recently-ranked-summary">
          <p className="text-xs font-semibold text-forest-950">Az utolsó újötlet-feldolgozásból rangsorba került tételek</p>
          <p className="mt-1 text-xs text-forest-700/70">A táblázatban zöld kiemelést kaptak. Az alábbi elemre kattintva a megfelelő oldalra ugorhatsz.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {highlightedItems.map((item) => (
              <button key={item.ideaId} type="button" onClick={() => showHighlightedIdea(item.ideaId)} className="rounded-full border border-lime-300 bg-white px-3 py-1.5 text-xs font-semibold text-forest-900 transition-colors hover:bg-lime-100" aria-label={`${item.ideaId} új rangsorelem megjelenítése`}>
                #{item.finalRank ?? "—"} · {item.ideaId} · {item.title || "Névtelen ötlet"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sr-only" aria-live="polite">
        {saving ? "A sorrend mentése folyamatban van." : dirty ? "A sorrend nem mentett módosításokat tartalmaz." : "A sorrend mentett állapotban van."}
      </div>

      {!items?.length ? (
        <div className="px-6 py-16 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-lime-500" />
          <h3 className="mt-3 font-display text-lg font-semibold text-forest-950">Még nincs rangsorolt ötlet</h3>
          <p className="mt-1 text-sm text-forest-700/65">A sikeres előszűrés és pontozás után az ötletek itt jelennek meg.</p>
        </div>
      ) : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1420px] text-left text-xs">
            <thead className="bg-forest-50/80 text-[10px] font-semibold uppercase tracking-[0.12em] text-forest-700/70">
              <tr>
                <th className="px-4 py-3">Sorrend</th>
                <th className="px-4 py-3">AI-hely</th>
                <th className="px-4 py-3">Azonosító</th>
                <th className="min-w-[260px] px-4 py-3">Ötlet</th>
                <th className="px-4 py-3">Pont</th>
                <th className="min-w-[300px] px-4 py-3">AI-indoklás</th>
                <th className="px-4 py-3">Bizonyosság</th>
                <th className="px-4 py-3">Jelzések</th>
                <th className="px-4 py-3">Értékelve</th>
                <th className="px-4 py-3"><span className="sr-only">Részletek</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lime-900/8">
              {pagination.items.map((item, pageIndex) => {
                const index = pagination.startIndex + pageIndex;
                const manuallyMoved = item.manualOverride || Number(item.finalRank) !== Number(item.aiRank);
                return (
                  <tr key={item.ideaId} data-recently-ranked={highlightedSet.has(item.ideaId) ? "true" : undefined} className={`align-top transition-colors ${highlightedSet.has(item.ideaId) ? "bg-lime-100/70 ring-1 ring-inset ring-lime-400 hover:bg-lime-100" : "hover:bg-lime-50/40"}`}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-forest-950 px-2 font-display text-base font-semibold text-lime-50">
                          {item.finalRank ?? index + 1}
                        </span>
                        {canReorder && (
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => onMove(index, -1)}
                              disabled={index === 0 || saving}
                              className="h-8 w-8 rounded-lg border-lime-900/15"
                              aria-label={`${item.title || item.ideaId} feljebb mozgatása`}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => onMove(index, 1)}
                              disabled={index === items.length - 1 || saving}
                              className="h-8 w-8 rounded-lg border-lime-900/15"
                              aria-label={`${item.title || item.ideaId} lejjebb mozgatása`}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-display text-base font-semibold text-forest-700">{item.aiRank ?? "—"}</td>
                    <td className="px-4 py-4 font-mono text-[11px] text-forest-700">{item.ideaId}</td>
                    <td className="px-4 py-4">
                      <button type="button" onClick={() => setSelected(item)} className="text-left font-semibold leading-snug text-forest-950 hover:underline">
                        {item.title || "Névtelen ötlet"}
                      </button>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {manuallyMoved && <Flag tone="amber">Kézi sorrend</Flag>}
                        {highlightedSet.has(item.ideaId) && <Flag>Új az utolsó feldolgozásból</Flag>}
                        {item.sourceChanged && <Flag tone="red">Az értékelés óta módosult</Flag>}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex min-w-14 justify-center rounded-xl px-3 py-2 font-display text-lg font-semibold ${scoreTone(item.overallScore)}`}>
                        {formatNumber(item.overallScore)}
                      </span>
                    </td>
                    <td className="px-4 py-4 leading-relaxed text-forest-800">
                      <p className="line-clamp-4">{item.overallRationale || "—"}</p>
                    </td>
                    <td className="px-4 py-4"><Flag tone="green">{CONFIDENCE_LABELS[item.confidence] || item.confidence || "—"}</Flag></td>
                    <td className="px-4 py-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        {(item.criticalRiskFlags || []).length ? item.criticalRiskFlags.map((risk, riskIndex) => (
                          <Flag key={`${safeText(risk)}-${riskIndex}`} tone="red">{safeText(risk)}</Flag>
                        )) : <span className="text-forest-700/50">Nincs kritikus jelzés</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-forest-700/75">{formatDateTime(item.evaluatedAt)}</td>
                    <td className="px-4 py-4">
                      <Button type="button" variant="ghost" size="icon" onClick={() => setSelected(item)} aria-label={`${item.title || item.ideaId} részletei`}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination.pageCount > 1 && (
          <nav className="flex flex-col gap-3 border-t border-lime-900/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Rangsor lapozása">
            <p className="text-xs text-forest-700/65">
              {pagination.startIndex + 1}–{Math.min(pagination.startIndex + pagination.pageSize, pagination.totalCount)} / {pagination.totalCount} ötlet · oldalanként {pagination.pageSize}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={pagination.page === 1} className="rounded-full border-lime-900/15">
                <ChevronLeft className="h-4 w-4" /> Előző
              </Button>
              <span className="min-w-20 text-center text-xs font-semibold text-forest-900">{pagination.page} / {pagination.pageCount}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pagination.pageCount, current + 1))} disabled={pagination.page === pagination.pageCount} className="rounded-full border-lime-900/15">
                Következő <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>
        )}
        </>
      )}

      <RankingDetail item={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

function RankingDetail({ item, onClose }) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto bg-white p-0 sm:max-w-4xl" data-testid="ranking-detail">
        {item && (
          <>
            <div className="panel-dark relative px-6 py-7 md:px-8">
              <div className="grain absolute inset-0 opacity-25" />
              <SheetHeader className="relative z-10 text-left">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-lime-200">
                  <span className="font-mono">{item.ideaId}</span>
                  <span>·</span>
                  <span>AI-hely: {item.aiRank ?? "—"}</span>
                  <span>·</span>
                  <span>Végleges hely: {item.finalRank ?? "—"}</span>
                </div>
                <SheetTitle className="pr-8 font-display text-2xl leading-snug text-white">{item.title || "Névtelen ötlet"}</SheetTitle>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-xl bg-lime-300 px-3 py-1.5 font-display text-xl font-semibold text-forest-950">{formatNumber(item.overallScore)}/100</span>
                  <Flag tone="light">{CONFIDENCE_LABELS[item.confidence] || item.confidence || "—"} bizonyosság</Flag>
                  {item.sourceChanged && <Flag tone="red">Az ötlet az értékelés óta módosult</Flag>}
                </div>
              </SheetHeader>
            </div>

            <div className="px-6 py-7 md:px-8">
              <Tabs defaultValue="ai">
                <TabsList className="bg-forest-50">
                  <TabsTrigger value="ai">AI-értékelés</TabsTrigger>
                  <TabsTrigger value="original">Eredeti ötlet</TabsTrigger>
                </TabsList>
                <TabsContent value="ai" className="mt-6 space-y-7">
              <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
                <Bot className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p><strong>AI által készített döntéstámogató előértékelés.</strong> Emberi felülvizsgálat szükséges.</p>
              </div>

              <DetailSection title="AI-indoklás a pontszámhoz" icon={Sparkles}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-forest-900">{item.overallRationale || "—"}</p>
              </DetailSection>

              {item.summary && <DetailSection title="Összefoglalás"><p className="whitespace-pre-wrap text-sm leading-relaxed text-forest-900">{item.summary}</p></DetailSection>}

              <div className="grid gap-4 md:grid-cols-2">
                <ListCard title="Erősségek" items={item.strengths} tone="green" />
                <ListCard title="Gyengeségek" items={item.weaknesses} tone="amber" />
                <ListCard title="A pontszámot leginkább emelte" items={item.positiveContributions} tone="green" />
                <ListCard title="A pontszámot leginkább korlátozta" items={item.limitingContributions} tone="amber" />
              </div>

              {(item.criticalRiskFlags || []).length > 0 && (
                <DetailSection title="Kritikus kockázati jelzések" icon={ShieldAlert}>
                  <TextList items={item.criticalRiskFlags} tone="red" />
                </DetailSection>
              )}

              <DetailSection title="Kritériumszintű értékelés" icon={CheckCircle2}>
                <div className="space-y-4">
                  {(item.criteria || []).map((criterion, index) => (
                    <div key={criterion.criterionId || index} className="rounded-2xl border border-lime-900/10 bg-forest-50/60 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="font-display text-base font-semibold text-forest-950">{criterion.name || criterion.criterionId}</h4>
                          <p className="mt-1 text-xs text-forest-700/65">Súly: {formatNumber(criterion.weight)}% · Súlyozott hozzájárulás: {formatNumber(criterion.weightedContribution)}</p>
                        </div>
                        <span className="rounded-xl bg-forest-950 px-3 py-1.5 font-display text-lg font-semibold text-lime-50">{formatNumber(criterion.score)}/10</span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-forest-900">{criterion.rationale || "—"}</p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <MiniList title="Bizonyíték" items={criterion.evidence} />
                        <MiniList title="Alátámasztás nélküli állítás" items={criterion.unsupportedClaims} tone="amber" />
                        <MiniList title="Hiányzó információ" items={criterion.missingInformation} tone="blue" />
                        <MiniList title="Kockázat" items={criterion.risks} tone="red" />
                      </div>
                    </div>
                  ))}
                </div>
              </DetailSection>

              <ListCard title="Javasolt következő lépések" items={item.nextSteps} tone="blue" />

              <div className="flex items-center gap-2 border-t border-lime-900/10 pt-5 text-xs text-forest-700/70">
                <CalendarClock className="h-4 w-4" /> Értékelés ideje: {formatDateTime(item.evaluatedAt)}
              </div>
                </TabsContent>
                <TabsContent value="original" className="mt-6">
                  <OriginalIdeaPanel idea={item.originalIdea} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({ title, icon: Icon = AlertTriangle, children }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-forest-700" strokeWidth={1.7} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-forest-700/80">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ListCard({ title, items, tone }) {
  return (
    <div className="rounded-2xl border border-lime-900/10 bg-white p-4">
      <h3 className="font-display text-base font-semibold text-forest-950">{title}</h3>
      <TextList items={items} tone={tone} />
    </div>
  );
}

function TextList({ items, tone = "green" }) {
  const safeItems = (items || []).filter((item) => item !== null && item !== undefined && safeText(item));
  if (!safeItems.length) return <p className="mt-2 text-xs text-forest-700/50">Nincs megadott elem.</p>;
  const dot = tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : tone === "blue" ? "bg-blue-500" : "bg-lime-600";
  return (
    <ul className="mt-2 space-y-2 text-sm text-forest-900">
      {safeItems.map((item, index) => <li key={`${safeText(item)}-${index}`} className="flex items-start gap-2"><span className={`mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} /><span className="whitespace-pre-wrap">{safeText(item)}</span></li>)}
    </ul>
  );
}

function MiniList({ title, items, tone }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-forest-700/65">{title}</div>
      <TextList items={items} tone={tone} />
    </div>
  );
}

function Flag({ tone = "green", children }) {
  const tones = {
    green: "border-lime-200 bg-lime-50 text-forest-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    light: "border-white/20 bg-white/10 text-lime-50",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold leading-tight ${tones[tone] || tones.green}`}>{children}</span>;
}

function scoreTone(score) {
  const value = Number(score) || 0;
  if (value >= 75) return "bg-emerald-100 text-emerald-900";
  if (value >= 50) return "bg-lime-100 text-forest-900";
  if (value >= 30) return "bg-amber-100 text-amber-900";
  return "bg-red-100 text-red-900";
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(number) : String(value);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  const label = value.name || value.criterionName || value.label || value.criterionId || "";
  const amount = value.value ?? value.score ?? value.weightedContribution;
  if (label && amount !== undefined) return `${label}: ${formatNumber(amount)}`;
  if (label) return String(label);
  return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join(", ");
}
