export const PRESCREEN_STATUS = Object.freeze({
  PENDING: { label: "Előszűrésre vár", tone: "neutral" },
  PASS: { label: "Pontozásra átment", tone: "success" },
  CLOSE_RECOMMENDED: { label: "Lezárásra javasolt", tone: "warning" },
  NEEDS_CLARIFICATION: { label: "Pontosítandó", tone: "info" },
  AI_RESPONSE_REVIEW_REQUIRED: { label: "AI-válasz ellenőrzendő", tone: "neutral" },
  FAILED: { label: "Előszűrés sikertelen", tone: "danger" },
});

export const CONFIDENCE_LABELS = Object.freeze({
  low: "Alacsony",
  medium: "Közepes",
  high: "Magas",
});

const WEIGHT_TOLERANCE = 0.0001;
const MAX_PROCESS_LIMIT = 20;
export const DEFAULT_RANKING_PAGE_SIZE = 20;
export const RANKING_SETTINGS_DEFAULT_OPEN = false;

export function normalizeProcessLimit(value, fallback = 5) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_PROCESS_LIMIT, parsed));
}

export function isReevaluationCommentValid(comment) {
  return String(comment || "").trim().length >= 5;
}

export function renumberRanking(items) {
  return (items || []).map((item, index) => ({ ...item, finalRank: index + 1 }));
}

export function moveRankingItem(items, index, direction) {
  const target = index + direction;
  if (!Array.isArray(items) || index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items;
  }

  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return renumberRanking(next);
}

export function rankingIdeaIds(items) {
  return (items || []).map((item) => item.ideaId);
}

export function paginateRanking(items, page, pageSize = DEFAULT_RANKING_PAGE_SIZE) {
  const source = Array.isArray(items) ? items : [];
  const safePageSize = Math.max(1, Math.trunc(Number(pageSize)) || DEFAULT_RANKING_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(source.length / safePageSize));
  const safePage = Math.max(1, Math.min(Math.trunc(Number(page)) || 1, pageCount));
  const startIndex = (safePage - 1) * safePageSize;
  return {
    items: source.slice(startIndex, startIndex + safePageSize),
    page: safePage,
    pageCount,
    pageSize: safePageSize,
    startIndex,
    totalCount: source.length,
  };
}

export function validateCriteria(criteria) {
  const errors = [];
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return { valid: false, errors: ["Legalább egy kritérium szükséges."], totalWeight: 0 };
  }

  const ids = new Set();
  criteria.forEach((criterion, index) => {
    const displayIndex = index + 1;
    const id = String(criterion?.id || "").trim();
    const name = String(criterion?.name || "").trim();
    const scoringGuide = String(criterion?.scoringGuide || "").trim();

    if (!id) errors.push(`${displayIndex}. kritérium: hiányzó azonosító.`);
    if (id && ids.has(id)) errors.push(`Duplikált kritériumazonosító: ${id}.`);
    if (id) ids.add(id);
    if (!name) errors.push(`${displayIndex}. kritérium: a név nem lehet üres.`);
    if (!scoringGuide) errors.push(`${displayIndex}. kritérium: a scoring guide nem lehet üres.`);

    if (criterion?.active !== false) {
      const weight = Number(criterion?.weight);
      if (!Number.isFinite(weight) || weight <= 0) {
        errors.push(`${name || displayIndex + ". kritérium"}: az aktív súlynak pozitív számnak kell lennie.`);
      }
    }
  });

  const totalWeight = criteria
    .filter((criterion) => criterion?.active !== false)
    .reduce((sum, criterion) => sum + (Number.isFinite(Number(criterion?.weight)) ? Number(criterion.weight) : 0), 0);

  if (Math.abs(totalWeight - 100) > WEIGHT_TOLERANCE) {
    errors.push(`Az aktív súlyok összege pontosan 100% legyen (jelenleg ${formatWeight(totalWeight)}%).`);
  }

  return { valid: errors.length === 0, errors, totalWeight };
}

export function criteriaContentChanged(original, current) {
  const source = new Map((original || []).map((criterion) => [criterion.id, criterion]));
  if (source.size !== (current || []).length) return true;

  return (current || []).some((criterion) => {
    const previous = source.get(criterion.id);
    if (!previous) return true;
    return (
      String(previous.name || "").trim() !== String(criterion.name || "").trim() ||
      String(previous.description || "").trim() !== String(criterion.description || "").trim() ||
      String(previous.scoringGuide || "").trim() !== String(criterion.scoringGuide || "").trim() ||
      (previous.active !== false) !== (criterion.active !== false)
    );
  });
}

export function errorMessage(error, fallback = "A művelet nem sikerült.") {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((item) => item?.msg).filter(Boolean).join("; ") || fallback;
  }
  return error?.message || fallback;
}

function formatWeight(value) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(value);
}
