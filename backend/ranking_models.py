"""Typed contracts and the single source of truth for idea ranking criteria."""

from __future__ import annotations

from enum import Enum
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        alias_generator=_to_camel,
        serialize_by_alias=True,
    )


class PrescreenStatus(str, Enum):
    PENDING = "PENDING"
    PASS = "PASS"
    CLOSE_RECOMMENDED = "CLOSE_RECOMMENDED"
    NEEDS_CLARIFICATION = "NEEDS_CLARIFICATION"
    AI_RESPONSE_REVIEW_REQUIRED = "AI_RESPONSE_REVIEW_REQUIRED"
    FAILED = "FAILED"


class Confidence(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class HumanDecision(str, Enum):
    ALLOW_SCORING = "ALLOW_SCORING"
    HOLD = "HOLD"
    ACCEPT_RECOMMENDATION = "ACCEPT_RECOMMENDATION"


PRESCREEN_PROMPT_VERSION = "idea-prescreen-v3"
EVALUATION_PROMPT_VERSION = "idea-evaluation-v1"
DEFAULT_CRITERIA_VERSION = "idea-ranking-criteria-v1"
DEFAULT_SCORING_VERSION = "idea-ranking-scoring-v1"
MODEL_CONFIGURATION_VERSION = "gpt-5.6-luna-structured-v3"


class CriterionConfig(StrictModel):
    id: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=5, max_length=2_000)
    weight: float = Field(ge=0, le=100)
    scoring_guide: str = Field(min_length=5, max_length=2_000)
    active: bool = True


DEFAULT_CRITERIA: tuple[CriterionConfig, ...] = (
    CriterionConfig(
        id="problem_foundation",
        name="Probléma és igény megalapozottsága",
        description=(
            "A probléma vagy lehetőség világossága, az érintettek azonosítása és "
            "a tényszerű alátámasztás minősége."
        ),
        weight=15,
        scoring_guide="0: nincs felismerhető igény; 5: részben érthető; 10: világos és érdemben alátámasztott.",
    ),
    CriterionConfig(
        id="stakeholder_value",
        name="Vállalati, játékos-, ügyfél- vagy munkavállalói érték",
        description=(
            "A játékosoknak, ügyfeleknek, munkavállalóknak vagy a vállalatnak "
            "teremtett konkrét, közvetlen vagy közvetett érték."
        ),
        weight=20,
        scoring_guide="0: nem azonosítható érték; 5: valószínű, de részben alátámasztott; 10: jelentős és konkrét érték.",
    ),
    CriterionConfig(
        id="strategic_fit",
        name="Stratégiai illeszkedés és innovációs relevancia",
        description="A vállalati működéshez, célokhoz és innovációs feladatokhoz való illeszkedés.",
        weight=10,
        scoring_guide="0: nem releváns; 5: részleges illeszkedés; 10: erős, világos stratégiai és innovációs relevancia.",
    ),
    CriterionConfig(
        id="feasibility",
        name="Megvalósíthatóság és integrálhatóság",
        description=(
            "Technikai, üzleti és működési megvalósíthatóság, függőségek, "
            "integráció, idő- és erőforrásigény."
        ),
        weight=15,
        scoring_guide="0: nem megvalósítható; 5: jelentős bizonytalanságokkal megvalósítható; 10: reálisan és jól integrálható.",
    ),
    CriterionConfig(
        id="economic_impact",
        name="Gazdasági hatás és erőforrás-arányosság",
        description="A költség–haszon arány, beruházási és működtetési igény, valamint a megtérülési logika.",
        weight=10,
        scoring_guide="0: aránytalan vagy ismeretlen; 5: részben megalapozott; 10: kedvező és hitelesen alátámasztott arány.",
    ),
    CriterionConfig(
        id="risk_manageability",
        name="Felelős játékszervezés, megfelelőség, adatvédelem, biztonság és integritás kezelhetősége",
        description=(
            "A játékosvédelmi, jogi, adatvédelmi, információbiztonsági, csalási, "
            "integritási és reputációs kockázatok kezelhetősége."
        ),
        weight=15,
        scoring_guide="0: kritikus vagy nem kezelhető kockázat; 5: szakértői vizsgálattal kezelhető; 10: alacsony vagy jól kontrollált kockázat.",
    ),
    CriterionConfig(
        id="evidence_quality",
        name="Mérhetőség, validálhatóság és bizonyítékminőség",
        description="Sikermutatók, pilotálhatóság, ellenőrizhető feltételezések és tényszerű bizonyítékok.",
        weight=10,
        scoring_guide="0: nem mérhető és nincs bizonyíték; 5: részben validálható; 10: jól mérhető és érdemben alátámasztott.",
    ),
    CriterionConfig(
        id="scalability",
        name="Skálázhatóság, fenntarthatóság és újrahasznosíthatóság",
        description="Más területekre való kiterjeszthetőség, hosszú távú fenntarthatóság és újrahasznosíthatóság.",
        weight=5,
        scoring_guide="0: egyszeri és nem fenntartható; 5: korlátozottan bővíthető; 10: jól skálázható és újrahasznosítható.",
    ),
)


ShortText = Annotated[str, Field(max_length=1_000)]

CLOSE_REASON_CATEGORIES = (
    "Szemantikai duplikáció",
    "Már létező megoldás",
    "Nem ötlet",
    "Hatókörön kívüli",
    "Megvalósíthatatlan",
    "Jogi vagy szabályozási akadály",
    "Adatvédelmi vagy biztonsági akadály",
    "Etikai vagy felelős működési akadály",
    "Nincs hozzáadott érték",
    "Elavult",
    "Érvénytelen beküldés",
)

CLARIFICATION_REASON_CATEGORIES = (
    "Nem értelmezhető leírás",
    "Nem derül ki a megoldandó probléma",
    "Nem derül ki a javasolt megoldás",
    "Nem azonosítható a célcsoport",
    "Nem azonosítható a várható eredmény vagy előny",
    "Túl általános megfogalmazás",
    "Belső ellentmondás",
    "Nem egyértelmű megvalósíthatóság",
    "Jogi, adatvédelmi vagy biztonsági vizsgálat szükséges",
    "Nem dönthető el, hogy egy meglévő ötlet duplikációja vagy továbbfejlesztése",
)

BusinessStatus = Literal["Lezárásra javasolt", "Pontosítandó"]
ReasonCategory = Literal[
    "Szemantikai duplikáció",
    "Már létező megoldás",
    "Nem ötlet",
    "Hatókörön kívüli",
    "Megvalósíthatatlan",
    "Jogi vagy szabályozási akadály",
    "Adatvédelmi vagy biztonsági akadály",
    "Etikai vagy felelős működési akadály",
    "Nincs hozzáadott érték",
    "Elavult",
    "Érvénytelen beküldés",
    "Nem értelmezhető leírás",
    "Nem derül ki a megoldandó probléma",
    "Nem derül ki a javasolt megoldás",
    "Nem azonosítható a célcsoport",
    "Nem azonosítható a várható eredmény vagy előny",
    "Túl általános megfogalmazás",
    "Belső ellentmondás",
    "Nem egyértelmű megvalósíthatóság",
    "Jogi, adatvédelmi vagy biztonsági vizsgálat szükséges",
    "Nem dönthető el, hogy egy meglévő ötlet duplikációja vagy továbbfejlesztése",
]


class PrescreenAIResult(StrictModel):
    decision: Literal["PASS", "CLOSE_RECOMMENDED", "NEEDS_CLARIFICATION"]
    status: BusinessStatus | None
    reason_category: ReasonCategory | None
    reason: str = Field(min_length=2, max_length=1_000)
    related_idea_id: str | None = Field(default=None, max_length=120)
    related_idea_title: str | None = Field(default=None, max_length=500)
    clarification_questions: list[
        Annotated[str, Field(min_length=5, max_length=500)]
    ] = Field(default_factory=list, max_length=3)
    confidence: int = Field(ge=0, le=100)
    requires_human_review: bool = False

    @model_validator(mode="after")
    def validate_business_rules(self) -> "PrescreenAIResult":
        sentence_count = len(
            [
                item
                for item in re.split(r"(?<=[.!?])\s+", self.reason.strip())
                if item.strip()
            ]
        )
        if sentence_count > 3:
            raise ValueError("Az előszűrési indoklás legfeljebb 3 mondat lehet.")

        related_pair_complete = bool(self.related_idea_id) == bool(
            self.related_idea_title
        )
        if not related_pair_complete:
            raise ValueError(
                "A kapcsolódó ötlet azonosítója és címe csak együtt adható meg."
            )

        if self.decision == "PASS":
            if self.status is not None or self.reason_category is not None:
                raise ValueError("PASS esetén a státusz és az indokkategória null.")
            if self.clarification_questions:
                raise ValueError("PASS esetén nem menthetők pontosítási kérdések.")
            if self.related_idea_id or self.related_idea_title:
                raise ValueError("PASS esetén nem menthető kapcsolódó ötlet.")
            return self

        if self.decision == "CLOSE_RECOMMENDED":
            if self.status != "Lezárásra javasolt":
                raise ValueError(
                    "CLOSE_RECOMMENDED esetén a státusz Lezárásra javasolt."
                )
            if self.reason_category not in CLOSE_REASON_CATEGORIES:
                raise ValueError("Nem engedélyezett lezárási indokkategória.")
            if self.confidence < 85:
                raise ValueError(
                    "Lezárási javaslat csak legalább 85% bizonyossággal menthető."
                )
            if self.clarification_questions:
                raise ValueError(
                    "Lezárási javaslatnál nem menthetők pontosítási kérdések."
                )
            if self.reason_category == "Szemantikai duplikáció" and not (
                self.related_idea_id and self.related_idea_title
            ):
                raise ValueError(
                    "Szemantikai duplikációnál kötelező a kapcsolódó ötlet azonosítója és címe."
                )
            return self

        if self.status != "Pontosítandó":
            raise ValueError("NEEDS_CLARIFICATION esetén a státusz Pontosítandó.")
        if self.reason_category not in CLARIFICATION_REASON_CATEGORIES:
            raise ValueError("Nem engedélyezett pontosítási indokkategória.")
        if not 1 <= len(self.clarification_questions) <= 3:
            raise ValueError("Pontosításnál 1–3 konkrét kérdés kötelező.")
        normalized_questions = [
            " ".join(question.casefold().split())
            for question in self.clarification_questions
        ]
        if len(set(normalized_questions)) != len(normalized_questions):
            raise ValueError("A pontosítási kérdések nem ismétlődhetnek.")
        if any(not question.rstrip().endswith("?") for question in normalized_questions):
            raise ValueError("Minden pontosítási kérdés kérdőjellel záródjon.")
        forbidden_templates = (
            "adjon meg több információt",
            "adjon meg további információt",
            "mely konkrét tény vagy szakértői állásfoglalás szükséges a döntéshez",
        )
        if any(
            any(template in question for template in forbidden_templates)
            for question in normalized_questions
        ):
            raise ValueError(
                "A pontosítási kérdés nem lehet általános vagy legacy sablonszöveg."
            )
        if self.confidence >= 85:
            raise ValueError(
                "85% vagy magasabb bizonyosság nem menthető pontosítási döntésként."
            )
        return self


class CriterionAIResult(StrictModel):
    criterion_id: str = Field(min_length=2, max_length=80)
    score: float = Field(ge=0, le=10)
    confidence: Confidence
    rationale: str = Field(min_length=2, max_length=1_500)
    evidence: list[ShortText] = Field(max_length=10)
    unsupported_claims: list[ShortText] = Field(max_length=10)
    missing_information: list[ShortText] = Field(max_length=10)
    risks: list[ShortText] = Field(max_length=10)


class EvaluationAIResult(StrictModel):
    overall_rationale: str = Field(min_length=10, max_length=2_500)
    summary: str = Field(min_length=2, max_length=1_500)
    strengths: list[ShortText] = Field(max_length=10)
    weaknesses: list[ShortText] = Field(max_length=10)
    criteria: list[CriterionAIResult] = Field(min_length=1, max_length=20)
    next_steps: list[ShortText] = Field(max_length=10)
    critical_risk_flags: list[ShortText] = Field(max_length=10)
    mandatory_human_review: Literal[True]


class ProcessRankingRequest(StrictModel):
    limit: int = Field(default=5, ge=1, le=20)
    retry_failed: bool = False


class PrescreenOverrideRequest(StrictModel):
    decision: HumanDecision
    comment: str = Field(min_length=5, max_length=2_000)


class RankingOrderRequest(StrictModel):
    idea_ids: list[Annotated[str, Field(min_length=1, max_length=120)]] = Field(
        max_length=2_000
    )
    ranking_version: int = Field(ge=1)


class RankingVersionRequest(StrictModel):
    ranking_version: int = Field(ge=1)


class CriteriaUpdateRequest(StrictModel):
    criteria: list[CriterionConfig] = Field(min_length=1, max_length=30)
    config_version: int = Field(ge=1)


class CriteriaResetRequest(StrictModel):
    config_version: int = Field(ge=1)


class ReevaluateRequest(StrictModel):
    comment: str = Field(min_length=5, max_length=2_000)


class RescoreAllRequest(StrictModel):
    config_version: int = Field(ge=1)


class FullReevaluationRequest(StrictModel):
    limit: int = Field(default=20, ge=1, le=20)
    retry_failed: bool = False


class ResetAllRankingRequest(StrictModel):
    confirmation: Literal["TELJES ÚJRAKEZDÉS"]
    reason: str = Field(min_length=5, max_length=2_000)
