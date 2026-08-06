"""SQLite persistence for immutable idea evaluations and ranking audit state."""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

from ranking_models import (
    DEFAULT_CRITERIA,
    DEFAULT_CRITERIA_VERSION,
    DEFAULT_SCORING_VERSION,
)


class StoreConflictError(RuntimeError):
    """Raised when an optimistic version or idempotency check fails."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    return json.loads(value)


class RankingStore:
    """Small transactional repository tailored to the local file deployment."""

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.migrate()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 30000")
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self.connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
            except Exception:
                conn.rollback()
                raise
            else:
                conn.commit()

    def migrate(self) -> None:
        with self.transaction() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS criteria_configs (
                    config_version INTEGER PRIMARY KEY,
                    criteria_version TEXT NOT NULL,
                    scoring_version TEXT NOT NULL,
                    criteria_json TEXT NOT NULL,
                    change_type TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    updated_by TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS prescreen_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    idea_id TEXT NOT NULL,
                    source_data_hash TEXT NOT NULL,
                    prescreen_status TEXT NOT NULL,
                    business_status TEXT,
                    reason_category TEXT,
                    reason TEXT NOT NULL,
                    related_idea_id TEXT,
                    related_idea_title TEXT,
                    clarification_questions_json TEXT NOT NULL DEFAULT '[]',
                    confidence_percent INTEGER CHECK(confidence_percent BETWEEN 0 AND 100),
                    requires_human_review INTEGER NOT NULL DEFAULT 0
                        CHECK(requires_human_review IN (0, 1)),
                    criteria_version TEXT,
                    legacy_status TEXT,
                    duplicate_ids_json TEXT NOT NULL,
                    duplicate_explanation TEXT NOT NULL,
                    confidence TEXT NOT NULL,
                    evidence_json TEXT NOT NULL,
                    missing_information_json TEXT NOT NULL,
                    critical_risk_flags_json TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    model_configuration_json TEXT NOT NULL,
                    technical_status TEXT NOT NULL,
                    error_type TEXT,
                    prescreened_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_prescreen_idea
                    ON prescreen_results(idea_id, id DESC);

                CREATE TABLE IF NOT EXISTS evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    idea_id TEXT NOT NULL,
                    prescreen_id INTEGER NOT NULL,
                    source_data_hash TEXT NOT NULL,
                    overall_score INTEGER NOT NULL CHECK(overall_score BETWEEN 0 AND 100),
                    overall_rationale TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    strengths_json TEXT NOT NULL,
                    weaknesses_json TEXT NOT NULL,
                    next_steps_json TEXT NOT NULL,
                    critical_risk_flags_json TEXT NOT NULL,
                    confidence TEXT NOT NULL,
                    criteria_scores_json TEXT NOT NULL,
                    criteria_snapshot_json TEXT NOT NULL,
                    positive_contributions_json TEXT NOT NULL,
                    limiting_contributions_json TEXT NOT NULL,
                    criteria_version TEXT NOT NULL,
                    scoring_version TEXT NOT NULL,
                    evaluation_prompt_version TEXT NOT NULL,
                    model_configuration_json TEXT NOT NULL,
                    human_review_required INTEGER NOT NULL CHECK(human_review_required IN (0, 1)),
                    evaluated_at TEXT NOT NULL,
                    FOREIGN KEY(prescreen_id) REFERENCES prescreen_results(id)
                );
                CREATE INDEX IF NOT EXISTS idx_evaluation_idea
                    ON evaluations(idea_id, id DESC);

                CREATE TABLE IF NOT EXISTS idea_processing (
                    idea_id TEXT PRIMARY KEY,
                    source_data_hash TEXT NOT NULL,
                    processing_status TEXT NOT NULL,
                    processing_phase TEXT NOT NULL DEFAULT 'PRESCREEN',
                    claim_token TEXT,
                    attempt_count INTEGER NOT NULL DEFAULT 1,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    error_type TEXT,
                    current_prescreen_id INTEGER,
                    current_evaluation_id INTEGER,
                    source_changed INTEGER NOT NULL DEFAULT 0 CHECK(source_changed IN (0, 1)),
                    FOREIGN KEY(current_prescreen_id) REFERENCES prescreen_results(id),
                    FOREIGN KEY(current_evaluation_id) REFERENCES evaluations(id)
                );

                CREATE TABLE IF NOT EXISTS prescreen_overrides (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    idea_id TEXT NOT NULL,
                    prescreen_id INTEGER NOT NULL,
                    original_status TEXT NOT NULL,
                    original_reason TEXT NOT NULL,
                    human_decision TEXT NOT NULL,
                    comment TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    prescreen_prompt_version TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(prescreen_id) REFERENCES prescreen_results(id)
                );
                CREATE INDEX IF NOT EXISTS idx_override_idea
                    ON prescreen_overrides(idea_id, id DESC);

                CREATE TABLE IF NOT EXISTS ranking_state (
                    singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
                    ranking_version INTEGER NOT NULL,
                    manual_order_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    updated_by TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action TEXT NOT NULL,
                    idea_id TEXT,
                    actor TEXT NOT NULL,
                    before_json TEXT,
                    after_json TEXT,
                    metadata_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_audit_created
                    ON audit_log(created_at DESC);
                """)
            processing_columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(idea_processing)").fetchall()
            }
            if "processing_phase" not in processing_columns:
                conn.execute(
                    "ALTER TABLE idea_processing "
                    "ADD COLUMN processing_phase TEXT NOT NULL DEFAULT 'PRESCREEN'"
                )
            if "claim_token" not in processing_columns:
                conn.execute("ALTER TABLE idea_processing ADD COLUMN claim_token TEXT")
            prescreen_columns = {
                row["name"]
                for row in conn.execute(
                    "PRAGMA table_info(prescreen_results)"
                ).fetchall()
            }
            prescreen_additions = {
                "business_status": "TEXT",
                "reason_category": "TEXT",
                "related_idea_id": "TEXT",
                "related_idea_title": "TEXT",
                "clarification_questions_json": "TEXT NOT NULL DEFAULT '[]'",
                "confidence_percent": "INTEGER CHECK(confidence_percent BETWEEN 0 AND 100)",
                "requires_human_review": (
                    "INTEGER NOT NULL DEFAULT 0 "
                    "CHECK(requires_human_review IN (0, 1))"
                ),
                "criteria_version": "TEXT",
                "legacy_status": "TEXT",
            }
            for column, definition in prescreen_additions.items():
                if column not in prescreen_columns:
                    conn.execute(
                        f"ALTER TABLE prescreen_results ADD COLUMN {column} {definition}"
                    )
            conn.execute("""
                UPDATE idea_processing
                SET processing_phase = 'COMPLETE'
                WHERE processing_status = 'SUCCESS'
                  AND processing_phase = 'PRESCREEN'
                  AND claim_token IS NULL
                """)
            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)",
                (utc_now(),),
            )
            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(2, ?)",
                (utc_now(),),
            )
            criteria = [item.model_dump(by_alias=True) for item in DEFAULT_CRITERIA]
            conn.execute(
                """
                INSERT OR IGNORE INTO criteria_configs(
                    config_version, criteria_version, scoring_version, criteria_json,
                    change_type, updated_at, updated_by
                ) VALUES(1, ?, ?, ?, 'INITIAL', ?, 'system')
                """,
                (
                    DEFAULT_CRITERIA_VERSION,
                    DEFAULT_SCORING_VERSION,
                    _json(criteria),
                    utc_now(),
                ),
            )
            conn.execute(
                """
                INSERT OR IGNORE INTO ranking_state(
                    singleton_id, ranking_version, manual_order_json, updated_at, updated_by
                ) VALUES(1, 1, '[]', ?, 'system')
                """,
                (utc_now(),),
            )
            migration_three_applied = conn.execute(
                "SELECT 1 FROM schema_migrations WHERE version = 3"
            ).fetchone()
            legacy_status_present = conn.execute(
                "SELECT 1 FROM prescreen_results "
                "WHERE prescreen_status IN ("
                "'PASSED_TO_SCORING', 'CLOSURE_RECOMMENDED', "
                "'REJECTION_RECOMMENDED', 'HUMAN_REVIEW_REQUIRED') LIMIT 1"
            ).fetchone()
            if migration_three_applied is None or legacy_status_present is not None:
                current_criteria = conn.execute(
                    "SELECT criteria_version FROM criteria_configs "
                    "ORDER BY config_version DESC LIMIT 1"
                ).fetchone()
                criteria_version = (
                    current_criteria["criteria_version"]
                    if current_criteria is not None
                    else DEFAULT_CRITERIA_VERSION
                )
                row_query = (
                    "SELECT id, prescreen_status, reason, duplicate_ids_json, "
                    "confidence, critical_risk_flags_json FROM prescreen_results"
                )
                if migration_three_applied is not None:
                    row_query += (
                        " WHERE prescreen_status IN ("
                        "'PASSED_TO_SCORING', 'CLOSURE_RECOMMENDED', "
                        "'REJECTION_RECOMMENDED', 'HUMAN_REVIEW_REQUIRED')"
                    )
                rows = conn.execute(row_query).fetchall()
                migrated_counts: dict[str, int] = {}
                for row in rows:
                    old_status = str(row["prescreen_status"])
                    new_status = old_status
                    business_status = None
                    reason_category = None
                    related_idea_id = None
                    questions: list[str] = []
                    requires_human_review = 0
                    duplicate_ids = _loads(row["duplicate_ids_json"], [])
                    reason_text = str(row["reason"] or "").casefold()
                    risk_text = " ".join(
                        str(item)
                        for item in _loads(row["critical_risk_flags_json"], [])
                    ).casefold()
                    searchable_reason = f"{reason_text} {risk_text}"

                    if old_status == "PASSED_TO_SCORING":
                        new_status = "PASS"
                    elif old_status in {
                        "CLOSURE_RECOMMENDED",
                        "REJECTION_RECOMMENDED",
                    }:
                        new_status = "CLOSE_RECOMMENDED"
                        business_status = "Lezárásra javasolt"
                        if duplicate_ids:
                            reason_category = "Szemantikai duplikáció"
                            related_idea_id = str(duplicate_ids[0])
                        elif (
                            "adatvéd" in searchable_reason
                            or "biztons" in searchable_reason
                        ):
                            reason_category = "Adatvédelmi vagy biztonsági akadály"
                        elif (
                            "jogi" in searchable_reason
                            or "szabály" in searchable_reason
                        ):
                            reason_category = "Jogi vagy szabályozási akadály"
                        elif "hatókör" in searchable_reason:
                            reason_category = "Hatókörön kívüli"
                        elif "megvalósíthat" in searchable_reason:
                            reason_category = "Megvalósíthatatlan"
                        elif "elavult" in searchable_reason:
                            reason_category = "Elavult"
                        elif "érték" in searchable_reason:
                            reason_category = "Nincs hozzáadott érték"
                        else:
                            reason_category = "Nem ötlet"
                    elif old_status == "HUMAN_REVIEW_REQUIRED":
                        new_status = "NEEDS_CLARIFICATION"
                        business_status = "Pontosítandó"
                        reason_category = (
                            "Jogi, adatvédelmi vagy biztonsági vizsgálat szükséges"
                            if any(
                                token in searchable_reason
                                for token in ("jogi", "adatvéd", "biztons")
                            )
                            else "Nem egyértelmű megvalósíthatóság"
                        )
                        questions = [
                            "Mely konkrét tény vagy szakértői állásfoglalás szükséges a döntéshez?"
                        ]
                        requires_human_review = 1

                    confidence_percent = {
                        "low": 40,
                        "medium": 70,
                        "high": 90,
                    }.get(str(row["confidence"]), 0)
                    conn.execute(
                        """
                        UPDATE prescreen_results
                        SET prescreen_status = ?, business_status = ?,
                            reason_category = ?, related_idea_id = ?,
                            clarification_questions_json = ?, confidence_percent = ?,
                            requires_human_review = ?, criteria_version = ?,
                            legacy_status = COALESCE(legacy_status, ?)
                        WHERE id = ?
                        """,
                        (
                            new_status,
                            business_status,
                            reason_category,
                            related_idea_id,
                            _json(questions),
                            confidence_percent,
                            requires_human_review,
                            criteria_version,
                            old_status,
                            row["id"],
                        ),
                    )
                    if new_status != old_status:
                        key = f"{old_status}->{new_status}"
                        migrated_counts[key] = migrated_counts.get(key, 0) + 1

                now = utc_now()
                self._audit(
                    conn,
                    "PRESCREEN_STATUS_MIGRATION",
                    "system",
                    after={"migratedCounts": migrated_counts},
                    metadata={
                        "schemaVersion": 3,
                        "historyPreserved": True,
                        "rollingUpgradeRepair": migration_three_applied is not None,
                    },
                )
                conn.execute(
                    "INSERT OR IGNORE INTO schema_migrations(version, applied_at) "
                    "VALUES(3, ?)",
                    (now,),
                )

            migration_four_applied = conn.execute(
                "SELECT 1 FROM schema_migrations WHERE version = 4"
            ).fetchone()
            validation_failure_rows = conn.execute(
                """
                SELECT s.*, p.prompt_version, p.model_configuration_json
                FROM idea_processing s
                JOIN prescreen_results p ON p.id = s.current_prescreen_id
                WHERE s.processing_status = 'FAILED'
                  AND s.error_type IN (
                    'ValidationError', 'AIResultValidationError',
                    'LengthFinishReasonError', 'ContentFilterFinishReasonError'
                  )
                ORDER BY s.idea_id
                """
            ).fetchall()
            if migration_four_applied is None or validation_failure_rows:
                current_criteria = conn.execute(
                    "SELECT criteria_version FROM criteria_configs "
                    "ORDER BY config_version DESC LIMIT 1"
                ).fetchone()
                criteria_version = (
                    current_criteria["criteria_version"]
                    if current_criteria is not None
                    else DEFAULT_CRITERIA_VERSION
                )
                migrated_ids: list[str] = []
                ranking_changed = False
                for row in validation_failure_rows:
                    stage = str(row["processing_phase"] or "PRESCREEN")
                    payload = {
                        "prescreenStatus": "AI_RESPONSE_REVIEW_REQUIRED",
                        "businessStatus": None,
                        "reasonCategory": None,
                        "reason": (
                            "A korábbi AI-válasz validációs eltérés miatt nem volt "
                            "biztonságosan feldolgozható. A tétel technikai hiba "
                            "helyett emberi felülvizsgálatra került."
                        ),
                        "relatedIdeaId": None,
                        "relatedIdeaTitle": None,
                        "clarificationQuestions": [],
                        "confidencePercent": 0,
                        "requiresHumanReview": True,
                        "criteriaVersion": criteria_version,
                        "legacyStatus": (
                            f"{stage}_{row['error_type']}_RECLASSIFIED"
                        ),
                        "duplicateOfIdeaIds": [],
                        "duplicateExplanation": "",
                        "confidence": "low",
                        "evidence": [],
                        "missingInformation": [],
                        "criticalRiskFlags": [],
                        "promptVersion": row["prompt_version"],
                        "modelConfiguration": _loads(
                            row["model_configuration_json"], {}
                        ),
                        "technicalStatus": "REVIEW_REQUIRED",
                        "errorType": None,
                        "prescreenedAt": utc_now(),
                    }
                    prescreen_id = self._insert_prescreen(
                        conn,
                        str(row["idea_id"]),
                        str(row["source_data_hash"]),
                        payload,
                    )
                    conn.execute(
                        """
                        UPDATE idea_processing
                        SET processing_status = 'SUCCESS',
                            processing_phase = 'COMPLETE', claim_token = NULL,
                            completed_at = ?, error_type = NULL,
                            current_prescreen_id = ?, current_evaluation_id = NULL,
                            source_changed = 0
                        WHERE idea_id = ? AND processing_status = 'FAILED'
                        """,
                        (utc_now(), prescreen_id, row["idea_id"]),
                    )
                    ranking_changed = ranking_changed or (
                        row["current_evaluation_id"] is not None
                    )
                    migrated_ids.append(str(row["idea_id"]))

                now = utc_now()
                if ranking_changed:
                    conn.execute(
                        """
                        UPDATE ranking_state
                        SET ranking_version = ranking_version + 1,
                            updated_at = ?, updated_by = 'system'
                        WHERE singleton_id = 1
                        """,
                        (now,),
                    )
                self._audit(
                    conn,
                    "AI_RESPONSE_VALIDATION_RECLASSIFIED",
                    "system",
                    after={"ideaIds": migrated_ids},
                    metadata={
                        "schemaVersion": 4,
                        "technicalFailuresRemoved": len(migrated_ids),
                        "historyPreserved": True,
                        "rollingUpgradeRepair": migration_four_applied is not None,
                    },
                )
                conn.execute(
                    "INSERT OR IGNORE INTO schema_migrations(version, applied_at) "
                    "VALUES(4, ?)",
                    (now,),
                )

    def get_criteria_config(self) -> dict[str, Any]:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM criteria_configs ORDER BY config_version DESC LIMIT 1"
            ).fetchone()
        if row is None:  # pragma: no cover - migration always seeds this
            raise RuntimeError("Hiányzik az értékelési konfiguráció.")
        return {
            "configVersion": row["config_version"],
            "criteriaVersion": row["criteria_version"],
            "scoringVersion": row["scoring_version"],
            "criteria": _loads(row["criteria_json"], []),
            "updatedAt": row["updated_at"],
            "updatedBy": row["updated_by"],
            "changeType": row["change_type"],
        }

    def get_ranking_state(self) -> dict[str, Any]:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM ranking_state WHERE singleton_id = 1"
            ).fetchone()
        if row is None:  # pragma: no cover - migration always seeds this
            raise RuntimeError("Hiányzik a rangsor állapota.")
        return {
            "rankingVersion": row["ranking_version"],
            "manualOrder": _loads(row["manual_order_json"], []),
            "updatedAt": row["updated_at"],
            "updatedBy": row["updated_by"],
        }

    def list_processing(self) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM idea_processing").fetchall()
        return [dict(row) for row in rows]

    def get_processing(self, idea_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM idea_processing WHERE idea_id = ?", (idea_id,)
            ).fetchone()
        return dict(row) if row else None

    def claim_processing(
        self,
        idea_id: str,
        source_data_hash: str,
        *,
        retry_failed: bool = False,
        force: bool = False,
        stale_after: timedelta = timedelta(minutes=30),
    ) -> str | None:
        now = datetime.now(timezone.utc)
        with self.transaction() as conn:
            row = conn.execute(
                "SELECT * FROM idea_processing WHERE idea_id = ?", (idea_id,)
            ).fetchone()
            if row is None:
                claim_token = uuid.uuid4().hex
                conn.execute(
                    """
                    INSERT INTO idea_processing(
                        idea_id, source_data_hash, processing_status, processing_phase,
                        claim_token, attempt_count, started_at, source_changed
                    ) VALUES(?, ?, 'PROCESSING', 'PRESCREEN', ?, 1, ?, 0)
                    """,
                    (idea_id, source_data_hash, claim_token, now.isoformat()),
                )
                return claim_token

            previous_hash = row["source_data_hash"]
            status = row["processing_status"]
            started_at = datetime.fromisoformat(row["started_at"])
            stale_claim = status == "PROCESSING" and now - started_at > stale_after

            if status == "PROCESSING" and not stale_claim:
                return None
            if status == "SUCCESS" and not force:
                if previous_hash != source_data_hash:
                    conn.execute(
                        "UPDATE idea_processing SET source_changed = 1 WHERE idea_id = ?",
                        (idea_id,),
                    )
                return None
            if status == "FAILED" and not (retry_failed or force):
                return None

            retry_evaluation = (
                (status == "FAILED" or stale_claim)
                and not force
                and row["processing_phase"] == "EVALUATION"
                and previous_hash == source_data_hash
                and row["current_prescreen_id"] is not None
            )
            phase = "EVALUATION" if retry_evaluation else "PRESCREEN"
            claim_token = uuid.uuid4().hex

            conn.execute(
                """
                UPDATE idea_processing
                SET source_data_hash = ?, processing_status = 'PROCESSING',
                    processing_phase = ?, claim_token = ?,
                    attempt_count = attempt_count + 1, started_at = ?, completed_at = NULL,
                    error_type = NULL, source_changed = ?
                WHERE idea_id = ?
                """,
                (
                    source_data_hash,
                    phase,
                    claim_token,
                    now.isoformat(),
                    1 if previous_hash != source_data_hash else 0,
                    idea_id,
                ),
            )
            return claim_token

    def claim_evaluation(
        self,
        idea_id: str,
        source_data_hash: str,
        prescreen_id: int,
        *,
        allow_review_required: bool = False,
        stale_after: timedelta = timedelta(minutes=30),
    ) -> str | None:
        """Claim scoring for the current, unchanged prescreen revision.

        A structured AI response that needs human review may only be bypassed by
        an explicit, audited human ALLOW_SCORING decision. Callers opt into that
        narrow path with ``allow_review_required``.
        """
        now = datetime.now(timezone.utc)
        with self.transaction() as conn:
            row = conn.execute(
                """
                SELECT s.*, p.source_data_hash AS prescreen_source_data_hash,
                       p.technical_status AS prescreen_technical_status
                FROM idea_processing s
                JOIN prescreen_results p ON p.id = s.current_prescreen_id
                WHERE s.idea_id = ? AND s.current_prescreen_id = ?
                """,
                (idea_id, prescreen_id),
            ).fetchone()
            if row is None:
                return None
            started_at = datetime.fromisoformat(row["started_at"])
            active_claim = (
                row["processing_status"] == "PROCESSING"
                and now - started_at <= stale_after
            )
            if (
                active_claim
                or (
                    row["processing_status"] == "PROCESSING"
                    and row["processing_phase"] != "EVALUATION"
                )
                or row["source_data_hash"] != source_data_hash
                or row["prescreen_source_data_hash"] != source_data_hash
                or row["source_changed"]
                or row["prescreen_technical_status"]
                not in (
                    {"SUCCESS", "REVIEW_REQUIRED"}
                    if allow_review_required
                    else {"SUCCESS"}
                )
            ):
                return None

            claim_token = uuid.uuid4().hex
            conn.execute(
                """
                UPDATE idea_processing
                SET processing_status = 'PROCESSING', processing_phase = 'EVALUATION',
                    claim_token = ?, attempt_count = attempt_count + 1,
                    started_at = ?, completed_at = NULL, error_type = NULL
                WHERE idea_id = ? AND current_prescreen_id = ?
                """,
                (claim_token, now.isoformat(), idea_id, prescreen_id),
            )
            return claim_token

    def mark_source_changes(self, current_hashes: dict[str, str]) -> None:
        """Mark changed source rows without overwriting any historical evaluation."""
        with self.transaction() as conn:
            for idea_id, current_hash in current_hashes.items():
                conn.execute(
                    """
                    UPDATE idea_processing
                    SET source_changed = CASE WHEN source_data_hash <> ? THEN 1 ELSE 0 END
                    WHERE idea_id = ? AND processing_status IN ('SUCCESS', 'FAILED')
                    """,
                    (current_hash, idea_id),
                )

    def save_prescreen_success(
        self,
        idea_id: str,
        source_data_hash: str,
        claim_token: str,
        prescreen: dict[str, Any],
    ) -> int:
        with self.transaction() as conn:
            state = conn.execute(
                "SELECT * FROM idea_processing WHERE idea_id = ?",
                (idea_id,),
            ).fetchone()
            if (
                state is None
                or state["processing_status"] != "PROCESSING"
                or state["processing_phase"] != "PRESCREEN"
                or state["claim_token"] != claim_token
                or state["source_data_hash"] != source_data_hash
            ):
                raise StoreConflictError(
                    "Az előszűrési claim lejárt vagy már nem aktuális."
                )

            prescreen_id = self._insert_prescreen(
                conn, idea_id, source_data_hash, prescreen
            )
            passed = prescreen["prescreenStatus"] == "PASS"
            completed_at = None if passed else utc_now()
            next_status = "PROCESSING" if passed else "SUCCESS"
            next_phase = "EVALUATION" if passed else "COMPLETE"
            next_claim = claim_token if passed else None
            cursor = conn.execute(
                """
                UPDATE idea_processing
                SET processing_status = ?, processing_phase = ?, claim_token = ?,
                    started_at = ?, completed_at = ?, error_type = NULL,
                    current_prescreen_id = ?, current_evaluation_id = NULL,
                    source_changed = 0
                WHERE idea_id = ? AND processing_status = 'PROCESSING'
                  AND processing_phase = 'PRESCREEN' AND claim_token = ?
                  AND source_data_hash = ?
                """,
                (
                    next_status,
                    next_phase,
                    next_claim,
                    utc_now(),
                    completed_at,
                    prescreen_id,
                    idea_id,
                    claim_token,
                    source_data_hash,
                ),
            )
            if cursor.rowcount != 1:  # pragma: no cover - protected by write lock
                raise StoreConflictError(
                    "Az előszűrési claim mentés közben már nem volt aktuális."
                )
            if state["current_evaluation_id"] is not None:
                conn.execute(
                    """
                    UPDATE ranking_state
                    SET ranking_version = ranking_version + 1,
                        updated_at = ?, updated_by = 'system'
                    WHERE singleton_id = 1
                    """,
                    (utc_now(),),
                )
            return prescreen_id

    def save_evaluation_success(
        self,
        idea_id: str,
        source_data_hash: str,
        claim_token: str,
        evaluation: dict[str, Any],
    ) -> int:
        with self.transaction() as conn:
            state = conn.execute(
                "SELECT * FROM idea_processing WHERE idea_id = ?",
                (idea_id,),
            ).fetchone()
            if (
                state is None
                or state["processing_status"] != "PROCESSING"
                or state["processing_phase"] != "EVALUATION"
                or state["claim_token"] != claim_token
                or state["source_data_hash"] != source_data_hash
                or state["current_prescreen_id"] is None
            ):
                raise StoreConflictError(
                    "A pontozási claim lejárt vagy már nem aktuális."
                )
            config = conn.execute(
                "SELECT * FROM criteria_configs ORDER BY config_version DESC LIMIT 1"
            ).fetchone()
            if (
                config is None
                or evaluation["criteriaVersion"] != config["criteria_version"]
                or evaluation["scoringVersion"] != config["scoring_version"]
            ):
                raise StoreConflictError(
                    "A pontozás alatt megváltozott az értékelési konfiguráció."
                )

            evaluation_id = self._insert_evaluation(
                conn,
                idea_id,
                source_data_hash,
                int(state["current_prescreen_id"]),
                evaluation,
            )
            cursor = conn.execute(
                """
                UPDATE idea_processing
                SET processing_status = 'SUCCESS', processing_phase = 'COMPLETE',
                    claim_token = NULL, completed_at = ?, error_type = NULL,
                    current_evaluation_id = ?, source_changed = 0
                WHERE idea_id = ? AND processing_status = 'PROCESSING'
                  AND processing_phase = 'EVALUATION' AND claim_token = ?
                  AND source_data_hash = ?
                """,
                (utc_now(), evaluation_id, idea_id, claim_token, source_data_hash),
            )
            if cursor.rowcount != 1:  # pragma: no cover - protected by write lock
                raise StoreConflictError(
                    "A pontozási claim mentés közben már nem volt aktuális."
                )
            conn.execute(
                """
                UPDATE ranking_state
                SET ranking_version = ranking_version + 1,
                    updated_at = ?, updated_by = 'system'
                WHERE singleton_id = 1
                """,
                (utc_now(),),
            )
            return evaluation_id

    def save_ai_response_review_required(
        self,
        idea_id: str,
        source_data_hash: str,
        claim_token: str,
        prescreen: dict[str, Any],
        stage: str,
    ) -> int:
        """Finish a claim safely when the reached AI returned unusable structure."""

        if stage not in {"PRESCREEN", "EVALUATION"}:
            raise ValueError("Ismeretlen feldolgozási fázis.")
        with self.transaction() as conn:
            state = conn.execute(
                "SELECT * FROM idea_processing WHERE idea_id = ?",
                (idea_id,),
            ).fetchone()
            if (
                state is None
                or state["processing_status"] != "PROCESSING"
                or state["processing_phase"] != stage
                or state["claim_token"] != claim_token
                or state["source_data_hash"] != source_data_hash
            ):
                raise StoreConflictError(
                    "Az AI-válasz felülvizsgálati állapota lejárt claimhez nem menthető."
                )

            prescreen_id = self._insert_prescreen(
                conn, idea_id, source_data_hash, prescreen
            )
            cursor = conn.execute(
                """
                UPDATE idea_processing
                SET processing_status = 'SUCCESS', processing_phase = 'COMPLETE',
                    claim_token = NULL, completed_at = ?, error_type = NULL,
                    current_prescreen_id = ?, current_evaluation_id = NULL,
                    source_changed = 0
                WHERE idea_id = ? AND processing_status = 'PROCESSING'
                  AND processing_phase = ? AND claim_token = ?
                  AND source_data_hash = ?
                """,
                (
                    utc_now(),
                    prescreen_id,
                    idea_id,
                    stage,
                    claim_token,
                    source_data_hash,
                ),
            )
            if cursor.rowcount != 1:  # pragma: no cover - protected by write lock
                raise StoreConflictError(
                    "Az AI-válasz felülvizsgálati állapota mentés közben lejárt."
                )
            if state["current_evaluation_id"] is not None:
                conn.execute(
                    """
                    UPDATE ranking_state
                    SET ranking_version = ranking_version + 1,
                        updated_at = ?, updated_by = 'system'
                    WHERE singleton_id = 1
                    """,
                    (utc_now(),),
                )
            return prescreen_id

    def save_failure(
        self,
        idea_id: str,
        source_data_hash: str,
        claim_token: str,
        error_type: str,
        prompt_version: str,
        model_configuration: dict[str, Any],
        stage: str,
    ) -> int:
        if stage not in {"PRESCREEN", "EVALUATION"}:
            raise ValueError("Ismeretlen feldolgozási fázis.")
        payload = {
            "prescreenStatus": "FAILED",
            "businessStatus": None,
            "reasonCategory": None,
            "reason": "A technikai feldolgozás sikertelen; az ötlet később újrapróbálható.",
            "relatedIdeaId": None,
            "relatedIdeaTitle": None,
            "clarificationQuestions": [],
            "confidencePercent": 0,
            "requiresHumanReview": False,
            "criteriaVersion": self.get_criteria_config()["criteriaVersion"],
            "duplicateOfIdeaIds": [],
            "duplicateExplanation": "",
            "confidence": "low",
            "evidence": [],
            "missingInformation": [],
            "criticalRiskFlags": [],
            "promptVersion": prompt_version,
            "modelConfiguration": model_configuration,
            "technicalStatus": "FAILED",
            "errorType": error_type,
            "prescreenedAt": utc_now(),
        }
        with self.transaction() as conn:
            state = conn.execute(
                "SELECT * FROM idea_processing WHERE idea_id = ?",
                (idea_id,),
            ).fetchone()
            if (
                state is None
                or state["processing_status"] != "PROCESSING"
                or state["processing_phase"] != stage
                or state["claim_token"] != claim_token
                or state["source_data_hash"] != source_data_hash
            ):
                raise StoreConflictError(
                    "A hibát egy lejárt vagy már lezárt claimhez nem lehet menteni."
                )

            if stage == "PRESCREEN":
                prescreen_id = self._insert_prescreen(
                    conn, idea_id, source_data_hash, payload
                )
                current_evaluation_id = None
            else:
                if state["current_prescreen_id"] is None:
                    raise StoreConflictError(
                        "Pontozási hiba nem menthető sikeres előszűrés nélkül."
                    )
                prescreen_id = int(state["current_prescreen_id"])
                current_evaluation_id = state["current_evaluation_id"]

            cursor = conn.execute(
                """
                UPDATE idea_processing
                SET processing_status = 'FAILED', processing_phase = ?,
                    claim_token = NULL, completed_at = ?, error_type = ?,
                    current_prescreen_id = ?, current_evaluation_id = ?
                WHERE idea_id = ? AND processing_status = 'PROCESSING'
                  AND processing_phase = ? AND claim_token = ?
                  AND source_data_hash = ?
                """,
                (
                    stage,
                    utc_now(),
                    error_type,
                    prescreen_id,
                    current_evaluation_id,
                    idea_id,
                    stage,
                    claim_token,
                    source_data_hash,
                ),
            )
            if cursor.rowcount != 1:  # pragma: no cover - protected by write lock
                raise StoreConflictError(
                    "A feldolgozási claim mentés közben már nem volt aktuális."
                )
            if stage == "PRESCREEN" and state["current_evaluation_id"] is not None:
                conn.execute(
                    """
                    UPDATE ranking_state
                    SET ranking_version = ranking_version + 1,
                        updated_at = ?, updated_by = 'system'
                    WHERE singleton_id = 1
                    """,
                    (utc_now(),),
                )
            return prescreen_id

    def _insert_prescreen(
        self,
        conn: sqlite3.Connection,
        idea_id: str,
        source_data_hash: str,
        data: dict[str, Any],
    ) -> int:
        cursor = conn.execute(
            """
            INSERT INTO prescreen_results(
                idea_id, source_data_hash, prescreen_status, business_status,
                reason_category, reason, related_idea_id, related_idea_title,
                clarification_questions_json, confidence_percent,
                requires_human_review, criteria_version, legacy_status,
                duplicate_ids_json, duplicate_explanation, confidence,
                evidence_json, missing_information_json, critical_risk_flags_json,
                prompt_version, model_configuration_json, technical_status,
                error_type, prescreened_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                idea_id,
                source_data_hash,
                data["prescreenStatus"],
                data.get("businessStatus"),
                data.get("reasonCategory"),
                data["reason"],
                data.get("relatedIdeaId"),
                data.get("relatedIdeaTitle"),
                _json(data.get("clarificationQuestions", [])),
                data.get("confidencePercent", 0),
                1 if data.get("requiresHumanReview", False) else 0,
                data.get("criteriaVersion"),
                data.get("legacyStatus"),
                _json(data.get("duplicateOfIdeaIds", [])),
                data.get("duplicateExplanation", ""),
                data.get("confidence", "low"),
                _json(data.get("evidence", [])),
                _json(data.get("missingInformation", [])),
                _json(data.get("criticalRiskFlags", [])),
                data["promptVersion"],
                _json(data["modelConfiguration"]),
                data.get("technicalStatus", "SUCCESS"),
                data.get("errorType"),
                data.get("prescreenedAt") or utc_now(),
            ),
        )
        if cursor.lastrowid is None:  # pragma: no cover - SQLite INSERT contract
            raise RuntimeError("Az előszűrés mentése nem adott azonosítót.")
        return int(cursor.lastrowid)

    def _insert_evaluation(
        self,
        conn: sqlite3.Connection,
        idea_id: str,
        source_data_hash: str,
        prescreen_id: int,
        data: dict[str, Any],
    ) -> int:
        cursor = conn.execute(
            """
            INSERT INTO evaluations(
                idea_id, prescreen_id, source_data_hash, overall_score,
                overall_rationale, summary, strengths_json, weaknesses_json,
                next_steps_json, critical_risk_flags_json, confidence,
                criteria_scores_json, criteria_snapshot_json,
                positive_contributions_json, limiting_contributions_json,
                criteria_version, scoring_version, evaluation_prompt_version,
                model_configuration_json, human_review_required, evaluated_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                idea_id,
                prescreen_id,
                source_data_hash,
                data["overallScore"],
                data["overallRationale"],
                data["summary"],
                _json(data.get("strengths", [])),
                _json(data.get("weaknesses", [])),
                _json(data.get("nextSteps", [])),
                _json(data.get("criticalRiskFlags", [])),
                data.get("confidence", "low"),
                _json(data["criteriaScores"]),
                _json(data["criteriaSnapshot"]),
                _json(data.get("positiveContributions", [])),
                _json(data.get("limitingContributions", [])),
                data["criteriaVersion"],
                data["scoringVersion"],
                data["evaluationPromptVersion"],
                _json(data["modelConfiguration"]),
                1 if data.get("humanReviewRequired", True) else 0,
                data.get("evaluatedAt") or utc_now(),
            ),
        )
        if cursor.lastrowid is None:  # pragma: no cover - SQLite INSERT contract
            raise RuntimeError("Az értékelés mentése nem adott azonosítót.")
        return int(cursor.lastrowid)

    def list_current_prescreens(self) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute("""
                SELECT p.*, s.processing_status, s.source_changed,
                       s.error_type AS processing_error_type,
                       o.human_decision, o.comment AS human_comment,
                       o.actor AS human_actor, o.created_at AS human_decided_at
                FROM idea_processing s
                JOIN prescreen_results p ON p.id = s.current_prescreen_id
                LEFT JOIN prescreen_overrides o ON o.id = (
                    SELECT id FROM prescreen_overrides
                    WHERE idea_id = s.idea_id AND prescreen_id = p.id
                    ORDER BY id DESC LIMIT 1
                )
                """).fetchall()
        return [self._prescreen_dict(row) for row in rows]

    def get_current_prescreen(self, idea_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                """
                SELECT p.*, s.processing_status, s.source_changed,
                       s.error_type AS processing_error_type,
                       o.human_decision, o.comment AS human_comment,
                       o.actor AS human_actor, o.created_at AS human_decided_at
                FROM idea_processing s
                JOIN prescreen_results p ON p.id = s.current_prescreen_id
                LEFT JOIN prescreen_overrides o ON o.id = (
                    SELECT id FROM prescreen_overrides
                    WHERE idea_id = s.idea_id AND prescreen_id = p.id
                    ORDER BY id DESC LIMIT 1
                )
                WHERE s.idea_id = ?
                """,
                (idea_id,),
            ).fetchone()
        return self._prescreen_dict(row) if row else None

    @staticmethod
    def _prescreen_dict(row: sqlite3.Row) -> dict[str, Any]:
        data = dict(row)
        data["duplicate_ids"] = _loads(data.pop("duplicate_ids_json"), [])
        data["clarification_questions"] = _loads(
            data.pop("clarification_questions_json"), []
        )
        data["evidence"] = _loads(data.pop("evidence_json"), [])
        data["missing_information"] = _loads(data.pop("missing_information_json"), [])
        data["critical_risk_flags"] = _loads(data.pop("critical_risk_flags_json"), [])
        data["model_configuration"] = _loads(data.pop("model_configuration_json"), {})
        data["requires_human_review"] = bool(data["requires_human_review"])
        return data

    def list_current_evaluations(self) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute("""
                SELECT e.*, s.source_changed
                FROM idea_processing s
                JOIN evaluations e ON e.id = s.current_evaluation_id
                """).fetchall()
        return [self._evaluation_dict(row) for row in rows]

    def get_current_evaluation(self, idea_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                """
                SELECT e.*, s.source_changed
                FROM idea_processing s
                JOIN evaluations e ON e.id = s.current_evaluation_id
                WHERE s.idea_id = ?
                """,
                (idea_id,),
            ).fetchone()
        return self._evaluation_dict(row) if row else None

    @staticmethod
    def _evaluation_dict(row: sqlite3.Row) -> dict[str, Any]:
        data = dict(row)
        for key in (
            "strengths",
            "weaknesses",
            "next_steps",
            "critical_risk_flags",
            "criteria_scores",
            "criteria_snapshot",
            "positive_contributions",
            "limiting_contributions",
            "model_configuration",
        ):
            data[key] = _loads(
                data.pop(f"{key}_json"), [] if key != "model_configuration" else {}
            )
        data["human_review_required"] = bool(data["human_review_required"])
        return data

    def save_override(
        self,
        idea_id: str,
        decision: str,
        comment: str,
        actor: str,
    ) -> dict[str, Any]:
        with self.transaction() as conn:
            prescreen = conn.execute(
                """
                SELECT p.* FROM idea_processing s
                JOIN prescreen_results p ON p.id = s.current_prescreen_id
                WHERE s.idea_id = ?
                """,
                (idea_id,),
            ).fetchone()
            if prescreen is None:
                raise KeyError(idea_id)
            created_at = utc_now()
            cursor = conn.execute(
                """
                INSERT INTO prescreen_overrides(
                    idea_id, prescreen_id, original_status, original_reason,
                    human_decision, comment, actor, prescreen_prompt_version, created_at
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    idea_id,
                    prescreen["id"],
                    prescreen["prescreen_status"],
                    prescreen["reason"],
                    decision,
                    comment,
                    actor,
                    prescreen["prompt_version"],
                    created_at,
                ),
            )
            self._audit(
                conn,
                "PRESCREEN_OVERRIDE",
                actor,
                idea_id=idea_id,
                before={
                    "status": prescreen["prescreen_status"],
                    "reason": prescreen["reason"],
                },
                after={"decision": decision, "comment": comment},
            )
            conn.execute(
                """
                UPDATE ranking_state
                SET ranking_version = ranking_version + 1,
                    updated_at = ?, updated_by = ?
                WHERE singleton_id = 1
                """,
                (created_at, actor),
            )
            if cursor.lastrowid is None:  # pragma: no cover - SQLite INSERT contract
                raise RuntimeError("A felülbírálás mentése nem adott azonosítót.")
            return {"id": int(cursor.lastrowid), "createdAt": created_at}

    def stage_weight_update(
        self,
        *,
        expected_config_version: int,
        criteria: list[dict[str, Any]],
        actor: str,
    ) -> dict[str, Any]:
        """Persist changed weights while keeping the currently visible ranking valid."""

        with self.transaction() as conn:
            current = conn.execute(
                "SELECT * FROM criteria_configs ORDER BY config_version DESC LIMIT 1"
            ).fetchone()
            if current is None or current["config_version"] != expected_config_version:
                raise StoreConflictError(
                    "Az értékelési beállításokat időközben más módosította."
                )
            ranking = conn.execute(
                "SELECT ranking_version FROM ranking_state WHERE singleton_id = 1"
            ).fetchone()
            new_config_version = expected_config_version + 1
            now = utc_now()
            conn.execute(
                """
                INSERT INTO criteria_configs(
                    config_version, criteria_version, scoring_version, criteria_json,
                    change_type, updated_at, updated_by
                ) VALUES(?, ?, ?, ?, 'WEIGHTS_PENDING', ?, ?)
                """,
                (
                    new_config_version,
                    current["criteria_version"],
                    current["scoring_version"],
                    _json(criteria),
                    now,
                    actor,
                ),
            )
            self._audit(
                conn,
                "WEIGHT_UPDATE_STAGED",
                actor,
                before={
                    "configVersion": current["config_version"],
                    "criteria": _loads(current["criteria_json"], []),
                },
                after={
                    "configVersion": new_config_version,
                    "criteria": criteria,
                },
                metadata={
                    "rankingPreserved": True,
                    "aiCalled": False,
                    "requiresWeightRescore": True,
                },
            )
            return {
                "configVersion": new_config_version,
                "rankingVersion": int(ranking["ranking_version"]),
                "updatedAt": now,
            }

    def apply_criteria_update(
        self,
        *,
        expected_config_version: int,
        criteria_version: str,
        scoring_version: str,
        criteria: list[dict[str, Any]],
        change_type: str,
        actor: str,
        evaluation_copies: list[tuple[int, dict[str, Any]]],
    ) -> dict[str, Any]:
        with self.transaction() as conn:
            current = conn.execute(
                "SELECT * FROM criteria_configs ORDER BY config_version DESC LIMIT 1"
            ).fetchone()
            if current is None or current["config_version"] != expected_config_version:
                raise StoreConflictError(
                    "Az értékelési beállításokat időközben más módosította."
                )
            if change_type in {"WEIGHTS_ONLY", "RESCORE_ALL"}:
                expected_evaluation_ids = {
                    int(row["current_evaluation_id"])
                    for row in conn.execute(
                        """
                        SELECT s.current_evaluation_id
                        FROM idea_processing s
                        JOIN evaluations e ON e.id = s.current_evaluation_id
                        WHERE e.criteria_version = ?
                        """,
                        (current["criteria_version"],),
                    ).fetchall()
                }
                supplied_evaluation_ids = {
                    old_evaluation_id
                    for old_evaluation_id, _payload in evaluation_copies
                }
                if (
                    len(supplied_evaluation_ids) != len(evaluation_copies)
                    or supplied_evaluation_ids != expected_evaluation_ids
                ):
                    raise StoreConflictError(
                        "Az értékelések a súlymódosítás közben megváltoztak."
                    )
            new_config_version = expected_config_version + 1
            now = utc_now()
            conn.execute(
                """
                INSERT INTO criteria_configs(
                    config_version, criteria_version, scoring_version, criteria_json,
                    change_type, updated_at, updated_by
                ) VALUES(?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_config_version,
                    criteria_version,
                    scoring_version,
                    _json(criteria),
                    change_type,
                    now,
                    actor,
                ),
            )
            for old_evaluation_id, payload in evaluation_copies:
                old = conn.execute(
                    "SELECT * FROM evaluations WHERE id = ?", (old_evaluation_id,)
                ).fetchone()
                if old is None:
                    raise StoreConflictError(
                        "Az újrasúlyozandó értékelés már nem található."
                    )
                processing = conn.execute(
                    "SELECT current_evaluation_id FROM idea_processing WHERE idea_id = ?",
                    (old["idea_id"],),
                ).fetchone()
                if (
                    processing is None
                    or processing["current_evaluation_id"] != old_evaluation_id
                ):
                    raise StoreConflictError(
                        "Az értékelés a súlymódosítás közben megváltozott."
                    )
                evaluation_id = self._insert_evaluation(
                    conn,
                    old["idea_id"],
                    old["source_data_hash"],
                    old["prescreen_id"],
                    payload,
                )
                cursor = conn.execute(
                    """
                    UPDATE idea_processing SET current_evaluation_id = ?
                    WHERE idea_id = ? AND current_evaluation_id = ?
                    """,
                    (evaluation_id, old["idea_id"], old_evaluation_id),
                )
                if cursor.rowcount != 1:  # pragma: no cover - protected by write lock
                    raise StoreConflictError(
                        "Az értékelés mutatója mentés közben megváltozott."
                    )
            ranking = conn.execute(
                "SELECT * FROM ranking_state WHERE singleton_id = 1"
            ).fetchone()
            next_ranking_version = int(ranking["ranking_version"]) + 1
            conn.execute(
                """
                UPDATE ranking_state SET ranking_version = ?, updated_at = ?, updated_by = ?
                WHERE singleton_id = 1
                """,
                (next_ranking_version, now, actor),
            )
            self._audit(
                conn,
                "CRITERIA_UPDATE",
                actor,
                before={
                    "configVersion": current["config_version"],
                    "criteriaVersion": current["criteria_version"],
                    "scoringVersion": current["scoring_version"],
                    "criteria": _loads(current["criteria_json"], []),
                },
                after={
                    "configVersion": new_config_version,
                    "criteriaVersion": criteria_version,
                    "scoringVersion": scoring_version,
                    "criteria": criteria,
                },
                metadata={"changeType": change_type},
            )
            return {
                "configVersion": new_config_version,
                "rankingVersion": next_ranking_version,
                "updatedAt": now,
            }

    def save_manual_order(
        self,
        idea_ids: list[str],
        expected_ranking_version: int,
        actor: str,
    ) -> dict[str, Any]:
        with self.transaction() as conn:
            current = conn.execute(
                "SELECT * FROM ranking_state WHERE singleton_id = 1"
            ).fetchone()
            if (
                current is None
                or current["ranking_version"] != expected_ranking_version
            ):
                raise StoreConflictError("A rangsort időközben más módosította.")
            old_order = _loads(current["manual_order_json"], [])
            new_version = expected_ranking_version + 1
            now = utc_now()
            conn.execute(
                """
                UPDATE ranking_state
                SET ranking_version = ?, manual_order_json = ?, updated_at = ?, updated_by = ?
                WHERE singleton_id = 1
                """,
                (new_version, _json(idea_ids), now, actor),
            )
            self._audit(
                conn,
                "RANKING_ORDER_UPDATE",
                actor,
                before={
                    "ideaIds": old_order,
                    "rankingVersion": expected_ranking_version,
                },
                after={"ideaIds": idea_ids, "rankingVersion": new_version},
                metadata={"affectedIdeaIds": sorted(set(old_order).union(idea_ids))},
            )
            return {"rankingVersion": new_version, "updatedAt": now}

    def reset_manual_order(
        self, expected_ranking_version: int, actor: str
    ) -> dict[str, Any]:
        return self.save_manual_order([], expected_ranking_version, actor)

    def reset_all_processing(self, actor: str, reason: str) -> dict[str, Any]:
        """Clear operational ranking data atomically while preserving settings/audit."""

        with self.transaction() as conn:
            deleted_counts = {
                "processing": int(
                    conn.execute("SELECT COUNT(1) FROM idea_processing").fetchone()[0]
                ),
                "prescreens": int(
                    conn.execute("SELECT COUNT(1) FROM prescreen_results").fetchone()[0]
                ),
                "evaluations": int(
                    conn.execute("SELECT COUNT(1) FROM evaluations").fetchone()[0]
                ),
                "overrides": int(
                    conn.execute("SELECT COUNT(1) FROM prescreen_overrides").fetchone()[
                        0
                    ]
                ),
            }
            ranking = conn.execute(
                "SELECT * FROM ranking_state WHERE singleton_id = 1"
            ).fetchone()
            if ranking is None:  # pragma: no cover - migration seeds singleton
                raise RuntimeError("Hiányzik a rangsor állapota.")

            conn.execute("DELETE FROM idea_processing")
            conn.execute("DELETE FROM prescreen_overrides")
            conn.execute("DELETE FROM evaluations")
            conn.execute("DELETE FROM prescreen_results")

            new_ranking_version = int(ranking["ranking_version"]) + 1
            now = utc_now()
            conn.execute(
                """
                UPDATE ranking_state
                SET ranking_version = ?, manual_order_json = '[]',
                    updated_at = ?, updated_by = ?
                WHERE singleton_id = 1
                """,
                (new_ranking_version, now, actor),
            )
            self._audit(
                conn,
                "RANKING_FULL_RESET",
                actor,
                before={
                    "rankingVersion": ranking["ranking_version"],
                    "manualOrder": _loads(ranking["manual_order_json"], []),
                    "operationalCounts": deleted_counts,
                },
                after={
                    "rankingVersion": new_ranking_version,
                    "operationalCounts": {
                        "processing": 0,
                        "prescreens": 0,
                        "evaluations": 0,
                        "overrides": 0,
                    },
                },
                metadata={
                    "reason": reason,
                    "criteriaConfigurationPreserved": True,
                    "auditHistoryPreserved": True,
                },
            )
            return {
                "status": "ok",
                "deletedCounts": deleted_counts,
                "rankingVersion": new_ranking_version,
                "resetAt": now,
            }

    @staticmethod
    def _audit(
        conn: sqlite3.Connection,
        action: str,
        actor: str,
        *,
        idea_id: str | None = None,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        conn.execute(
            """
            INSERT INTO audit_log(
                action, idea_id, actor, before_json, after_json, metadata_json, created_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            (
                action,
                idea_id,
                actor,
                _json(before) if before is not None else None,
                _json(after) if after is not None else None,
                _json(metadata or {}),
                utc_now(),
            ),
        )

    def list_audit(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["before"] = _loads(item.pop("before_json"), None)
            item["after"] = _loads(item.pop("after_json"), None)
            item["metadata"] = _loads(item.pop("metadata_json"), {})
            result.append(item)
        return result

    def record_action(
        self,
        action: str,
        actor: str,
        *,
        idea_id: str | None = None,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with self.transaction() as conn:
            self._audit(
                conn,
                action,
                actor,
                idea_id=idea_id,
                before=before,
                after=after,
                metadata=metadata,
            )
