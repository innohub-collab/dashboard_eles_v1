"""SQLite-backed, network-free integration tests for the ranking workflow."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import timedelta
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import server
from ranking_models import CriterionConfig
from ranking_service import (
    AIResultValidationError,
    RankingService,
    RankingValidationError,
    source_data_hash,
)
from ranking_store import RankingStore, StoreConflictError
from tests.ranking_support import CountingGateway, make_idea


@pytest.fixture
def tmp_path():
    """Workspace-local tmp_path replacement for the sandboxed Windows runner.

    The runner's global pytest temp root has an inherited ACL that raises
    WinError 5. TemporaryDirectory keeps every SQLite database isolated while
    preserving the standard path-shaped fixture contract.
    """

    root = Path.cwd() / ".ranking-workflow-tmp"
    root.mkdir(exist_ok=True)
    directory = root / f"case-{uuid4().hex}"
    # pathlib uses the inherited workspace ACL. tempfile/pytest force mode
    # 0o700, which this managed Windows runner cannot reopen.
    directory.mkdir()
    try:
        yield directory
    finally:
        for child in directory.iterdir():
            if child.is_file():
                child.unlink()
        directory.rmdir()
        try:
            root.rmdir()
        except OSError:
            # Another xdist worker may still own a sibling case directory.
            pass


@pytest.fixture
def store(tmp_path):
    return RankingStore(tmp_path / "ranking.sqlite3")


def _service(store: RankingStore, gateway: CountingGateway | None = None):
    selected_gateway = gateway or CountingGateway()
    return RankingService(store, selected_gateway), selected_gateway


def test_semantic_duplicate_screening_closes_only_newer_copy(store):
    shared = {
        "cim": "Automatikus dokumentumfeldolgozás",
        "leiras": (
            "A beérkező dokumentumok tartalmának automatikus felismerése, "
            "besorolása és a megfelelő ügyintézőhöz irányítása."
        ),
        "elvart_eredmeny": "Gyorsabb feldolgozás és kevesebb kézi adminisztráció.",
    }
    old = make_idea("SZRTIL-OLD", letrehozva="2025-01-01", **shared)
    new = make_idea("SZRTIL-NEW", letrehozva="2026-01-01", **shared)
    service, gateway = _service(store)

    result = service.process_batch([new, old], limit=10, retry_failed=False)
    prescreens = {item["idea_id"]: item for item in store.list_current_prescreens()}

    assert result["closureRecommendedCount"] == 1
    assert result["passedCount"] == 1
    assert result["scoredCount"] == 1
    assert prescreens["SZRTIL-NEW"]["prescreen_status"] == "CLOSE_RECOMMENDED"
    assert prescreens["SZRTIL-NEW"]["duplicate_ids"] == ["SZRTIL-OLD"]
    assert prescreens["SZRTIL-OLD"]["prescreen_status"] == "PASS"
    assert [call["record"]["id"] for call in gateway.prescreen_calls] == [
        "SZRTIL-NEW",
        "SZRTIL-OLD",
    ]
    assert gateway.prescreen_calls[0]["candidateIds"] == ["SZRTIL-OLD"]
    assert [call["record"]["id"] for call in gateway.evaluation_calls] == ["SZRTIL-OLD"]


def test_only_passed_prescreen_is_scored_and_source_records_are_not_mutated(store):
    records = [
        make_idea("PASSED"),
        make_idea("REJECTED"),
        make_idea("REVIEW"),
        make_idea("CLOSURE"),
        make_idea("REFERENCE", allapot="Lezárva"),
    ]
    original = deepcopy(records)
    gateway = CountingGateway(
        decisions={
            "PASSED": "PASS",
            "REJECTED": "CLOSE_RECOMMENDED",
            "REVIEW": "NEEDS_CLARIFICATION",
            "CLOSURE": "CLOSE_RECOMMENDED",
        },
        duplicate_ids={"CLOSURE": ["REFERENCE"]},
    )
    service, _ = _service(store, gateway)

    result = service.process_batch(records, limit=10, retry_failed=False)

    assert result == {
        **result,
        "eligibleCount": 4,
        "newPrescreenCount": 4,
        "passedCount": 1,
        "closureRecommendedCount": 2,
        "clarificationCount": 1,
        "humanReviewCount": 1,
        "scoredCount": 1,
        "errorCount": 0,
    }
    assert [call["record"]["id"] for call in gateway.evaluation_calls] == ["PASSED"]
    assert store.get_current_evaluation("PASSED") is not None
    assert store.get_current_evaluation("REJECTED") is None
    assert store.get_current_evaluation("REVIEW") is None
    assert store.get_current_evaluation("CLOSURE") is None
    assert records == original


def test_already_processed_idea_is_skipped_without_new_ai_calls(store):
    record = make_idea("ONCE")
    service, gateway = _service(store)
    first = service.process_batch([record], limit=5, retry_failed=False)
    calls_after_first = (gateway.prescreen_count, gateway.evaluation_count)

    second = service.process_batch([record], limit=5, retry_failed=False)
    status = service.status([record])

    assert first["newPrescreenCount"] == 1
    assert second["newPrescreenCount"] == 0
    assert second["skippedProcessedCount"] == 1
    assert second["affectedIdeaIds"] == []
    assert (gateway.prescreen_count, gateway.evaluation_count) == calls_after_first
    assert status["processedCount"] == 1
    assert status["newCount"] == 0


def test_process_batch_emits_item_level_progress_without_extra_ai_calls(store):
    records = [make_idea("PROGRESS-A"), make_idea("PROGRESS-B")]
    service, gateway = _service(store)
    events = []

    result = service.process_batch(
        records,
        limit=2,
        retry_failed=False,
        progress_callback=events.append,
    )

    assert result["affectedIdeaIds"] == ["PROGRESS-A", "PROGRESS-B"]
    assert events[0] == {
        "state": "RUNNING",
        "completedCount": 0,
        "successfulCount": 0,
        "failedCount": 0,
        "currentItemNumber": 1,
        "currentIdeaId": "PROGRESS-A",
        "phase": "PRESCREEN",
    }
    assert any(
        event["state"] == "RUNNING"
        and event["completedCount"] == 1
        and event["currentItemNumber"] == 1
        for event in events
    )
    assert any(
        event["phase"] == "EVALUATION"
        and event["currentItemNumber"] == 2
        and event["completedCount"] == 1
        for event in events
    )
    assert events[-1]["state"] == "COMPLETED"
    assert events[-1]["totalCount"] == 2
    assert events[-1]["completedCount"] == 2
    assert events[-1]["successfulCount"] == 2
    assert events[-1]["failedCount"] == 0
    assert gateway.prescreen_count == 2
    assert gateway.evaluation_count == 2


def test_runtime_batch_progress_calculates_elapsed_time_percent_and_eta(monkeypatch):
    clock = iter([100.0, 170.0])
    monkeypatch.setattr(server.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(server, "_ranking_batch_progress", None)

    token = server._begin_ranking_progress(5, False)
    server._update_ranking_progress(
        token,
        {
            "state": "RUNNING",
            "completedCount": 2,
            "successfulCount": 2,
            "failedCount": 0,
            "currentItemNumber": 3,
            "phase": "EVALUATION",
        },
    )
    progress = server._ranking_progress_snapshot()

    assert progress["totalCount"] == 5
    assert progress["completedCount"] == 2
    assert progress["progressPercent"] == 40
    assert progress["elapsedSeconds"] == 70
    assert progress["estimatedRemainingSeconds"] == 105
    assert "_startedMonotonic" not in progress


def test_partial_failure_persists_success_and_failed_item_can_be_retried(store):
    records = [make_idea("PARTIAL-A"), make_idea("PARTIAL-B")]
    gateway = CountingGateway(fail_evaluate_once={"PARTIAL-B"})
    service, _ = _service(store, gateway)

    first = service.process_batch(records, limit=10, retry_failed=False)
    first_a_evaluation = store.get_current_evaluation("PARTIAL-A")

    assert first["scoredCount"] == 1
    assert first["errorCount"] == 1
    assert store.get_processing("PARTIAL-A")["processing_status"] == "SUCCESS"
    assert store.get_processing("PARTIAL-B")["processing_status"] == "FAILED"
    assert first_a_evaluation is not None

    retried = service.process_batch(records, limit=10, retry_failed=True)

    assert retried["newPrescreenCount"] == 0
    assert retried["scoredCount"] == 1
    assert retried["errorCount"] == 0
    assert retried["affectedIdeaIds"] == ["PARTIAL-B"]
    assert store.get_processing("PARTIAL-B")["attempt_count"] == 2
    assert store.get_current_evaluation("PARTIAL-B") is not None
    assert store.get_current_evaluation("PARTIAL-A")["id"] == first_a_evaluation["id"]
    assert [call["record"]["id"] for call in gateway.evaluation_calls].count(
        "PARTIAL-A"
    ) == 1
    assert [call["record"]["id"] for call in gateway.evaluation_calls].count(
        "PARTIAL-B"
    ) == 2
    assert [call["record"]["id"] for call in gateway.prescreen_calls].count(
        "PARTIAL-B"
    ) == 1
    with store.connection() as connection:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM prescreen_results WHERE idea_id = 'PARTIAL-B'"
            ).fetchone()[0]
            == 1
        )


def test_invalid_prescreen_ai_structure_routes_to_review_not_technical_failure(store):
    class InvalidPrescreenGateway(CountingGateway):
        def prescreen(self, record, candidates):
            raise AIResultValidationError("synthetic invalid prescreen structure")

    record = make_idea("REVIEW-PRESCREEN")
    service, _gateway = _service(store, InvalidPrescreenGateway())

    result = service.process_batch([record], limit=1, retry_failed=False)
    item = service.prescreens([record])["items"][0]
    processing = store.get_processing(record["id"])

    assert result["errorCount"] == 0
    assert result["humanReviewCount"] == 1
    assert result["newPrescreenCount"] == 1
    assert processing["processing_status"] == "SUCCESS"
    assert item["workflowState"] == "AI_RESPONSE_REVIEW_REQUIRED"
    assert item["technicalStatus"] == "REVIEW_REQUIRED"
    assert item["requiresHumanReview"] is True
    assert item["errorType"] is None
    assert item["clarificationQuestions"] == []


def test_invalid_evaluation_ai_structure_routes_to_review_without_fake_score(store):
    class InvalidEvaluationGateway(CountingGateway):
        def evaluate(self, record, criteria):
            raise AIResultValidationError("synthetic invalid evaluation structure")

    record = make_idea("REVIEW-EVALUATION")
    service, _gateway = _service(store, InvalidEvaluationGateway())

    result = service.process_batch([record], limit=1, retry_failed=False)
    item = service.prescreens([record])["items"][0]

    assert result["errorCount"] == 0
    assert result["humanReviewCount"] == 1
    assert result["passedCount"] == 0
    assert result["scoredCount"] == 0
    assert store.get_processing(record["id"])["processing_status"] == "SUCCESS"
    assert store.get_current_evaluation(record["id"]) is None
    assert item["workflowState"] == "AI_RESPONSE_REVIEW_REQUIRED"
    assert item["errorType"] is None


def test_human_review_item_can_be_sent_directly_to_scoring(store):
    class InvalidPrescreenGateway(CountingGateway):
        def prescreen(self, record, candidates):
            raise AIResultValidationError("synthetic invalid prescreen structure")

    record = make_idea("REVIEW-TO-SCORING")
    service, gateway = _service(store, InvalidPrescreenGateway())
    service.process_batch([record], limit=1, retry_failed=False)

    result = service.override_prescreen(
        [record],
        record["id"],
        "ALLOW_SCORING",
        "A szakértői ellenőrzés alapján az ötlet közvetlenül pontozható.",
        "reviewer",
    )
    item = service.prescreens([record])["items"][0]

    assert result["scored"] is True
    assert result["reviewRequired"] is False
    assert gateway.evaluation_count == 1
    assert item["workflowState"] == "RANKED"
    assert item["evaluationCurrent"] is True
    assert service.status([record])["humanReviewCount"] == 0
    assert service.ranking([record])["items"][0]["ideaId"] == record["id"]


def test_scored_idea_with_review_flag_is_not_pending_human_review(store):
    class ReviewFlagPassGateway(CountingGateway):
        def prescreen(self, record, candidates):
            result, response_id = super().prescreen(record, candidates)
            return result.model_copy(update={"requires_human_review": True}), response_id

    record = make_idea("SCORED-REVIEW-FLAG")
    service, _gateway = _service(store, ReviewFlagPassGateway())

    service.process_batch([record], limit=1, retry_failed=False)
    item = service.prescreens([record])["items"][0]

    assert item["evaluationCurrent"] is True
    assert item["requiresHumanReview"] is True
    assert service.status([record])["humanReviewCount"] == 0


def test_migration_reclassifies_existing_validation_failure_as_human_review(store):
    idea_id = "LEGACY-VALIDATION-FAILURE"
    content_hash = "legacy-validation-hash"
    claim_token = store.claim_processing(idea_id, content_hash)
    store.save_failure(
        idea_id,
        content_hash,
        claim_token,
        "ValidationError",
        "idea-prescreen-v3",
        {"model": "fake-model", "mode": "failed_prescreen"},
        "PRESCREEN",
    )
    assert store.get_processing(idea_id)["processing_status"] == "FAILED"

    reopened = RankingStore(store.path)
    processing = reopened.get_processing(idea_id)
    prescreen = reopened.get_current_prescreen(idea_id)
    migration = next(
        item
        for item in reopened.list_audit()
        if item["action"] == "AI_RESPONSE_VALIDATION_RECLASSIFIED"
    )

    assert processing["processing_status"] == "SUCCESS"
    assert processing["processing_phase"] == "COMPLETE"
    assert processing["error_type"] is None
    assert prescreen["prescreen_status"] == "AI_RESPONSE_REVIEW_REQUIRED"
    assert prescreen["technical_status"] == "REVIEW_REQUIRED"
    assert prescreen["requires_human_review"] is True
    assert prescreen["error_type"] is None
    assert migration["after"] == {"ideaIds": [idea_id]}


def test_parallel_claim_is_atomic_and_visible_from_new_store_instance(tmp_path):
    db_path = tmp_path / "concurrent.sqlite3"
    first_store = RankingStore(db_path)
    second_store = RankingStore(db_path)
    barrier = Barrier(2)

    def claim(candidate_store: RankingStore) -> str | None:
        barrier.wait(timeout=5)
        return candidate_store.claim_processing("CONCURRENT", "hash-v1")

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(claim, (first_store, second_store)))

    assert sum(token is not None for token in results) == 1
    assert sum(token is None for token in results) == 1
    reopened = RankingStore(db_path)
    state = reopened.get_processing("CONCURRENT")
    assert state["processing_status"] == "PROCESSING"
    assert state["attempt_count"] == 1


def test_force_does_not_steal_an_active_processing_claim(store):
    first_token = store.claim_processing("ACTIVE-CLAIM", "hash-v1")

    forced_token = store.claim_processing("ACTIVE-CLAIM", "hash-v1", force=True)
    state = store.get_processing("ACTIVE-CLAIM")

    assert first_token is not None
    assert forced_token is None
    assert state["processing_status"] == "PROCESSING"
    assert state["processing_phase"] == "PRESCREEN"
    assert state["claim_token"] == first_token
    assert state["attempt_count"] == 1


def test_stale_evaluation_claim_is_reclaimed_in_evaluation_phase(store):
    record = make_idea("STALE-EVALUATION-CLAIM")
    service, _gateway = _service(
        store, CountingGateway(fail_evaluate_once={record["id"]})
    )
    service.process_batch([record], limit=1, retry_failed=False)

    first_retry_token = store.claim_processing(
        record["id"], source_data_hash(record), retry_failed=True
    )
    replacement_token = store.claim_processing(
        record["id"],
        source_data_hash(record),
        stale_after=timedelta(seconds=-1),
    )
    state = store.get_processing(record["id"])

    assert first_retry_token is not None
    assert replacement_token is not None
    assert replacement_token != first_retry_token
    assert state["processing_status"] == "PROCESSING"
    assert state["processing_phase"] == "EVALUATION"
    assert state["claim_token"] == replacement_token


def test_superseded_worker_cannot_overwrite_or_fail_newer_success(store):
    record = make_idea("SUPERSEDED-WORKER")
    content_hash = source_data_hash(record)
    service, _gateway = _service(
        store, CountingGateway(fail_evaluate_once={record["id"]})
    )
    service.process_batch([record], limit=1, retry_failed=False)

    expired_token = store.claim_processing(
        record["id"], content_hash, retry_failed=True
    )
    current_token = store.claim_processing(
        record["id"],
        content_hash,
        stale_after=timedelta(seconds=-1),
    )
    evaluation_payload = service._evaluate(record)
    current_evaluation_id = store.save_evaluation_success(
        record["id"], content_hash, current_token, evaluation_payload
    )

    with pytest.raises(StoreConflictError, match="claim"):
        store.save_evaluation_success(
            record["id"], content_hash, expired_token, evaluation_payload
        )
    with pytest.raises(StoreConflictError, match="claim"):
        store.save_failure(
            record["id"],
            content_hash,
            expired_token,
            "LateWorkerError",
            "test-prompt-v1",
            {"mode": "network-free-test"},
            "EVALUATION",
        )

    state = store.get_processing(record["id"])
    assert state["processing_status"] == "SUCCESS"
    assert state["processing_phase"] == "COMPLETE"
    assert state["claim_token"] is None
    assert state["error_type"] is None
    assert state["current_evaluation_id"] == current_evaluation_id
    with store.connection() as connection:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM prescreen_results WHERE idea_id = ?",
                (record["id"],),
            ).fetchone()[0]
            == 1
        )
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM evaluations WHERE idea_id = ?",
                (record["id"],),
            ).fetchone()[0]
            == 1
        )


def test_changed_content_is_marked_stale_without_automatic_reevaluation(store):
    original = make_idea("STALE")
    service, gateway = _service(store)
    service.process_batch([original], limit=5, retry_failed=False)
    evaluation_before = store.get_current_evaluation("STALE")
    calls_before = (gateway.prescreen_count, gateway.evaluation_count)
    changed = {**original, "leiras": original["leiras"] + " Új megoldási lépés."}

    status = service.status([changed])
    ranking = service.ranking([changed])

    assert status["newCount"] == 0
    assert store.get_processing("STALE")["source_changed"] == 1
    assert store.get_current_evaluation("STALE")["id"] == evaluation_before["id"]
    assert store.get_current_evaluation("STALE")[
        "source_data_hash"
    ] == source_data_hash(original)
    assert ranking["items"][0]["sourceChanged"] is True
    assert (gateway.prescreen_count, gateway.evaluation_count) == calls_before


def test_previously_scored_closed_idea_leaves_ranking_but_history_remains(store):
    record = make_idea("CLOSED-LATER")
    service, gateway = _service(store)
    service.process_batch([record], limit=5, retry_failed=False)
    evaluation_id = store.get_current_evaluation("CLOSED-LATER")["id"]
    closed = {**record, "allapot": "Lezárva"}
    calls_before = (gateway.prescreen_count, gateway.evaluation_count)

    ranking = service.ranking([closed])
    prescreen = service.prescreens([closed])["items"][0]

    assert ranking["items"] == []
    assert prescreen["currentlyEligible"] is False
    assert store.get_current_evaluation("CLOSED-LATER")["id"] == evaluation_id
    assert (gateway.prescreen_count, gateway.evaluation_count) == calls_before


def test_override_is_audited_scores_when_allowed_and_keeps_original_ai_status(store):
    record = make_idea("OVERRIDE")
    source_before = deepcopy(record)
    gateway = CountingGateway(decisions={"OVERRIDE": "CLOSE_RECOMMENDED"})
    service, _ = _service(store, gateway)
    service.process_batch([record], limit=5, retry_failed=False)
    original_prescreen = store.get_current_prescreen("OVERRIDE")

    result = service.override_prescreen(
        [record],
        "OVERRIDE",
        "ALLOW_SCORING",
        "Szakértői döntés alapján mégis pontozható.",
        "test-reviewer",
    )
    current_prescreen = store.get_current_prescreen("OVERRIDE")
    audit = next(
        item for item in store.list_audit() if item["action"] == "PRESCREEN_OVERRIDE"
    )

    assert result["scored"] is True
    assert gateway.evaluation_count == 1
    assert original_prescreen["prescreen_status"] == "CLOSE_RECOMMENDED"
    assert current_prescreen["prescreen_status"] == "CLOSE_RECOMMENDED"
    assert current_prescreen["reason"] == original_prescreen["reason"]
    assert current_prescreen["human_decision"] == "ALLOW_SCORING"
    assert current_prescreen["human_actor"] == "test-reviewer"
    assert store.get_current_evaluation("OVERRIDE") is not None
    assert audit["before"]["status"] == "CLOSE_RECOMMENDED"
    assert audit["after"]["decision"] == "ALLOW_SCORING"
    assert audit["actor"] == "test-reviewer"
    assert record == source_before
    assert service.ranking([record])["items"][0]["ideaId"] == "OVERRIDE"


def test_override_is_bound_to_prescreen_revision_and_does_not_leak_after_reevaluation(
    store,
):
    record = make_idea("REVISION-BOUND-OVERRIDE")
    gateway = CountingGateway(decisions={record["id"]: "CLOSE_RECOMMENDED"})
    service, _gateway = _service(store, gateway)
    service.process_batch([record], limit=1, retry_failed=False)
    original_prescreen = store.get_current_prescreen(record["id"])

    service.override_prescreen(
        [record],
        record["id"],
        "HOLD",
        "The original prescreen revision is held for human review.",
        "first-reviewer",
    )
    assert store.get_current_prescreen(record["id"])["human_decision"] == "HOLD"

    gateway.decisions[record["id"]] = "PASS"
    result = service.reevaluate(
        [record],
        record["id"],
        "Create an explicit new prescreen revision.",
        "reevaluator",
    )
    current_prescreen = store.get_current_prescreen(record["id"])

    assert result["prescreenStatus"] == "PASS"
    assert result["scored"] is True
    assert current_prescreen["id"] != original_prescreen["id"]
    assert current_prescreen["human_decision"] is None
    assert current_prescreen["human_comment"] is None
    assert current_prescreen["human_actor"] is None
    with store.connection() as connection:
        override = connection.execute(
            "SELECT prescreen_id FROM prescreen_overrides WHERE idea_id = ?",
            (record["id"],),
        ).fetchone()
        assert override["prescreen_id"] == original_prescreen["id"]


def test_weights_only_rescore_uses_raw_scores_without_ai_and_reorders(store):
    first_id = DEFAULT_FIRST = "WEIGHT-A"
    second_id = DEFAULT_SECOND = "WEIGHT-B"
    initial_config = store.get_criteria_config()
    criteria = [
        CriterionConfig.model_validate(item) for item in initial_config["criteria"]
    ]
    first_criterion = criteria[0].id
    second_criterion = criteria[1].id
    base_scores = {item.id: 5.0 for item in criteria}
    gateway = CountingGateway(
        scores_by_idea={
            first_id: {**base_scores, first_criterion: 10.0, second_criterion: 0.0},
            second_id: {**base_scores, first_criterion: 0.0, second_criterion: 10.0},
        }
    )
    service, _ = _service(store, gateway)
    records = [make_idea(first_id), make_idea(second_id)]
    service.process_batch(records, limit=10, retry_failed=False)
    ranking_before = service.ranking(records)
    raw_before = {
        evaluation["idea_id"]: {
            item["criterionId"]: item["score"] for item in evaluation["criteria_scores"]
        }
        for evaluation in store.list_current_evaluations()
    }
    calls_before = (gateway.prescreen_count, gateway.evaluation_count)

    changed = list(criteria)
    changed[0] = changed[0].model_copy(update={"weight": 25.0})
    changed[1] = changed[1].model_copy(update={"weight": 10.0})
    update = service.update_settings(
        changed, initial_config["configVersion"], "weight-editor"
    )
    ranking_while_pending = service.ranking(records)
    rescore = service.rescore_all(update["configVersion"], "weight-editor")
    ranking_after = service.ranking(records)
    raw_after = {
        evaluation["idea_id"]: {
            item["criterionId"]: item["score"] for item in evaluation["criteria_scores"]
        }
        for evaluation in store.list_current_evaluations()
    }

    assert [item["ideaId"] for item in ranking_before["items"]] == [
        DEFAULT_SECOND,
        DEFAULT_FIRST,
    ]
    assert [item["ideaId"] for item in ranking_while_pending["items"]] == [
        DEFAULT_SECOND,
        DEFAULT_FIRST,
    ]
    assert [item["ideaId"] for item in ranking_after["items"]] == [
        DEFAULT_FIRST,
        DEFAULT_SECOND,
    ]
    assert update["changeType"] == "WEIGHTS_PENDING"
    assert update["requiresWeightRescore"] is True
    assert update["criteriaVersion"] == initial_config["criteriaVersion"]
    assert update["scoringVersion"] == initial_config["scoringVersion"]
    assert rescore["scoringVersion"] != initial_config["scoringVersion"]
    assert raw_after == raw_before
    assert (gateway.prescreen_count, gateway.evaluation_count) == calls_before
    with store.connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM evaluations").fetchone()[0] == 4


def test_noop_settings_request_with_stale_version_is_still_a_conflict(store):
    service, gateway = _service(store)
    initial = store.get_criteria_config()
    changed = [CriterionConfig.model_validate(item) for item in initial["criteria"]]
    changed[0] = changed[0].model_copy(update={"weight": 25.0})
    changed[1] = changed[1].model_copy(update={"weight": 10.0})

    updated = service.update_settings(changed, initial["configVersion"], "first-editor")

    with pytest.raises(StoreConflictError):
        service.update_settings(
            changed,
            initial["configVersion"],
            "stale-editor",
        )

    assert updated["configVersion"] == initial["configVersion"] + 1
    assert store.get_criteria_config()["configVersion"] == updated["configVersion"]
    assert gateway.prescreen_count == 0
    assert gateway.evaluation_count == 0


def test_weight_update_rejects_stale_evaluation_pointer_snapshot(store):
    record = make_idea("WEIGHT-POINTER-CAS")
    service, _gateway = _service(store)
    service.process_batch([record], limit=1, retry_failed=False)
    config = store.get_criteria_config()
    original_evaluation = store.get_current_evaluation(record["id"])
    changed = [CriterionConfig.model_validate(item) for item in config["criteria"]]
    changed[0] = changed[0].model_copy(update={"weight": 25.0})
    changed[1] = changed[1].model_copy(update={"weight": 10.0})
    stale_payload = service._rescore_evaluation(
        original_evaluation,
        changed,
        config["criteriaVersion"],
        "test-scoring-v2",
    )

    service.reevaluate(
        [record],
        record["id"],
        "Advance the current evaluation pointer before applying weights.",
        "concurrent-worker",
    )
    current_evaluation = store.get_current_evaluation(record["id"])
    assert current_evaluation["id"] != original_evaluation["id"]

    with pytest.raises(StoreConflictError):
        store.apply_criteria_update(
            expected_config_version=config["configVersion"],
            criteria_version=config["criteriaVersion"],
            scoring_version="test-scoring-v2",
            criteria=[item.model_dump(by_alias=True) for item in changed],
            change_type="WEIGHTS_ONLY",
            actor="stale-weight-editor",
            evaluation_copies=[(original_evaluation["id"], stale_payload)],
        )

    assert store.get_criteria_config()["configVersion"] == config["configVersion"]
    assert store.get_current_evaluation(record["id"])["id"] == current_evaluation["id"]


def test_criteria_meaning_change_creates_version_split_without_ai_calls(store):
    record = make_idea("MEANING")
    service, gateway = _service(store)
    service.process_batch([record], limit=5, retry_failed=False)
    config = store.get_criteria_config()
    criteria = [CriterionConfig.model_validate(item) for item in config["criteria"]]
    criteria[0] = criteria[0].model_copy(
        update={"description": criteria[0].description + " Új szemantikai jelentés."}
    )
    calls_before = (gateway.prescreen_count, gateway.evaluation_count)

    update = service.update_settings(
        criteria, config["configVersion"], "criteria-editor"
    )

    assert update["changeType"] == "CRITERIA_MEANING"
    assert update["criteriaVersion"] != config["criteriaVersion"]
    assert update["scoringVersion"] != config["scoringVersion"]
    assert service.ranking([record])["items"] == []
    assert (gateway.prescreen_count, gateway.evaluation_count) == calls_before
    with store.connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM evaluations").fetchone()[0] == 1
        assert (
            connection.execute("SELECT COUNT(*) FROM criteria_configs").fetchone()[0]
            == 2
        )


def test_active_criterion_toggle_is_methodology_change_not_weight_rescore(store):
    service, gateway = _service(store)
    config = store.get_criteria_config()
    criteria = [CriterionConfig.model_validate(item) for item in config["criteria"]]
    criteria[0] = criteria[0].model_copy(update={"active": not criteria[0].active})
    active = [item for item in criteria if item.active]
    active[0] = active[0].model_copy(
        update={"weight": active[0].weight + criteria[0].weight}
    )
    active_by_id = {item.id: item for item in active}
    criteria = [active_by_id.get(item.id, item) for item in criteria]

    assert service.settings_change_type(criteria) == "CRITERIA_MEANING"
    assert gateway.prescreen_count == 0
    assert gateway.evaluation_count == 0


def test_manual_order_persists_new_item_merge_is_stable_and_version_conflicts(store):
    records = [make_idea("ORDER-A"), make_idea("ORDER-B")]
    gateway = CountingGateway(
        scores_by_idea={"ORDER-A": 9, "ORDER-B": 7, "ORDER-NEW": 8}
    )
    service, _ = _service(store, gateway)
    service.process_batch(records, limit=10, retry_failed=False)
    first_ranking = service.ranking(records)
    version_before_manual = first_ranking["rankingVersion"]

    saved = service.save_order(
        records, ["ORDER-B", "ORDER-A"], version_before_manual, "rank-editor"
    )
    reopened = RankingStore(store.path)
    reopened_service = RankingService(reopened, gateway)
    assert reopened.get_ranking_state()["manualOrder"] == ["ORDER-B", "ORDER-A"]
    assert [item["ideaId"] for item in reopened_service.ranking(records)["items"]] == [
        "ORDER-B",
        "ORDER-A",
    ]

    with pytest.raises(StoreConflictError, match="más módosította"):
        reopened.save_manual_order(
            ["ORDER-A", "ORDER-B"], version_before_manual, "stale-editor"
        )

    records.append(make_idea("ORDER-NEW"))
    reopened_service.process_batch(records, limit=10, retry_failed=False)
    merged = reopened_service.ranking(records)

    assert saved["rankingVersion"] == version_before_manual + 1
    assert [item["ideaId"] for item in merged["items"]] == [
        "ORDER-NEW",
        "ORDER-B",
        "ORDER-A",
    ]
    assert [item["finalRank"] for item in merged["items"]] == [1, 2, 3]
    assert len({item["aiRank"] for item in merged["items"]}) == 3
    assert [
        idea_id
        for idea_id in [item["ideaId"] for item in merged["items"]]
        if idea_id in {"ORDER-A", "ORDER-B"}
    ] == ["ORDER-B", "ORDER-A"]
    audit = next(
        item
        for item in reopened.list_audit()
        if item["action"] == "RANKING_ORDER_UPDATE"
    )
    assert audit["before"]["rankingVersion"] == version_before_manual
    assert audit["after"]["ideaIds"] == ["ORDER-B", "ORDER-A"]


def test_explicit_reevaluation_keeps_immutable_history_and_audit(store):
    record = make_idea("HISTORY")
    service, gateway = _service(store)
    service.process_batch([record], limit=5, retry_failed=False)
    first_evaluation = store.get_current_evaluation("HISTORY")
    changed = {**record, "leiras": record["leiras"] + " Módosított tartalom."}

    result = service.reevaluate(
        [changed], "HISTORY", "Kifejezett újraértékelési kérés.", "reevaluator"
    )
    current = store.get_current_evaluation("HISTORY")

    assert result["scored"] is True
    assert current["id"] != first_evaluation["id"]
    assert current["source_data_hash"] == source_data_hash(changed)
    assert gateway.prescreen_count == 2
    assert gateway.evaluation_count == 2
    with store.connection() as connection:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM prescreen_results WHERE idea_id = 'HISTORY'"
            ).fetchone()[0]
            == 2
        )
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM evaluations WHERE idea_id = 'HISTORY'"
            ).fetchone()[0]
            == 2
        )
    audit = next(
        item for item in store.list_audit() if item["action"] == "EXPLICIT_REEVALUATION"
    )
    assert audit["actor"] == "reevaluator"
    assert audit["after"]["comment"] == "Kifejezett újraértékelési kérés."


def _install_api_test_service(monkeypatch, tmp_path):
    local_store = RankingStore(tmp_path / "api-ranking.sqlite3")
    gateway = CountingGateway()
    service = RankingService(local_store, gateway)
    records = [make_idea("API-IDEA")]
    service.process_batch(records, limit=5, retry_failed=False)

    async def ranking_records():
        return records

    monkeypatch.setattr(server, "_ranking_store", local_store)
    monkeypatch.setattr(server, "_get_ranking_service", lambda: service)
    monkeypatch.setattr(server, "_ranking_records", ranking_records)
    return local_store, service, gateway, records


def test_ranking_get_endpoints_never_call_ai(monkeypatch, tmp_path):
    _store, _ranking_service, gateway, _records = _install_api_test_service(
        monkeypatch, tmp_path
    )
    calls_before = (gateway.prescreen_count, gateway.evaluation_count)
    monkeypatch.delenv("RANKING_READ_ONLY", raising=False)
    monkeypatch.delenv("RANKING_PERMISSIONS", raising=False)
    client = TestClient(server.app)

    for path in (
        "/api/ranking/permissions",
        "/api/ranking",
        "/api/ranking/status",
        "/api/ranking/prescreens",
        "/api/ranking/prescreens/API-IDEA",
        "/api/ranking/settings",
        "/api/ranking/audit",
    ):
        response = client.get(path)
        assert response.status_code == 200, (path, response.text)

    assert (gateway.prescreen_count, gateway.evaluation_count) == calls_before


def test_source_changed_override_is_rejected_with_domain_422(monkeypatch, tmp_path):
    local_store, _ranking_service, gateway, records = _install_api_test_service(
        monkeypatch, tmp_path
    )
    calls_before = (gateway.prescreen_count, gateway.evaluation_count)
    records[0] = {
        **records[0],
        "leiras": records[0]["leiras"] + " Materially changed source content.",
    }
    monkeypatch.delenv("RANKING_READ_ONLY", raising=False)
    monkeypatch.setenv("RANKING_PERMISSIONS", "view,override")
    client = TestClient(server.app)

    status = client.get("/api/ranking/status")
    response = client.post(
        "/api/ranking/prescreens/API-IDEA/override",
        json={
            "decision": "HOLD",
            "comment": "Do not override a stale prescreen revision.",
        },
    )

    assert status.status_code == 200
    assert local_store.get_processing("API-IDEA")["source_changed"] == 1
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    assert response.json()["detail"]
    assert (gateway.prescreen_count, gateway.evaluation_count) == calls_before


def test_read_only_mode_allows_get_but_blocks_processing_before_ai(
    monkeypatch, tmp_path
):
    _store, _ranking_service, gateway, _records = _install_api_test_service(
        monkeypatch, tmp_path
    )
    calls_before = (gateway.prescreen_count, gateway.evaluation_count)
    monkeypatch.setenv("RANKING_READ_ONLY", "true")
    monkeypatch.delenv("RANKING_PERMISSIONS", raising=False)
    client = TestClient(server.app)

    assert client.get("/api/ranking").status_code == 200
    denied = client.post(
        "/api/ranking/process", json={"limit": 5, "retryFailed": False}
    )
    denied_rescore = client.post("/api/ranking/rescore-all", json={"configVersion": 1})
    denied_full_reevaluation = client.post(
        "/api/ranking/reevaluation/process",
        json={"limit": 20, "retryFailed": False},
    )
    denied_reset = client.post(
        "/api/ranking/reset-all",
        json={
            "confirmation": "TELJES ÚJRAKEZDÉS",
            "reason": "Read-only reset attempt must be rejected.",
        },
    )

    assert denied.status_code == 403
    assert denied_rescore.status_code == 403
    assert denied_full_reevaluation.status_code == 403
    assert denied_reset.status_code == 403
    assert (gateway.prescreen_count, gateway.evaluation_count) == calls_before


def test_rescore_all_reuses_raw_scores_without_ai_and_keeps_items(store):
    records = [make_idea("RESCORE-A"), make_idea("RESCORE-B")]
    service, gateway = _service(store)
    service.process_batch(records, limit=20, retry_failed=False)
    initial_config = store.get_criteria_config()
    changed = [
        CriterionConfig.model_validate(item) for item in initial_config["criteria"]
    ]
    changed[0] = changed[0].model_copy(update={"weight": 25.0})
    changed[1] = changed[1].model_copy(update={"weight": 10.0})
    staged = service.update_settings(
        changed, initial_config["configVersion"], "score-admin"
    )
    config = store.get_criteria_config()
    ranking_before = service.ranking(records)
    raw_before = {
        item["idea_id"]: deepcopy(item["criteria_scores"])
        for item in store.list_current_evaluations()
    }
    calls_before = (gateway.prescreen_count, gateway.evaluation_count)

    result = service.rescore_all(config["configVersion"], "score-admin")
    ranking_after = service.ranking(records)
    raw_after = {
        item["idea_id"]: deepcopy(item["criteria_scores"])
        for item in store.list_current_evaluations()
    }

    assert result["rescoredCount"] == 2
    assert staged["changeType"] == "WEIGHTS_PENDING"
    assert result["scoringVersion"] != initial_config["scoringVersion"]
    assert result["rankingVersion"] > ranking_before["rankingVersion"]
    assert len(ranking_after["items"]) == 2
    assert {item["ideaId"] for item in ranking_after["items"]} == {
        "RESCORE-A",
        "RESCORE-B",
    }
    assert (gateway.prescreen_count, gateway.evaluation_count) == calls_before
    for idea_id in raw_before:
        assert [row["score"] for row in raw_after[idea_id]] == [
            row["score"] for row in raw_before[idea_id]
        ]
        assert [row["rationale"] for row in raw_after[idea_id]] == [
            row["rationale"] for row in raw_before[idea_id]
        ]
    audit = next(
        item for item in store.list_audit() if item["action"] == "RESCORE_ALL_COMPLETED"
    )
    assert audit["metadata"]["aiCalled"] is False


def test_rescore_all_is_rejected_without_pending_weight_change(store):
    service, gateway = _service(store)
    config = store.get_criteria_config()

    with pytest.raises(RankingValidationError, match="Nincs mentett"):
        service.rescore_all(config["configVersion"], "score-admin")

    assert gateway.prescreen_count == 0
    assert gateway.evaluation_count == 0


def test_human_decisions_move_items_to_distinct_workflow_sections(store):
    records = [
        make_idea("CLOSE-ACCEPTED"),
        make_idea("CLARIFY-ACCEPTED"),
        make_idea("CLOSE-TO-RANK"),
    ]
    gateway = CountingGateway(
        decisions={
            "CLOSE-ACCEPTED": "CLOSE_RECOMMENDED",
            "CLARIFY-ACCEPTED": "NEEDS_CLARIFICATION",
            "CLOSE-TO-RANK": "CLOSE_RECOMMENDED",
        }
    )
    service, _ = _service(store, gateway)
    service.process_batch(records, limit=10, retry_failed=False)

    service.override_prescreen(
        records,
        "CLOSE-ACCEPTED",
        "ACCEPT_RECOMMENDATION",
        "A lezárási javaslat szakértői ellenőrzés után elfogadva.",
        "reviewer",
    )
    service.override_prescreen(
        records,
        "CLARIFY-ACCEPTED",
        "ACCEPT_RECOMMENDATION",
        "A pontosítási igény szakértői ellenőrzés után elfogadva.",
        "reviewer",
    )
    service.override_prescreen(
        records,
        "CLOSE-TO-RANK",
        "ALLOW_SCORING",
        "A javaslat mégis pontozható a rendelkezésre álló szakértői adatokkal.",
        "reviewer",
    )

    by_id = {item["ideaId"]: item for item in service.prescreens(records)["items"]}
    assert by_id["CLOSE-ACCEPTED"]["workflowState"] == "CLOSURE_ACCEPTED"
    assert by_id["CLARIFY-ACCEPTED"]["workflowState"] == "CLARIFICATION_ACCEPTED"
    assert by_id["CLOSE-TO-RANK"]["workflowState"] == "RANKED"
    assert [item["ideaId"] for item in service.ranking(records)["items"]] == [
        "CLOSE-TO-RANK"
    ]


def test_process_batch_returns_only_newly_added_ranking_items(store):
    records = [make_idea("NEW-RANKED"), make_idea("NOT-RANKED")]
    gateway = CountingGateway(decisions={"NOT-RANKED": "CLOSE_RECOMMENDED"})
    service, _ = _service(store, gateway)

    first = service.process_batch(records, limit=10, retry_failed=False)
    second = service.process_batch(records, limit=10, retry_failed=False)

    assert first["newlyRankedIdeaIds"] == ["NEW-RANKED"]
    assert second["newlyRankedIdeaIds"] == []


def test_related_idea_title_falls_back_to_authoritative_source(store):
    reference = make_idea(
        "SZRTIL-410",
        cim="Céges telefon helyett telefon vásárlás támogatás",
        allapot="Lezárva",
    )
    current = make_idea("RELATED-CURRENT")
    gateway = CountingGateway(
        decisions={"RELATED-CURRENT": "CLOSE_RECOMMENDED"},
        duplicate_ids={"RELATED-CURRENT": ["SZRTIL-410"]},
    )
    service, _ = _service(store, gateway)
    service.process_batch([current, reference], limit=5, retry_failed=False)
    with store.transaction() as connection:
        connection.execute(
            "UPDATE prescreen_results SET related_idea_title = NULL "
            "WHERE idea_id = 'RELATED-CURRENT'"
        )

    item = service.prescreens([current, reference])["items"][0]

    assert item["relatedIdeaId"] == "SZRTIL-410"
    assert item["relatedIdeaTitle"] == reference["cim"]


def test_full_reset_clears_operational_data_but_preserves_settings_and_audit(store):
    records = [make_idea("RESET-A"), make_idea("RESET-B")]
    gateway = CountingGateway(decisions={"RESET-B": "NEEDS_CLARIFICATION"})
    service, _ = _service(store, gateway)
    service.process_batch(records, limit=10, retry_failed=False)
    service.override_prescreen(
        records,
        "RESET-B",
        "HOLD",
        "A pontosítás beérkezéséig szakértői várakoztatás szükséges.",
        "reviewer",
    )
    config_before = store.get_criteria_config()
    ranking_version_before = store.get_ranking_state()["rankingVersion"]

    result = service.reset_all(
        "ranking-admin", "Az értékelési folyamat kontrollált újraindítása."
    )
    status = service.status(records)

    assert result["deletedCounts"] == {
        "processing": 2,
        "prescreens": 2,
        "evaluations": 1,
        "overrides": 1,
    }
    assert result["rankingVersion"] == ranking_version_before + 1
    assert store.list_processing() == []
    assert store.list_current_prescreens() == []
    assert store.list_current_evaluations() == []
    assert store.get_criteria_config() == config_before
    assert status["initialProcessing"] == {
        "totalCount": 2,
        "processedCount": 0,
        "remainingCount": 2,
        "newCount": 2,
        "failedCount": 0,
        "progressPercent": 0,
    }
    actions = [item["action"] for item in store.list_audit()]
    assert "RANKING_FULL_RESET" in actions
    assert "PRESCREEN_OVERRIDE" in actions


def test_full_reevaluation_uses_maximum_twenty_and_continues_after_error(store):
    records = [make_idea(f"FULL-{index:02d}") for index in range(25)]
    gateway = CountingGateway(fail_evaluate_once={"FULL-05"})
    service, _ = _service(store, gateway)

    first = service.reevaluate_batch(
        records,
        limit=20,
        retry_failed=False,
        actor="methodology-admin",
    )

    assert first["batchLimit"] == 20
    assert first["processedThisBatch"] == 19
    assert first["errorsThisBatch"] == 1
    assert first["remainingCount"] == 6
    assert first["errorCount"] == 1
    assert len(gateway.prescreen_calls) == 20
    assert len(store.list_current_evaluations()) == 19

    second = service.reevaluate_batch(
        records,
        limit=20,
        retry_failed=True,
        actor="methodology-admin",
    )

    assert second["processedThisBatch"] == 6
    assert second["errorsThisBatch"] == 0
    assert second["processedCount"] == 25
    assert second["remainingCount"] == 0
    assert second["complete"] is True
    assert len(store.list_current_evaluations()) == 25


def test_legacy_rejection_status_migrates_after_v3_without_deleting_history(store):
    store.record_action(
        "LEGACY_AUDIT",
        "legacy-user",
        idea_id="LEGACY-REJECT",
        after={"kept": True},
    )
    with store.transaction() as connection:
        connection.execute("""
            INSERT INTO prescreen_results(
                idea_id, source_data_hash, prescreen_status, reason,
                duplicate_ids_json, duplicate_explanation, confidence,
                evidence_json, missing_information_json, critical_risk_flags_json,
                prompt_version, model_configuration_json, technical_status,
                error_type, prescreened_at
            ) VALUES(
                'LEGACY-REJECT', 'legacy-hash', 'REJECTION_RECOMMENDED',
                'A régi előszűrés hatókörön kívülinek jelölte.', '[]', '', 'high',
                '[]', '[]', '[]', 'idea-prescreen-v1', '{}', 'SUCCESS', NULL,
                '2025-01-01T00:00:00+00:00'
            )
            """)
    reopened = RankingStore(store.path)
    with reopened.connection() as connection:
        row = connection.execute(
            "SELECT * FROM prescreen_results WHERE idea_id = 'LEGACY-REJECT'"
        ).fetchone()
        count = connection.execute(
            "SELECT COUNT(*) FROM prescreen_results WHERE idea_id = 'LEGACY-REJECT'"
        ).fetchone()[0]

    assert count == 1
    assert row["prescreen_status"] == "CLOSE_RECOMMENDED"
    assert row["business_status"] == "Lezárásra javasolt"
    assert row["reason_category"] == "Hatókörön kívüli"
    assert row["legacy_status"] == "REJECTION_RECOMMENDED"
    assert row["reason"] == "A régi előszűrés hatókörön kívülinek jelölte."
    actions = {item["action"] for item in reopened.list_audit()}
    assert "LEGACY_AUDIT" in actions
    assert "PRESCREEN_STATUS_MIGRATION" in actions


def test_ranking_and_prescreen_payloads_include_original_idea_fields(store):
    record = make_idea(
        "ORIGINAL",
        leiras="Az eredeti, változtatás nélkül megjelenítendő ötletleírás.",
        elvart_eredmeny="Az eredeti elvárt eredmény.",
    )
    service, _gateway = _service(store)
    service.process_batch([record], limit=1, retry_failed=False)

    ranked = service.ranking([record])["items"][0]["originalIdea"]
    prescreened = service.prescreens([record])["items"][0]["originalIdea"]

    for payload in (ranked, prescreened):
        assert payload["ideaId"] == "ORIGINAL"
        assert payload["description"] == record["leiras"]
        assert payload["expectedResult"] == record["elvart_eredmeny"]
