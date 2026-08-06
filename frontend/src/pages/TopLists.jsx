import { useData } from "@/context/DataContext";
import {
  topSubmitters,
  topDepartments,
  topUnits,
  categoryBreakdown,
  programBreakdown,
  hasKnownSubmitter,
  isProgram,
  recordsForRankings,
} from "@/lib/kpi";
import TopList from "@/components/TopList";
import { Users, Building2, Tag, Sparkles } from "lucide-react";

export default function TopLists() {
  const { filtered } = useData();
  const rankingRecords = recordsForRankings(filtered);
  const submitterTotal = rankingRecords.filter(hasKnownSubmitter).length;
  const programTotal = filtered.filter(isProgram).length;

  return (
    <div className="pt-6 space-y-6" data-testid="toplists-page">
      <div>
        <h2 className="font-display text-2xl font-semibold text-forest-950">Toplisták</h2>
        <p className="text-sm text-forest-700/70 mt-1">Legaktívabb szereplők és kategóriák</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TopList title="Top ötletleadók" subtitle="Legtöbb bejelentés" items={topSubmitters(filtered, 10)} total={submitterTotal} icon={Users} testid="tl-submitters" />
        <TopList title="Top igazgatóságok" subtitle="Szervezeti aktivitás" items={topDepartments(filtered, 10)} total={rankingRecords.length} icon={Building2} testid="tl-departments" />
        <TopList title="Top szervezeti egységek" subtitle="Beérkezés forrása" items={topUnits(filtered, 10)} total={rankingRecords.length} icon={Building2} testid="tl-units" />
        <TopList title="Kategóriák" subtitle="Beérkezés típusa" items={categoryBreakdown(filtered).slice(0, 10)} total={filtered.length} icon={Tag} testid="tl-categories" />
        <TopList title="Programok" subtitle="VIP / Mentor / Futurebet / InnoChallenge / InnovationLab" items={programBreakdown(filtered)} total={programTotal} icon={Sparkles} testid="tl-programs" />
      </div>
    </div>
  );
}
