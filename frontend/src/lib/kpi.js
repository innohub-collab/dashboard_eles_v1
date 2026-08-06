import { daysBetween, monthKey } from "./format";

export const OUTCOME_COLORS = {
  Nyitott: "#F59E0B",
  Megvalósítva: "#8BC34A",
  Elutasítva: "#EF4444",
  Lezárva: "#6B7280",
};

export const STATUS_COLORS = {
  Rögzítve: "#3B82F6",
  "Értékelés alatt": "#F59E0B",
  "Roadmap backlog": "#8B5CF6",
  "InnoLab FL backlog": "#0EA5E9",
  "Megvalósítás alatt": "#8BC34A",
  Felfüggesztve: "#94A3B8",
  Lezárva: "#33691E",
};

export const PROGRAM_TAGS = ["VIP", "Mentor", "Futurebet", "Futurebet2.0", "InnoChallenge"];

export function programName(rec) {
  if (!rec) return null;
  const tags = (rec.cimkek || []);
  for (const t of tags) {
    const found = PROGRAM_TAGS.find((p) => p.toLowerCase() === t.toLowerCase());
    if (found) return found;
  }
  return null;
}

export function isNamedProgram(rec) {
  return programName(rec) !== null;
}

export function isProgram(rec) {
  return isNamedProgram(rec) || isInnovationLab(rec);
}

export function isInnovationLab(rec) {
  return !!rec &&
    rec.feladattipus === "Innováció" &&
    rec.customer_request_type !== "Programok";
}

export function hasKnownSubmitter(rec) {
  return !!rec?.bejelento && !["Unassigned", "Ismeretlen"].includes(rec.bejelento);
}

export function isProgramCustomerRequest(rec) {
  return String(rec?.customer_request_type || "").trim().toLowerCase() === "programok";
}

export function recordsForRankings(records) {
  return records.filter((rec) => !isProgramCustomerRequest(rec));
}

export function recordsForMonthlyTrend(records) {
  return recordsForRankings(records);
}

export function computeSummary(records) {
  const total = records.length;
  const open = records.filter((r) => r.outcome === "Nyitott").length;
  const done = records.filter((r) => r.outcome === "Megvalósítva").length;
  const rejected = records.filter((r) => r.outcome === "Elutasítva").length;
  const closed = records.filter((r) => r.outcome === "Lezárva").length;
  const backlog = records.filter((r) =>
    ["Roadmap backlog", "InnoLab FL backlog", "Rögzítve", "Értékelés alatt"].includes(r.allapot)
  ).length;

  const decided = done + rejected;
  const approvalRate = decided ? (done / decided) * 100 : 0;
  const implementationRate = total ? (done / total) * 100 : 0;

  // Avg processing time (created -> updated) for closed items
  const closedDurations = records
    .filter((r) => r.allapot === "Lezárva" && r.letrehozva && r.frissitve)
    .map((r) => daysBetween(r.letrehozva, r.frissitve))
    .filter((d) => d !== null && d >= 0);
  const avgProcessingDays = closedDurations.length
    ? Math.round(closedDurations.reduce((a, b) => a + b, 0) / closedDurations.length)
    : null;

  // Aging: open items' current age in days
  const openAges = records
    .filter((r) => r.outcome === "Nyitott" && r.letrehozva)
    .map((r) => daysBetween(r.letrehozva));
  const avgAging = openAges.length
    ? Math.round(openAges.reduce((a, b) => a + b, 0) / openAges.length)
    : null;

  return {
    total,
    open,
    done,
    rejected,
    closed,
    backlog,
    approvalRate,
    implementationRate,
    avgProcessingDays,
    avgAging,
  };
}

// Compute deltas vs previous period.
// windowMonths: size of current window (from now backwards). If null → uses full dataset.
// Compares current window vs the equally sized preceding window.
export function computeSummaryWithDelta(records, windowMonths = null) {
  const now = new Date();

  let currentSet;
  let previousSet;
  if (windowMonths && windowMonths > 0) {
    const currStart = new Date(now);
    currStart.setMonth(currStart.getMonth() - windowMonths);
    const prevStart = new Date(currStart);
    prevStart.setMonth(prevStart.getMonth() - windowMonths);

    currentSet = records.filter((r) => r.letrehozva && new Date(r.letrehozva) >= currStart);
    previousSet = records.filter((r) => {
      if (!r.letrehozva) return false;
      const d = new Date(r.letrehozva);
      return d >= prevStart && d < currStart;
    });
  } else {
    // "Teljes időszak" – hasonlítsuk össze az utolsó 3 hónapot az előző 3 hónappal
    const w = 3;
    const currStart = new Date(now);
    currStart.setMonth(currStart.getMonth() - w);
    const prevStart = new Date(currStart);
    prevStart.setMonth(prevStart.getMonth() - w);

    currentSet = records.filter((r) => r.letrehozva && new Date(r.letrehozva) >= currStart);
    previousSet = records.filter((r) => {
      if (!r.letrehozva) return false;
      const d = new Date(r.letrehozva);
      return d >= prevStart && d < currStart;
    });
  }

  const summary = computeSummary(records);
  const curr = computeSummary(currentSet);
  const prev = computeSummary(previousSet);

  const pct = (a, b) => {
    if (!b && !a) return null;
    if (!b) return 100;
    return Math.round(((a - b) / b) * 100);
  };

  return {
    ...summary,
    delta: {
      total: pct(curr.total, prev.total),
      open: pct(curr.open, prev.open),
      done: pct(curr.done, prev.done),
      rejected: pct(curr.rejected, prev.rejected),
      approvalRate:
        curr.approvalRate || prev.approvalRate
          ? Math.round(curr.approvalRate - prev.approvalRate)
          : null,
      implementationRate:
        curr.implementationRate || prev.implementationRate
          ? Math.round(curr.implementationRate - prev.implementationRate)
          : null,
      backlog: pct(curr.backlog, prev.backlog),
    },
    _comparison: {
      currentCount: currentSet.length,
      previousCount: previousSet.length,
      windowMonths: windowMonths || 3,
    },
  };
}

export function groupBy(records, key) {
  const map = new Map();
  for (const r of records) {
    const k = r[key] || "Ismeretlen";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function statusBreakdown(records) {
  return groupBy(records, "allapot");
}

export function categoryBreakdown(records) {
  return groupBy(records, "customer_request_type");
}

export function outcomeBreakdown(records) {
  return groupBy(records, "outcome");
}

export function monthlyTrend(records) {
  const map = new Map();
  for (const r of records) {
    const k = monthKey(r.letrehozva);
    if (!k) continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  const arr = [...map.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-18); // Only last 18 months for readability

  // Attach month-over-month delta (percent) — first entry gets null
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) {
      arr[i].delta = null;
      continue;
    }
    const prev = arr[i - 1].count;
    const curr = arr[i].count;
    if (!prev && !curr) arr[i].delta = null;
    else if (!prev) arr[i].delta = 100;
    else arr[i].delta = Math.round(((curr - prev) / prev) * 100);
  }
  return arr;
}

export function topSubmitters(records, limit = 5) {
  const filtered = recordsForRankings(records).filter(hasKnownSubmitter);
  return groupBy(filtered, "bejelento").slice(0, limit);
}

export function topDepartments(records, limit = 5) {
  return groupBy(recordsForRankings(records), "igazgatosag").slice(0, limit);
}

export function topUnits(records, limit = 5) {
  return groupBy(recordsForRankings(records), "szervezeti_egyseg").slice(0, limit);
}

export function programBreakdown(records) {
  const map = new Map();
  for (const r of records) {
    const name = programName(r);
    if (name) map.set(name, (map.get(name) || 0) + 1);
    if (isInnovationLab(r)) {
      map.set("InnovationLab", (map.get("InnovationLab") || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function bottleneckStatus(records) {
  const open = records.filter((r) => r.outcome === "Nyitott");
  const counts = groupBy(open, "allapot");
  return counts[0] || null;
}
