import {
  criteriaContentChanged,
  DEFAULT_RANKING_PAGE_SIZE,
  isReevaluationCommentValid,
  moveRankingItem,
  normalizeProcessLimit,
  paginateRanking,
  RANKING_SETTINGS_DEFAULT_OPEN,
  rankingIdeaIds,
  renumberRanking,
  validateCriteria,
} from "./ranking";

const criterion = (overrides = {}) => ({
  id: "value",
  name: "Vállalati érték",
  description: "Leírás",
  weight: 100,
  scoringGuide: "0: nincs érték; 10: kiemelkedő érték",
  active: true,
  ...overrides,
});

describe("ranking order helpers", () => {
  const items = [
    { ideaId: "A", finalRank: 1 },
    { ideaId: "B", finalRank: 2 },
    { ideaId: "C", finalRank: 3 },
  ];

  test("moves an item and creates contiguous final ranks", () => {
    const moved = moveRankingItem(items, 1, -1);
    expect(rankingIdeaIds(moved)).toEqual(["B", "A", "C"]);
    expect(moved.map((item) => item.finalRank)).toEqual([1, 2, 3]);
    expect(items.map((item) => item.ideaId)).toEqual(["A", "B", "C"]);
  });

  test("ignores a move outside the list", () => {
    expect(moveRankingItem(items, 0, -1)).toBe(items);
    expect(moveRankingItem(items, 2, 1)).toBe(items);
  });

  test("renumbers a server list without mutating it", () => {
    const source = [{ ideaId: "A", finalRank: 8 }, { ideaId: "B", finalRank: 9 }];
    expect(renumberRanking(source).map((item) => item.finalRank)).toEqual([1, 2]);
    expect(source[0].finalRank).toBe(8);
  });
});

describe("ranking presentation defaults", () => {
  test("shows 20 ranking items per page by default without changing the full order", () => {
    const source = Array.from({ length: 45 }, (_, index) => ({ ideaId: `IDEA-${index + 1}` }));
    const secondPage = paginateRanking(source, 2);

    expect(DEFAULT_RANKING_PAGE_SIZE).toBe(20);
    expect(secondPage.items.map((item) => item.ideaId)).toEqual(source.slice(20, 40).map((item) => item.ideaId));
    expect(secondPage).toEqual(expect.objectContaining({ page: 2, pageCount: 3, totalCount: 45, startIndex: 20 }));
    expect(source.map((item) => item.ideaId)).toEqual(Array.from({ length: 45 }, (_, index) => `IDEA-${index + 1}`));
  });

  test("opens the evaluation settings collapsed", () => {
    expect(RANKING_SETTINGS_DEFAULT_OPEN).toBe(false);
  });
});

describe("ranking process batch limit", () => {
  test("uses the backend-compatible range of 1 to 20", () => {
    expect(normalizeProcessLimit(0)).toBe(1);
    expect(normalizeProcessLimit(5)).toBe(5);
    expect(normalizeProcessLimit(100)).toBe(20);
  });

  test("uses five as the default for an invalid value", () => {
    expect(normalizeProcessLimit("not-a-number")).toBe(5);
  });
});

describe("explicit reevaluation comment", () => {
  test("requires at least five non-whitespace characters", () => {
    expect(isReevaluationCommentValid("  ok  ")).toBe(false);
    expect(isReevaluationCommentValid("     ")).toBe(false);
    expect(isReevaluationCommentValid("Új adat érkezett")).toBe(true);
  });
});

describe("ranking criteria validation", () => {
  test("accepts positive active weights totaling exactly 100", () => {
    const result = validateCriteria([
      criterion({ id: "a", name: "A", weight: 40 }),
      criterion({ id: "b", name: "B", weight: 60 }),
    ]);
    expect(result).toEqual(expect.objectContaining({ valid: true, totalWeight: 100 }));
  });

  test("rejects an invalid total", () => {
    const result = validateCriteria([criterion({ weight: 99 })]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("pontosan 100%");
  });

  test("rejects non-positive active weights", () => {
    expect(validateCriteria([criterion({ weight: 0 })]).valid).toBe(false);
    expect(validateCriteria([criterion({ weight: -10 })]).valid).toBe(false);
  });

  test("rejects duplicate ids and missing required text", () => {
    const result = validateCriteria([
      criterion({ id: "same", weight: 50 }),
      criterion({ id: "same", name: "", scoringGuide: "", weight: 50 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("Duplikált");
    expect(result.errors.join(" ")).toContain("név nem lehet üres");
    expect(result.errors.join(" ")).toContain("scoring guide");
  });

  test("does not require a positive weight for an inactive criterion", () => {
    const result = validateCriteria([
      criterion({ id: "active", weight: 100 }),
      criterion({ id: "inactive", weight: 0, active: false }),
    ]);
    expect(result.valid).toBe(true);
  });
});

describe("criteria version warning", () => {
  test("weight-only changes do not count as content changes", () => {
    const original = [criterion()];
    expect(criteriaContentChanged(original, [criterion({ weight: 90 })])).toBe(false);
  });

  test("name, guide or active-state changes count as methodology changes", () => {
    const original = [criterion()];
    expect(criteriaContentChanged(original, [criterion({ name: "Új név" })])).toBe(true);
    expect(criteriaContentChanged(original, [criterion({ scoringGuide: "Új útmutató" })])).toBe(true);
    expect(criteriaContentChanged(original, [criterion({ active: false })])).toBe(true);
  });
});
