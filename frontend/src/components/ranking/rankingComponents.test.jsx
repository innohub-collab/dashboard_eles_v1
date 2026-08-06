import { act } from "react";
import { createRoot } from "react-dom/client";
import OriginalIdeaPanel from "./OriginalIdeaPanel";
import PrescreenResults from "./PrescreenResults";
import ProcessingSummary from "./ProcessingSummary";
import RankingTable from "./RankingTable";

const status = {
  eligibleCount: 4,
  processedCount: 4,
  newCount: 0,
  passedCount: 1,
  closureRecommendedCount: 1,
  clarificationCount: 1,
  humanReviewCount: 1,
  failedCount: 1,
  rescoreCompatibleCount: 1,
  initialProcessing: {
    totalCount: 8,
    processedCount: 4,
    remainingCount: 4,
    newCount: 3,
    failedCount: 1,
    progressPercent: 50,
  },
  weightRescore: { required: false, configVersion: 1, compatibleCount: 1 },
  reevaluation: {
    totalCount: 4,
    processedCount: 4,
    remainingCount: 0,
    errorCount: 0,
    currentBatch: 1,
    batchCount: 1,
    complete: true,
  },
};

describe("ranking component behavior", () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("summary cards activate the corresponding accessible section navigation", () => {
    const onNavigate = jest.fn();
    act(() => {
      root.render(<ProcessingSummary status={status} onNavigate={onNavigate} />);
    });

    const closeCard = container.querySelector('button[aria-label="Lezárásra javasolt szekció megnyitása"]');
    const reviewCard = container.querySelector('button[aria-label="Emberi felülvizsgálat szekció megnyitása"]');
    expect(closeCard).not.toBeNull();
    expect(reviewCard).not.toBeNull();

    act(() => closeCard.click());
    act(() => reviewCard.click());
    expect(onNavigate.mock.calls).toEqual([["prescreen-close"], ["prescreen-human-review"]]);
  });

  test("original idea panel renders the actual description and expected result as text", () => {
    act(() => {
      root.render(<OriginalIdeaPanel idea={{ ideaId: "IDEA-1", title: "Tesztötlet", description: "Eredeti leírás", expectedResult: "Eredeti elvárt eredmény" }} />);
    });

    expect(container.textContent).toContain("Eredeti leírás");
    expect(container.textContent).toContain("Eredeti elvárt eredmény");
  });

  test("redundant global processing detail block is not rendered", () => {
    act(() => {
      root.render(<ProcessingSummary status={status} onNavigate={jest.fn()} />);
    });

    expect(container.querySelector('[data-testid="initial-processing-progress"]')).toBeNull();
  });

  test("active batch shows item progress, current phase and measured ETA next to the controls", () => {
    const runningStatus = {
      ...status,
      batchProcessing: {
        state: "RUNNING",
        totalCount: 5,
        completedCount: 2,
        successfulCount: 2,
        failedCount: 0,
        currentItemNumber: 3,
        phase: "EVALUATION",
        elapsedSeconds: 65,
        estimatedRemainingSeconds: 125,
      },
    };
    act(() => {
      root.render(<ProcessingSummary status={runningStatus} canProcess processing onProcess={jest.fn()} onNavigate={jest.fn()} />);
    });

    const progress = container.querySelector('[data-testid="active-batch-progress"]');
    expect(progress).not.toBeNull();
    expect(progress.textContent).toContain("2/5 ötlet elkészült");
    expect(progress.textContent).toContain("3. ötlet pontozása folyamatban");
    expect(progress.textContent).toContain("Eltelt idő: 1 p 5 mp");
    expect(progress.textContent).toContain("Becsült hátralévő idő: kb. 3 perc");
    expect(progress.querySelector('[role="progressbar"]').getAttribute("aria-valuenow")).toBe("40");
  });

  test("weight rescore is enabled only while a saved weight change is pending", () => {
    const onRescore = jest.fn();
    act(() => {
      root.render(<ProcessingSummary status={status} canRescore onRescore={onRescore} onNavigate={jest.fn()} />);
    });
    let button = container.querySelector('[data-testid="ranking-rescore-all"]');
    expect(button.disabled).toBe(true);

    act(() => {
      root.render(<ProcessingSummary status={{ ...status, weightRescore: { required: true, configVersion: 2, compatibleCount: 1 } }} canRescore onRescore={onRescore} onNavigate={jest.fn()} />);
    });
    button = container.querySelector('[data-testid="ranking-rescore-all"]');
    expect(button.disabled).toBe(false);
    act(() => button.click());
    expect(onRescore).toHaveBeenCalledTimes(1);
  });

  test("workflow sections are exclusive and the business status badge is not duplicated", () => {
    const items = [
      {
        ideaId: "CLOSE-1",
        title: "Lezárási teszt",
        decision: "CLOSE_RECOMMENDED",
        workflowState: "CLOSE_RECOMMENDED",
        status: "Lezárásra javasolt",
        reason: "Konkrét lezárási indok.",
        confidencePercent: 90,
        processedAt: "2026-08-04T10:00:00Z",
      },
      {
        ideaId: "ACCEPTED-1",
        title: "Elfogadott lezárás",
        decision: "CLOSE_RECOMMENDED",
        workflowState: "CLOSURE_ACCEPTED",
        humanDecision: "ACCEPT_RECOMMENDATION",
        reason: "Elfogadott lezárási indok.",
        confidencePercent: 92,
        processedAt: "2026-08-04T10:00:00Z",
      },
      {
        ideaId: "RANKED-1",
        title: "Továbbengedett ötlet",
        decision: "CLOSE_RECOMMENDED",
        workflowState: "RANKED",
        humanDecision: "ALLOW_SCORING",
        requiresHumanReview: true,
        evaluationCurrent: true,
        reason: "Pontozásra továbbengedve.",
      },
      {
        ideaId: "AI-REVIEW-1",
        title: "Strukturált válasz ellenőrzése",
        decision: "AI_RESPONSE_REVIEW_REQUIRED",
        workflowState: "AI_RESPONSE_REVIEW_REQUIRED",
        reason: "Az AI elérhető volt, de a strukturált válasz nem volt feldolgozható.",
        requiresHumanReview: true,
        evaluationCurrent: false,
        technicalStatus: "REVIEW_REQUIRED",
      },
    ];
    act(() => {
      root.render(<PrescreenResults items={items} />);
    });

    const pendingSection = container.querySelector('[data-testid="prescreen-close"]');
    const acceptedSection = container.querySelector('[data-testid="prescreen-closure-accepted"]');
    expect(pendingSection.textContent).toContain("CLOSE-1");
    expect(pendingSection.textContent).not.toContain("ACCEPTED-1");
    expect(acceptedSection.textContent).toContain("ACCEPTED-1");
    expect(container.textContent).not.toContain("RANKED-1");
    const humanReviewSection = container.querySelector('[data-testid="prescreen-human-review"]');
    expect(humanReviewSection.textContent).toContain("AI-REVIEW-1");
    expect(humanReviewSection.textContent).toContain("AI-válasz ellenőrzendő");
    expect(container.querySelector('[data-testid="prescreen-failed"]').textContent).not.toContain("AI-REVIEW-1");
    const pendingCard = Array.from(pendingSection.querySelectorAll("article span"));
    expect(pendingCard.filter((element) => element.textContent === "Lezárásra javasolt")).toHaveLength(1);
  });

  test("unscored human-review items offer direct scoring and explain reevaluation outcomes", () => {
    const item = {
      ideaId: "REVIEW-ACTION-1",
      title: "Felülvizsgálandó ötlet",
      decision: "AI_RESPONSE_REVIEW_REQUIRED",
      workflowState: "AI_RESPONSE_REVIEW_REQUIRED",
      reason: "A strukturált válasz szakértői döntést igényel.",
      requiresHumanReview: true,
      evaluationCurrent: false,
      currentlyEligible: true,
    };
    act(() => {
      root.render(
        <PrescreenResults
          items={[item]}
          canOverride
          onOverride={jest.fn()}
          canReevaluate
          onReevaluate={jest.fn()}
        />,
      );
    });

    const reviewSection = container.querySelector('[data-testid="prescreen-human-review"]');
    expect(reviewSection.textContent).toContain("REVIEW-ACTION-1");
    expect(Array.from(reviewSection.querySelectorAll("button")).some((button) => button.textContent.includes("Közvetlenül pontozásra"))).toBe(true);

    const reevaluateButton = Array.from(reviewSection.querySelectorAll("button")).find((button) => button.textContent.includes("Újraértékelés"));
    act(() => reevaluateButton.click());
    expect(document.body.textContent).toContain("Az ötlet újra lefut az előszűrésen");
    expect(document.body.textContent).toContain("rangsorba kerül, lezárásra javasolt vagy pontosítandó lesz");
  });

  test("the latest batch additions are visible with their rank and highlighted in the table", () => {
    const items = [
      { ideaId: "OLD-1", title: "Korábbi ötlet", finalRank: 1, aiRank: 1, overallScore: 80 },
      { ideaId: "NEW-1", title: "Frissen rangsorolt ötlet", finalRank: 2, aiRank: 2, overallScore: 70 },
    ];
    act(() => {
      root.render(<RankingTable items={items} highlightedIdeaIds={["NEW-1"]} />);
    });

    const summary = container.querySelector('[data-testid="recently-ranked-summary"]');
    const highlightedRow = container.querySelector('tr[data-recently-ranked="true"]');
    expect(summary.textContent).toContain("#2 · NEW-1 · Frissen rangsorolt ötlet");
    expect(highlightedRow.textContent).toContain("NEW-1");
    expect(highlightedRow.textContent).toContain("Új az utolsó feldolgozásból");
    expect(container.querySelectorAll('tr[data-recently-ranked="true"]')).toHaveLength(1);
  });
});
