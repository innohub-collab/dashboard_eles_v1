"""Synthetic ranking fixtures and a network-free AI gateway for tests."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Sequence

from ranking_models import (
    CriterionAIResult,
    CriterionConfig,
    EvaluationAIResult,
    PrescreenAIResult,
)
from ranking_service import DuplicateCandidate, duplicate_content_hash


def make_idea(idea_id: str, **changes: Any) -> dict[str, Any]:
    """Return a complete, eligible synthetic idea unless explicitly overridden."""

    record: dict[str, Any] = {
        "id": idea_id,
        "feladattipus": "Innováció",
        "customer_request_type": "Munkahelyem",
        "allapot": "Rögzítve",
        "cim": f"Digitális folyamatfejlesztés {idea_id}",
        "leiras": (
            f"A {idea_id} azonosítójú javaslat egy kézi vállalati folyamat "
            "mérhető és ellenőrizhető egyszerűsítését célozza."
        ),
        "elvart_eredmeny": f"Rövidebb átfutási idő és kevesebb hiba ({idea_id}).",
        "igazgatosag": "Informatikai Igazgatóság",
        "szervezeti_egyseg": "Innovációs csapat",
        "erintett_terulet": "Belső működés",
        "prioritas": "Közepes",
        "komplexitas": 5,
        "fejlesztes_becsult_merete": 3,
        "egyedi": "A beküldő szerint egyedi.",
        "letrehozva": "2026-01-01T10:00:00+00:00",
    }
    record.update(changes)
    return record


class CountingGateway:
    """Deterministic RankingAIGateway substitute with observable calls."""

    model = "fake-ranking-model"

    def __init__(
        self,
        *,
        decisions: dict[str, str] | None = None,
        duplicate_ids: dict[str, list[str]] | None = None,
        scores_by_idea: dict[str, float | dict[str, float]] | None = None,
        fail_prescreen_once: set[str] | None = None,
        fail_evaluate_once: set[str] | None = None,
    ) -> None:
        self.decisions = decisions or {}
        self.duplicate_ids = duplicate_ids or {}
        self.scores_by_idea = scores_by_idea or {}
        self.fail_prescreen_once = set(fail_prescreen_once or set())
        self.fail_evaluate_once = set(fail_evaluate_once or set())
        self._failed_prescreens: set[str] = set()
        self._failed_evaluations: set[str] = set()
        self.prescreen_calls: list[dict[str, Any]] = []
        self.evaluation_calls: list[dict[str, Any]] = []

    def prescreen(
        self,
        record: dict[str, Any],
        candidates: Sequence[DuplicateCandidate],
    ) -> tuple[PrescreenAIResult, str]:
        idea_id = str(record["id"])
        self.prescreen_calls.append(
            {
                "record": deepcopy(record),
                "candidateIds": [item.idea_id for item in candidates],
                "candidates": [deepcopy(item.record) for item in candidates],
            }
        )
        if (
            idea_id in self.fail_prescreen_once
            and idea_id not in self._failed_prescreens
        ):
            self._failed_prescreens.add(idea_id)
            raise RuntimeError("synthetic prescreen failure")

        legacy_decision = self.decisions.get(idea_id)
        decision = {
            "PASSED_TO_SCORING": "PASS",
            "CLOSURE_RECOMMENDED": "CLOSE_RECOMMENDED",
            "REJECTION_RECOMMENDED": "CLOSE_RECOMMENDED",
            "HUMAN_REVIEW_REQUIRED": "NEEDS_CLARIFICATION",
        }.get(legacy_decision, legacy_decision)
        related = list(self.duplicate_ids.get(idea_id, []))
        if decision is None:
            exact_hash = duplicate_content_hash(record)
            exact_candidate = next(
                (
                    item
                    for item in candidates
                    if exact_hash and duplicate_content_hash(item.record) == exact_hash
                ),
                None,
            )
            if exact_candidate is not None:
                decision = "CLOSE_RECOMMENDED"
                related = [exact_candidate.idea_id]
        decision = decision or "PASS"
        candidate_map = {item.idea_id: item.record for item in candidates}
        related_id = related[0] if related else None
        related_title = (
            str(candidate_map.get(related_id, {}).get("cim") or "Kapcsolódó tesztötlet")
            if related_id
            else None
        )
        result = PrescreenAIResult(
            decision=decision,
            status=(
                "Lezárásra javasolt"
                if decision == "CLOSE_RECOMMENDED"
                else "Pontosítandó" if decision == "NEEDS_CLARIFICATION" else None
            ),
            reasonCategory=(
                "Szemantikai duplikáció"
                if decision == "CLOSE_RECOMMENDED" and related_id
                else (
                    "Nem ötlet"
                    if decision == "CLOSE_RECOMMENDED"
                    else (
                        "Nem egyértelmű megvalósíthatóság"
                        if decision == "NEEDS_CLARIFICATION"
                        else None
                    )
                )
            ),
            reason=f"Szintetikus, auditálható előszűrési indok: {idea_id}.",
            relatedIdeaId=related_id,
            relatedIdeaTitle=related_title,
            clarificationQuestions=(
                ["Mely konkrét megvalósítási feltételek igazolhatók az ötlethez?"]
                if decision == "NEEDS_CLARIFICATION"
                else []
            ),
            confidence=90 if decision == "CLOSE_RECOMMENDED" else 70,
            requiresHumanReview=decision == "NEEDS_CLARIFICATION",
        )
        return result, f"prescreen-{len(self.prescreen_calls)}"

    def evaluate(
        self,
        record: dict[str, Any],
        criteria: Sequence[CriterionConfig],
    ) -> tuple[EvaluationAIResult, str]:
        idea_id = str(record["id"])
        self.evaluation_calls.append(
            {
                "record": deepcopy(record),
                "criterionIds": [item.id for item in criteria if item.active],
            }
        )
        if (
            idea_id in self.fail_evaluate_once
            and idea_id not in self._failed_evaluations
        ):
            self._failed_evaluations.add(idea_id)
            raise RuntimeError("synthetic evaluation failure")

        configured = self.scores_by_idea.get(idea_id, 6.0)
        criteria_results = []
        for criterion in criteria:
            if not criterion.active:
                continue
            score = (
                float(configured.get(criterion.id, 5.0))
                if isinstance(configured, dict)
                else float(configured)
            )
            criteria_results.append(
                CriterionAIResult(
                    criterionId=criterion.id,
                    score=score,
                    confidence="medium",
                    rationale=f"Szintetikus indoklás a(z) {criterion.id} kritériumhoz.",
                    evidence=["Ellenőrizhető szintetikus tény."],
                    unsupportedClaims=[],
                    missingInformation=[],
                    risks=[],
                )
            )
        result = EvaluationAIResult(
            overallRationale=(
                "A javaslat fő erőssége a konkrét folyamatcél, korlátja pedig "
                "a szintetikus tesztben jelzett bizonytalanság."
            ),
            summary="Szintetikus, emberi felülvizsgálatot igénylő értékelés.",
            strengths=["Konkrét problémafelvetés."],
            weaknesses=["További validáció szükséges."],
            criteria=criteria_results,
            nextSteps=["Szakértői ellenőrzés."],
            criticalRiskFlags=[],
            mandatoryHumanReview=True,
        )
        return result, f"evaluation-{len(self.evaluation_calls)}"

    @property
    def prescreen_count(self) -> int:
        return len(self.prescreen_calls)

    @property
    def evaluation_count(self) -> int:
        return len(self.evaluation_calls)
