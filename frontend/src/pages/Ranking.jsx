import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PrescreenResults from "@/components/ranking/PrescreenResults";
import ProcessingSummary, { PendingProcessing } from "@/components/ranking/ProcessingSummary";
import RankingSettings from "@/components/ranking/RankingSettings";
import RankingTable from "@/components/ranking/RankingTable";
import { errorMessage, moveRankingItem, rankingIdeaIds } from "@/lib/ranking";
import { rankingApi } from "@/lib/rankingApi";

const queryOptions = { retry: 1 };
const RECENTLY_RANKED_SESSION_KEY = "innolab.ranking.recently-ranked.v1";

function readRecentlyRankedIdeaIds() {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(RECENTLY_RANKED_SESSION_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((item) => typeof item === "string") : [];
  } catch (_) {
    return [];
  }
}

function saveRecentlyRankedIdeaIds(ideaIds) {
  const safeIdeaIds = Array.isArray(ideaIds) ? ideaIds.filter((item) => typeof item === "string") : [];
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(RECENTLY_RANKED_SESSION_KEY, JSON.stringify(safeIdeaIds));
  }
  return safeIdeaIds;
}

export default function Ranking() {
  const queryClient = useQueryClient();
  const [localItems, setLocalItems] = useState([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [processingJobActive, setProcessingJobActive] = useState(false);
  const [recentlyRankedIdeaIds, setRecentlyRankedIdeaIds] = useState(readRecentlyRankedIdeaIds);
  const reevaluateLock = useRef(false);

  const permissionsQuery = useQuery({
    queryKey: ["ranking", "permissions"],
    queryFn: rankingApi.getPermissions,
    ...queryOptions,
  });
  const permissions = permissionsQuery.data;
  const canView = permissions?.view === true;

  const rankingQuery = useQuery({
    queryKey: ["ranking", "items"],
    queryFn: rankingApi.getRanking,
    enabled: canView,
    ...queryOptions,
  });
  const statusQuery = useQuery({
    queryKey: ["ranking", "status"],
    queryFn: rankingApi.getStatus,
    enabled: canView,
    refetchInterval: processingJobActive ? 1000 : false,
    ...queryOptions,
  });
  const prescreensQuery = useQuery({
    queryKey: ["ranking", "prescreens"],
    queryFn: rankingApi.getPrescreens,
    enabled: canView,
    ...queryOptions,
  });
  const settingsQuery = useQuery({
    queryKey: ["ranking", "settings"],
    queryFn: rankingApi.getSettings,
    enabled: canView,
    ...queryOptions,
  });

  const ranking = rankingQuery.data;
  useEffect(() => {
    if (!orderDirty) setLocalItems((ranking?.items || []).map((item) => ({ ...item })));
  }, [ranking?.items, ranking?.rankingVersion, orderDirty]);

  const invalidateRanking = () => queryClient.invalidateQueries({ queryKey: ["ranking"] });

  const processMutation = useMutation({
    mutationFn: rankingApi.process,
    onMutate: () => {
      setRecentlyRankedIdeaIds(saveRecentlyRankedIdeaIds([]));
      setProcessingJobActive(true);
      queryClient.invalidateQueries({ queryKey: ["ranking", "status"] });
    },
    onSuccess: (data) => {
      setRecentlyRankedIdeaIds(saveRecentlyRankedIdeaIds(data?.newlyRankedIdeaIds));
      const count = data?.successfullyScoredCount ?? data?.scoredCount ?? data?.processedCount;
      toast.success(count === undefined ? "A feldolgozás befejeződött." : `${count} ötlet sikeresen feldolgozva.`);
      invalidateRanking();
    },
    onError: (error) => toast.error(errorMessage(error, "Az ötletek feldolgozása nem sikerült.")),
    onSettled: () => {
      setProcessingJobActive(false);
      queryClient.invalidateQueries({ queryKey: ["ranking", "status"] });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: rankingApi.overridePrescreen,
    onSuccess: () => {
      toast.success("Az emberi döntés auditáltan mentve.");
      invalidateRanking();
    },
    onError: (error) => toast.error(errorMessage(error, "A felülbírálás nem menthető.")),
  });

  const reevaluateMutation = useMutation({
    mutationFn: rankingApi.reevaluate,
    onSuccess: () => {
      toast.success("Az ötlet újraértékelése sikeresen befejeződött.");
      invalidateRanking();
    },
    onError: (error) => toast.error(errorMessage(error, "Az ötlet újraértékelése nem sikerült.")),
  });

  const orderMutation = useMutation({
    mutationFn: rankingApi.saveOrder,
    onSuccess: () => {
      setOrderDirty(false);
      toast.success("A végleges sorrend mentve.");
      invalidateRanking();
    },
    onError: (error) => toast.error(errorMessage(error, "A sorrend nem menthető; a helyi módosítások megmaradtak.")),
  });

  const resetOrderMutation = useMutation({
    mutationFn: rankingApi.resetOrder,
    onSuccess: () => {
      setOrderDirty(false);
      toast.success("A végleges sorrend visszaállt az AI-sorrendre.");
      invalidateRanking();
    },
    onError: (error) => toast.error(errorMessage(error, "Az AI-sorrend visszaállítása nem sikerült.")),
  });

  const resetAllMutation = useMutation({
    mutationFn: rankingApi.resetAll,
    onSuccess: (data) => {
      setOrderDirty(false);
      setLocalItems([]);
      setRecentlyRankedIdeaIds(saveRecentlyRankedIdeaIds([]));
      const removed = Object.values(data?.deletedCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      toast.success(`A rangsor feldolgozási adatai törölve (${removed} rekord). Az értékelés 0-ról indítható.`);
      invalidateRanking();
    },
    onError: (error) => toast.error(errorMessage(error, "A teljes újrakezdés nem sikerült.")),
  });

  const settingsMutation = useMutation({
    mutationFn: rankingApi.saveSettings,
    onSuccess: (data) => {
      if (data?.status === "unchanged") {
        toast.info("Az értékelési beállítások nem változtak.");
      } else if (data?.requiresFullReevaluation) {
        toast.warning("Új módszertani verzió jött létre. A régi részpontszámokat nem használjuk; indíts teljes újraértékelést.");
      } else if (data?.requiresWeightRescore) {
        toast.info("A súlyok elmentve. A jelenlegi rangsor változatlan maradt; az új súlyok alkalmazásához indíts súlyalapú újrapontozást.");
      } else {
        toast.success("Az értékelési beállítások elmentve.");
      }
      invalidateRanking();
    },
    onError: (error) => toast.error(errorMessage(error, "Az értékelési beállítások nem menthetők.")),
  });

  const resetSettingsMutation = useMutation({
    mutationFn: rankingApi.resetSettings,
    onSuccess: (data) => {
      if (data?.requiresFullReevaluation) {
        toast.warning("Új módszertani verzió jött létre. Indíts teljes újraértékelést; a régi részpontszámokat a rendszer nem használja fel.");
      } else if (data?.requiresWeightRescore) {
        toast.info("Az alapértelmezett súlyok elmentve. A jelenlegi rangsor változatlan; az alkalmazásukhoz indíts súlyalapú újrapontozást.");
      } else {
        toast.success("Az alapértelmezett beállítások visszaálltak.");
      }
      invalidateRanking();
    },
    onError: (error) => toast.error(errorMessage(error, "Az alapértékek visszaállítása nem sikerült.")),
  });

  const rescoreMutation = useMutation({
    mutationFn: rankingApi.rescoreAll,
    onSuccess: (data) => {
      toast.success(`${data?.rescoredCount ?? 0} kompatibilis ötlet pontszáma és helyezése újraszámítva AI-hívás nélkül.`);
      invalidateRanking();
    },
    onError: (error) => toast.error(errorMessage(error, "Az összes pontszám újraszámítása nem sikerült.")),
  });

  const fullReevaluationMutation = useMutation({
    mutationFn: rankingApi.fullReevaluate,
    onSuccess: (data) => {
      const processed = data?.processedThisBatch ?? 0;
      const errors = data?.errorsThisBatch ?? 0;
      if (errors) toast.warning(`${processed} ötlet újraértékelve, ${errors} hibával. A sikeres eredmények megmaradtak.`);
      else toast.success(`${processed} ötlet sikeresen újraértékelve ebben a batch-ben.`);
      invalidateRanking();
    },
    onError: (error) => toast.error(errorMessage(error, "A teljes újraértékelési batch nem sikerült.")),
  });

  const dataError = useMemo(
    () => [rankingQuery, statusQuery, prescreensQuery, settingsQuery].find((query) => query.isError)?.error,
    [prescreensQuery, rankingQuery, settingsQuery, statusQuery],
  );

  const move = (index, direction) => {
    if (!permissions?.reorder || orderMutation.isPending) return;
    setLocalItems((current) => {
      const moved = moveRankingItem(current, index, direction);
      if (moved !== current) setOrderDirty(true);
      return moved;
    });
  };

  const cancelOrder = () => {
    setLocalItems((ranking?.items || []).map((item) => ({ ...item })));
    setOrderDirty(false);
  };

  const saveOrder = () => {
    if (!orderDirty || orderMutation.isPending || !ranking?.rankingVersion) return;
    orderMutation.mutate({ ideaIds: rankingIdeaIds(localItems), rankingVersion: ranking.rankingVersion });
  };

  const resetOrder = () => {
    if (resetOrderMutation.isPending || !ranking?.rankingVersion) return;
    resetOrderMutation.mutate({ rankingVersion: ranking.rankingVersion });
  };

  const navigateToSection = (sectionId) => {
    const target = document.getElementById(sectionId);
    if (!target) return;
    window.history.replaceState(window.history.state, "", `#${sectionId}`);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
  };

  const reevaluate = async (payload) => {
    if (reevaluateLock.current) throw new Error("Az újraértékelés már folyamatban van.");
    reevaluateLock.current = true;
    try {
      return await reevaluateMutation.mutateAsync(payload);
    } finally {
      reevaluateLock.current = false;
    }
  };

  if (permissionsQuery.isLoading) return <FullPageLoading />;

  if (permissionsQuery.isError) {
    return <FullPageError message={errorMessage(permissionsQuery.error, "A Rangsor jogosultságai nem tölthetők be.")} onRetry={() => permissionsQuery.refetch()} />;
  }

  if (!canView) {
    return (
      <div className="pt-6" data-testid="ranking-forbidden">
        <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-soft-lg">
          <ShieldCheck className="mx-auto h-10 w-10 text-amber-600" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-forest-950">Nincs jogosultságod a rangsor megtekintéséhez</h2>
          <p className="mt-2 text-sm text-forest-700/70">Kérj rangsormegtekintési jogosultságot a rendszer adminisztrátorától.</p>
        </div>
      </div>
    );
  }

  const initialLoading = rankingQuery.isLoading || statusQuery.isLoading || prescreensQuery.isLoading || settingsQuery.isLoading;

  return (
    <div className="space-y-6 pt-6" data-testid="ranking-page">
      <div className="flex flex-col gap-4 rounded-3xl panel-dark relative overflow-hidden p-6 shadow-panel-deep md:flex-row md:items-center md:justify-between md:p-7">
        <div className="grain absolute inset-0 opacity-25" />
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-300/85">
            <Sparkles className="h-3.5 w-3.5" /> Kétlépcsős AI-előértékelés
          </div>
          <h2 className="mt-1 font-display text-2xl font-semibold text-white">Ötletértékelés és döntéstámogató rangsor</h2>
          <p className="mt-2 text-sm leading-relaxed text-lime-100/85">
            Csak a backend által jogosultnak minősített ötletek kerülhetnek előszűrésre és pontozásra. Az AI eredménye ajánlás, minden üzleti döntés emberi felülvizsgálatot igényel.
          </p>
        </div>
        <div className="relative z-10 flex flex-col items-start gap-2 md:items-end">
          {permissions?.actor && <span className="text-xs text-lime-200/75">Műveleti azonosító: {permissions.actor}</span>}
          <Button
            type="button"
            variant="outline"
            onClick={invalidateRanking}
            disabled={initialLoading}
            className="rounded-full border-lime-300/30 bg-white/10 text-lime-50 hover:bg-white/20 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${initialLoading ? "animate-spin" : ""}`} /> Nézet frissítése
          </Button>
        </div>
      </div>

      {dataError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {errorMessage(dataError, "A rangsor egy része nem tölthető be.")}</span>
          <Button type="button" variant="outline" size="sm" onClick={invalidateRanking} className="rounded-full border-red-200">Újrapróbálás</Button>
        </div>
      )}

      <RankingSettings
        settings={settingsQuery.data}
        permissions={permissions}
        saving={settingsMutation.isPending || resetSettingsMutation.isPending}
        resetting={resetSettingsMutation.isPending}
        onSave={(payload) => settingsMutation.mutateAsync(payload)}
        onResetDefaults={() => resetSettingsMutation.mutate({ configVersion: settingsQuery.data?.configVersion })}
      />

      <ProcessingSummary
        status={statusQuery.data}
        canProcess={permissions?.process === true}
        processing={processMutation.isPending}
        onProcess={(payload) => processMutation.mutate(payload)}
        canRescore={permissions?.editWeights === true}
        rescoring={rescoreMutation.isPending || settingsMutation.isPending || resetSettingsMutation.isPending}
        onRescore={() => rescoreMutation.mutate({ configVersion: statusQuery.data?.weightRescore?.configVersion })}
        canReset={permissions?.reset === true}
        resettingAll={resetAllMutation.isPending}
        onResetAll={(payload) => resetAllMutation.mutateAsync(payload)}
        canFullReevaluate={permissions?.reevaluate === true}
        reevaluating={fullReevaluationMutation.isPending || reevaluateMutation.isPending}
        onFullReevaluate={(payload) => fullReevaluationMutation.mutate(payload)}
        onNavigate={navigateToSection}
      />

      <RankingTable
        items={localItems}
        highlightedIdeaIds={recentlyRankedIdeaIds}
        rankingVersion={ranking?.rankingVersion}
        canReorder={permissions?.reorder === true}
        dirty={orderDirty}
        saving={orderMutation.isPending}
        resetting={resetOrderMutation.isPending}
        onMove={move}
        onSave={saveOrder}
        onCancel={cancelOrder}
        onReset={resetOrder}
      />

      <PrescreenResults
        items={prescreensQuery.data?.items || []}
        canOverride={permissions?.override === true}
        overriding={overrideMutation.isPending}
        onOverride={(payload) => overrideMutation.mutateAsync(payload)}
        canReevaluate={permissions?.reevaluate === true}
        reevaluating={reevaluateMutation.isPending || fullReevaluationMutation.isPending}
        onReevaluate={reevaluate}
      />

      <PendingProcessing
        status={statusQuery.data}
        canProcess={permissions?.process === true}
        processing={processMutation.isPending}
        onProcess={(payload) => processMutation.mutate(payload)}
      />

      <div className="sr-only" aria-live="polite">
        {initialLoading ? "A rangsor adatainak betöltése folyamatban van." : "A rangsor adatai betöltődtek."}
      </div>
    </div>
  );
}

function FullPageLoading() {
  return (
    <div className="flex min-h-[480px] items-center justify-center pt-6" data-testid="ranking-loading" role="status">
      <div className="text-center text-forest-700"><LoaderCircle className="mx-auto h-8 w-8 animate-spin" /><p className="mt-3 text-sm">Rangsor betöltése…</p></div>
    </div>
  );
}

function FullPageError({ message, onRetry }) {
  return (
    <div className="pt-6" role="alert">
      <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-soft-lg">
        <AlertCircle className="mx-auto h-10 w-10 text-red-600" />
        <h2 className="mt-4 font-display text-xl font-semibold text-forest-950">A Rangsor nem tölthető be</h2>
        <p className="mt-2 text-sm text-red-800">{message}</p>
        <Button type="button" onClick={onRetry} className="mt-5 rounded-full bg-forest-950 text-lime-50 hover:bg-forest-900"><RefreshCw className="h-4 w-4" /> Újrapróbálás</Button>
      </div>
    </div>
  );
}
