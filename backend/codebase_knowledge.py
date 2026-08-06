"""Safe, local retrieval over the dashboard's production source code.

The index deliberately reads only an explicit backend allowlist and production
files under ``frontend/src``. Environment files, data, logs, databases, build
artifacts and tests can therefore never become model context.
"""

from __future__ import annotations

import hashlib
import math
import re
import threading
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

BACKEND_ALLOWLIST = (
    "server.py",
    "ai_dashboard.py",
    "ranking_models.py",
    "ranking_service.py",
    "ranking_store.py",
)
FRONTEND_EXTENSIONS = {".js", ".jsx"}
CHUNK_LINES = 36
CHUNK_OVERLAP = 7
MAX_SOURCE_FILE_BYTES = 300_000
MAX_CHUNK_CHARS = 5_000
DEFAULT_CONTEXT_CHARS = 24_000

STOP_WORDS = {
    "a",
    "az",
    "egy",
    "es",
    "hogy",
    "hogyan",
    "hol",
    "mi",
    "mit",
    "milyen",
    "melyik",
    "van",
    "vagy",
    "ami",
    "ezt",
    "ennek",
    "arra",
    "meg",
    "is",
    "be",
    "ki",
    "le",
}

# Query-only expansions improve Hungarian business-language lookup without
# hard-coding answers. The retrieved code remains the only factual evidence.
QUERY_EXPANSIONS: dict[str, tuple[str, ...]] = {
    "adatforras": ("records", "excel", "read_excel", "fetchrecords", "api"),
    "forras": ("records", "excel", "api"),
    "kpi": ("compute", "summary", "dashboard", "kpicard"),
    "keplet": ("compute", "calculate", "rate", "sum", "filter"),
    "szamol": ("compute", "calculate", "filter", "length", "reduce"),
    "szamitas": ("compute", "calculate", "filter", "length", "reduce"),
    "szuro": ("filter", "filters", "filtered", "datacontext", "filterbar"),
    "szurok": ("filter", "filters", "filtered", "datacontext", "filterbar"),
    "szurt": ("filter", "filters", "filtered", "datacontext", "filterbar"),
    "szures": ("filter", "filters", "filtered", "datacontext", "filterbar"),
    "osszefoglalo": ("dashboard", "summary", "computesummary"),
    "roadmap": ("backlog", "allapot", "statisticsrecords"),
    "backlog": ("roadmap", "allapot", "computesummary"),
    "rangsor": ("ranking", "overallscore", "airank", "finalrank"),
    "pontszam": ("score", "weighted", "overallscore", "criteria"),
    "suly": (
        "weight",
        "weighted",
        "rescore",
        "calculate_weighted_score",
        "stage_weight_update",
    ),
    "sulyozas": (
        "weight",
        "weighted",
        "weights_only",
        "weightrescore",
        "scoringversion",
    ),
    "ujrapontozas": (
        "rescore",
        "rescore_all",
        "weightrescore",
        "weights_pending",
        "calculate_weighted_score",
    ),
    "ujraprobalas": (
        "retry",
        "retry_failed",
        "ai_reachability_attempts",
        "aireachabilityerror",
    ),
    "technikai": (
        "technical_failure",
        "ai_reachability_attempts",
        "save_failure",
        "reachabilityattempts",
    ),
    "felulvizsgalat": (
        "human_review",
        "ai_response_review_required",
        "requires_human_review",
        "save_ai_response_review_required",
    ),
    "feldolgozas": (
        "processing",
        "batchprocessing",
        "process_batch",
        "progresscallback",
    ),
    "program": ("programtags", "programname", "isnamedprogram"),
    "debora": ("chat", "knowledge", "response"),
}

DASHBOARD_QUERY_TERMS = (
    "dashboard",
    "kpi",
    "roadmap",
    "backlog",
    "szűr",
    "szur",
    "adatforrás",
    "adatforras",
    "számol",
    "szamol",
    "képlet",
    "keplet",
    "érték",
    "ertek",
    "ötlet",
    "otlet",
    "rangsor",
    "program",
)
DASHBOARD_SUPPLEMENTAL_QUERIES = (
    (
        "DataContext filters search hay period cutoff months letrehozva szűrés",
        2,
    ),
    (
        "DataContext filtered initialFilters fetchRecords /api/records szűrés",
        2,
    ),
    (
        "api_router get records async def get_records loaded_at count source "
        "read_excel normalise_row adatforrás",
        3,
    ),
)

RANKING_QUERY_TERMS = (
    "rangsor",
    "pontszám",
    "pontszam",
    "súly",
    "suly",
    "újrapont",
    "ujrapont",
    "újraértékel",
    "ujraertekel",
    "technikai hiba",
    "retry",
    "újraprób",
    "ujraprob",
    "felülvizsgál",
    "felulvizsgal",
)
RANKING_WEIGHT_QUERY_TERMS = (
    "súly",
    "suly",
    "újrapont",
    "ujrapont",
    "pontszám",
    "pontszam",
)
RANKING_RELIABILITY_QUERY_TERMS = (
    "technikai",
    "hiba",
    "retry",
    "újraprób",
    "ujraprob",
    "felülvizsgál",
    "felulvizsgal",
    "ai-válasz",
    "ai valasz",
)
RANKING_BASE_SUPPLEMENTAL_QUERIES = (
    (
        "RankingService process_batch workflowState ProcessingSummary "
        "prescreen ranking settings",
        3,
    ),
)
RANKING_WEIGHT_SUPPLEMENTAL_QUERIES = (
    (
        "calculate_weighted_score rescore_all stage_weight_update "
        "WEIGHTS_PENDING WEIGHTS_ONLY scoringVersion weightedContribution",
        6,
    ),
    (
        "ProcessingSummary weightRescore required compatibleCount "
        "ranking-rescore-all",
        2,
    ),
)
RANKING_RELIABILITY_SUPPLEMENTAL_QUERIES = (
    (
        "AI_REACHABILITY_ATTEMPTS _parse_with_reachability_retries "
        "AIReachabilityError reachabilityAttempts save_failure",
        4,
    ),
    (
        "AI_RESPONSE_REVIEW_REQUIRED _persist_ai_response_review_required "
        "save_ai_response_review_required HUMAN_REVIEW technicalStatus",
        4,
    ),
)

SYMBOL_PATTERNS = (
    re.compile(r"^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)"),
    re.compile(r"^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)"),
    re.compile(
        r"^(?:export\s+default\s+|export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)"
    ),
    re.compile(r"^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*="),
)


def _normalize(value: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    decomposed = unicodedata.normalize("NFKD", value)
    plain = "".join(char for char in decomposed if not unicodedata.combining(char))
    return plain.casefold().replace("_", " ")


def _tokens(value: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9]{2,}", _normalize(value))
        if token not in STOP_WORDS
    ]


def _symbol_on_line(line: str) -> str | None:
    for pattern in SYMBOL_PATTERNS:
        match = pattern.search(line)
        if match:
            return match.group(1)
    return None


@dataclass(frozen=True)
class KnowledgeChunk:
    source_id: str
    path: str
    start_line: int
    end_line: int
    symbol: str | None
    content: str = field(repr=False)
    term_counts: Counter[str] = field(repr=False, compare=False)
    normalized_content: str = field(repr=False, compare=False)

    def prompt_block(self) -> str:
        symbol = f" · szimbólum: {self.symbol}" if self.symbol else ""
        return (
            f"[{self.source_id}] {self.path}:{self.start_line}-{self.end_line}{symbol}\n"
            f"```\n{self.content}\n```"
        )

    def public_source(self) -> dict[str, object]:
        return {
            "sourceId": self.source_id,
            "path": self.path,
            "startLine": self.start_line,
            "endLine": self.end_line,
            "symbol": self.symbol,
        }


@dataclass(frozen=True)
class KnowledgeMatch:
    chunk: KnowledgeChunk
    score: float


class CodebaseKnowledgeIndex:
    """Mtime-aware lexical index for a small, local application repository."""

    def __init__(self, project_root: Path | str):
        self.project_root = Path(project_root).resolve()
        self.backend_root = self.project_root / "backend"
        self.frontend_root = self.project_root / "frontend" / "src"
        self._lock = threading.RLock()
        self._manifest: tuple[tuple[str, int, int], ...] = ()
        self._chunks: tuple[KnowledgeChunk, ...] = ()
        self._document_frequency: Counter[str] = Counter()
        self._indexed_at: str | None = None

    def _source_files(self) -> list[Path]:
        files = [
            self.backend_root / filename
            for filename in BACKEND_ALLOWLIST
            if (self.backend_root / filename).is_file()
        ]
        if self.frontend_root.is_dir():
            for path in self.frontend_root.rglob("*"):
                if (
                    not path.is_file()
                    or path.suffix.casefold() not in FRONTEND_EXTENSIONS
                ):
                    continue
                lowered = path.name.casefold()
                if ".test." in lowered or ".spec." in lowered:
                    continue
                files.append(path)
        return sorted(set(files), key=lambda item: item.as_posix().casefold())

    @staticmethod
    def _safe_stat(path: Path) -> tuple[int, int] | None:
        try:
            stat = path.stat()
        except OSError:
            return None
        if stat.st_size > MAX_SOURCE_FILE_BYTES:
            return None
        return stat.st_mtime_ns, stat.st_size

    def _current_manifest(self) -> tuple[tuple[str, int, int], ...]:
        rows = []
        for path in self._source_files():
            stat = self._safe_stat(path)
            if stat is None:
                continue
            rows.append((str(path), stat[0], stat[1]))
        return tuple(rows)

    def _ensure_fresh(self) -> None:
        manifest = self._current_manifest()
        with self._lock:
            if manifest == self._manifest and self._chunks:
                return
            chunks: list[KnowledgeChunk] = []
            for raw_path, _mtime, _size in manifest:
                chunks.extend(self._chunk_file(Path(raw_path)))
            document_frequency: Counter[str] = Counter()
            for chunk in chunks:
                document_frequency.update(chunk.term_counts.keys())
            self._manifest = manifest
            self._chunks = tuple(chunks)
            self._document_frequency = document_frequency
            self._indexed_at = datetime.now(timezone.utc).isoformat()

    def _chunk_file(self, path: Path) -> list[KnowledgeChunk]:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            return []
        lines = text.splitlines()
        if not lines:
            return []
        relative_path = path.relative_to(self.project_root).as_posix()
        declarations: list[tuple[int, str]] = []
        for index, line in enumerate(lines):
            symbol = _symbol_on_line(line)
            if symbol is None:
                continue
            declaration_start = index
            while declaration_start > 0 and lines[
                declaration_start - 1
            ].lstrip().startswith("@"):
                declaration_start -= 1
            declarations.append((declaration_start, symbol))
        segments: list[tuple[int, int, str | None]] = []
        if not declarations or declarations[0][0] > 0:
            first_declaration = declarations[0][0] if declarations else len(lines)
            segments.append((0, first_declaration, None))
        for position, (start_index, symbol) in enumerate(declarations):
            end_index = (
                declarations[position + 1][0]
                if position + 1 < len(declarations)
                else len(lines)
            )
            segments.append((start_index, end_index, symbol))

        result: list[KnowledgeChunk] = []
        step = max(1, CHUNK_LINES - CHUNK_OVERLAP)
        for segment_start, segment_end, symbol in segments:
            for start_index in range(segment_start, segment_end, step):
                end_index = min(segment_end, start_index + CHUNK_LINES)
                content = "\n".join(lines[start_index:end_index]).strip()
                if not content:
                    continue
                content = content[:MAX_CHUNK_CHARS]
                searchable = f"{relative_path} {symbol or ''} {content}"
                digest = hashlib.sha1(
                    f"{relative_path}:{start_index + 1}:{end_index}".encode("utf-8")
                ).hexdigest()[:10]
                result.append(
                    KnowledgeChunk(
                        source_id=f"SRC_{digest}",
                        path=relative_path,
                        start_line=start_index + 1,
                        end_line=end_index,
                        symbol=symbol,
                        content=content,
                        term_counts=Counter(_tokens(searchable)),
                        normalized_content=_normalize(searchable),
                    )
                )
                if end_index >= segment_end:
                    break
        return result

    def search(
        self,
        query: str,
        *,
        limit: int = 9,
        max_context_chars: int = DEFAULT_CONTEXT_CHARS,
    ) -> list[KnowledgeMatch]:
        self._ensure_fresh()
        direct_terms = _tokens(query)
        if not direct_terms:
            return []
        weighted_terms: Counter[str] = Counter({term: 2.0 for term in direct_terms})
        for term in direct_terms:
            weighted_terms.update(QUERY_EXPANSIONS.get(term, ()))

        normalized_query = " ".join(direct_terms)
        chunk_count = max(1, len(self._chunks))
        matches: list[KnowledgeMatch] = []
        for chunk in self._chunks:
            score = 0.0
            matched_direct = 0
            path_terms = set(_tokens(f"{chunk.path} {chunk.symbol or ''}"))
            for term, query_weight in weighted_terms.items():
                frequency = chunk.term_counts.get(term, 0)
                if not frequency:
                    continue
                document_frequency = self._document_frequency.get(term, 0)
                inverse_frequency = math.log(
                    1 + (chunk_count + 1) / (document_frequency + 1)
                )
                path_bonus = 2.2 if term in path_terms else 1.0
                score += (
                    query_weight
                    * (1 + math.log(frequency))
                    * inverse_frequency
                    * path_bonus
                )
                if term in direct_terms:
                    matched_direct += 1
            coverage = matched_direct / max(1, len(set(direct_terms)))
            score += coverage * 5
            if normalized_query and normalized_query in chunk.normalized_content:
                score += 9
            if score > 1.2:
                matches.append(KnowledgeMatch(chunk=chunk, score=round(score, 6)))

        matches.sort(
            key=lambda item: (
                -item.score,
                item.chunk.path.casefold(),
                item.chunk.start_line,
            )
        )
        selected: list[KnowledgeMatch] = []
        used_chars = 0
        per_path: Counter[str] = Counter()
        for match in matches:
            block_size = len(match.chunk.content)
            if selected and used_chars + block_size > max_context_chars:
                continue
            if per_path[match.chunk.path] >= 2:
                continue
            selected.append(match)
            per_path[match.chunk.path] += 1
            used_chars += block_size
            if len(selected) >= max(1, min(limit, 12)):
                break
        return selected

    def status(self) -> dict[str, object]:
        self._ensure_fresh()
        return {
            "status": "ready",
            "fileCount": len(self._manifest),
            "chunkCount": len(self._chunks),
            "indexedAt": self._indexed_at,
            "scope": "backend allowlist + frontend/src production JS/JSX",
        }


def build_knowledge_context(matches: Iterable[KnowledgeMatch]) -> str:
    blocks = [match.chunk.prompt_block() for match in matches]
    if not blocks:
        return "Nincs a kérdéshez elég releváns kódrészlet a lokális indexben."
    return "\n\n".join(blocks)
