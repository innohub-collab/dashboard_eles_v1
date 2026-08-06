import { useData } from "@/context/DataContext";
import KPICard from "@/components/KPICard";
import StatusDonut from "@/components/charts/StatusDonut";
import CategoryBar from "@/components/charts/CategoryBar";
import TrendChart from "@/components/charts/TrendChart";
import OutcomeFunnel from "@/components/charts/OutcomeFunnel";
import TopList from "@/components/TopList";
import {
  computeSummaryWithDelta,
  statusBreakdown,
  categoryBreakdown,
  outcomeBreakdown,
  monthlyTrend,
  topSubmitters,
  topDepartments,
  programBreakdown,
  bottleneckStatus,
  isNamedProgram,
  isInnovationLab,
  hasKnownSubmitter,
  recordsForRankings,
  recordsForMonthlyTrend,
} from "@/lib/kpi";
import { Lightbulb, CheckCircle2, XCircle, Clock, Activity, TrendingUp, Timer, AlertTriangle, Sparkles, Users, ListChecks, LayoutList, PauseCircle, FlaskConical } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { filtered, loading, records, filters } = useData();

  if (loading) return <DashboardSkeleton />;
  if (!records.length) return <EmptyState />;

  const windowMap = { "3m": 3, "6m": 6, "12m": 12, all: null };
  const s = computeSummaryWithDelta(filtered, windowMap[filters.period]);
  const deltaHintSuffix = filters.period === "all" ? "3 hónap vs. előző 3" : "vs. előző időszak";
  const status = statusBreakdown(filtered);
  const category = categoryBreakdown(filtered);
  const outcomes = outcomeBreakdown(filtered);
  const trendRecords = recordsForMonthlyTrend(filtered);
  const trend = monthlyTrend(trendRecords);
  const submitters = topSubmitters(filtered);
  const departments = topDepartments(filtered);
  const rankingRecords = recordsForRankings(filtered);
  const bottleneck = bottleneckStatus(filtered);
  const namedProgramCount = filtered.filter(isNamedProgram).length;
  const innovationLabCount = filtered.filter(isInnovationLab).length;
  const programSplit = programBreakdown(filtered);
  const submitterTotal = rankingRecords.filter(hasKnownSubmitter).length;
  const departmentTotal = rankingRecords.length;

  const roadmapBacklog = filtered.filter((r) => r.allapot === "Roadmap backlog").length;
  const innolabBacklog = filtered.filter((r) => r.allapot === "InnoLab FL backlog").length;
  const suspended = filtered.filter((r) => r.allapot === "Felfüggesztve").length;

  return (
    <div className="pt-6 space-y-6">
      {/* KPI row 1 - dark cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="kpi-grid">
        <KPICard testid="kpi-total" index={0} label="Beérkezett ötletek" value={s.total} icon={Lightbulb} trend={s.delta.total} hint={deltaHintSuffix} />
        <KPICard testid="kpi-open" index={1} label="Nyitott ötletek" value={s.open} icon={Clock} trend={s.delta.open} hint={`${s.backlog} backlogban`} />
        <KPICard testid="kpi-done" index={2} label="Megvalósítva" value={s.done} icon={CheckCircle2} trend={s.delta.done} hint={`${s.implementationRate.toFixed(1)}% arány`} />
        <KPICard testid="kpi-rejected" index={3} label="Elutasítva" value={s.rejected} icon={XCircle} trend={s.delta.rejected} hint={`${(100 - s.approvalRate).toFixed(1)}% elutasítási arány`} />
      </div>

      {/* KPI row 2 - státusz specifikus csempék */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4" data-testid="kpi-grid-status">
        <KPICard testid="kpi-roadmap-backlog" index={0} variant="light" label="Roadmap backlog" value={roadmapBacklog} icon={ListChecks} hint="Roadmap-en várakozók" />
        <KPICard testid="kpi-innolab-backlog" index={1} variant="light" label="InnoLab FL backlog" value={innolabBacklog} icon={LayoutList} hint="InnoLab csapatnál" />
        <KPICard testid="kpi-suspended" index={2} variant="light" label="Felfüggesztve" value={suspended} icon={PauseCircle} hint="Ideiglenesen szünetel" />
        <KPICard testid="kpi-bottleneck" index={3} variant="light" label="Bottleneck" value={bottleneck ? bottleneck.value : "—"} hint={bottleneck?.name || "Nincs torlódás"} icon={AlertTriangle} />
        <KPICard testid="kpi-aging" index={4} variant="light" label="Nyitott aging" value={s.avgAging ?? "—"} suffix={s.avgAging ? "nap" : ""} icon={Clock} />
        <KPICard testid="kpi-programs" index={5} variant="light" label="Programok" value={namedProgramCount} hint={`${programSplit.filter(p => p.name !== "InnovationLab").length} nevesített program`} icon={Sparkles} />
        <KPICard testid="kpi-innovationlab" index={6} variant="light" label="InnovationLab" value={innovationLabCount} hint="Innováció, nem Programok kategória" icon={FlaskConical} />
      </div>

      {/* KPI row 3 - arányok */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="kpi-grid-secondary">
        <KPICard testid="kpi-approval" index={0} variant="light" label="Jóváhagyási arány" value={s.approvalRate.toFixed(1)} suffix="%" icon={TrendingUp} trend={s.delta.approvalRate} hint={s.delta.approvalRate != null ? "százalékpont" : undefined} />
        <KPICard testid="kpi-implementation" index={1} variant="light" label="Megvalósítási arány" value={s.implementationRate.toFixed(1)} suffix="%" icon={Activity} trend={s.delta.implementationRate} hint={s.delta.implementationRate != null ? "százalékpont" : undefined} />
        <KPICard testid="kpi-avg-processing" index={2} variant="light" label="Átlag feldolgozás" value={s.avgProcessingDays ?? "—"} suffix={s.avgProcessingDays ? "nap" : ""} icon={Timer} />
        <KPICard testid="kpi-backlog-total" index={3} variant="light" label="Backlog összesen" value={s.backlog} icon={Clock} trend={s.delta.backlog} hint="Feldolgozásra vár" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="lg:col-span-2">
          <TrendChart data={trend} total={trendRecords.length} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}>
          <OutcomeFunnel data={outcomes} total={s.total} />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <StatusDonut data={status} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}>
          <CategoryBar data={category} />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <TopList
          testid="top-submitters"
          title="Top ötletleadók"
          subtitle="Legaktívabb bejelentők"
          items={submitters}
          total={submitterTotal}
          icon={Users}
        />
        <TopList
          testid="top-departments"
          title="Top igazgatóságok"
          subtitle="Szervezeti aktivitás"
          items={departments}
          total={departmentTotal}
        />
        <TopList
          testid="top-programs"
          title="Programok"
          subtitle="VIP, Mentor, Futurebet, InnoChallenge…"
          items={programSplit}
          total={filtered.length}
          icon={Sparkles}
        />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="pt-6 space-y-6" data-testid="dashboard-skeleton">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[148px] rounded-3xl bg-lime-100/60" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[110px] rounded-3xl bg-white/70" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[260px] lg:col-span-2 rounded-3xl bg-white/70" />
        <Skeleton className="h-[260px] rounded-3xl bg-white/70" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="pt-24 flex flex-col items-center text-center" data-testid="empty-state">
      <Sparkles className="w-10 h-10 text-lime-600 mb-3" strokeWidth={1.5} />
      <h2 className="font-display text-xl font-semibold text-forest-950">Nincs elérhető adat</h2>
      <p className="text-sm text-forest-700/70 mt-1 max-w-md">
        Nyomd meg a felső „Adatok frissítése” gombot az Excel fájl beolvasásához.
      </p>
    </div>
  );
}
