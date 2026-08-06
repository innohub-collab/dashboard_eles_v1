"""Tests for Debora's allowlisted local source-code retrieval."""

from pathlib import Path

from codebase_knowledge import CodebaseKnowledgeIndex, build_knowledge_context


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_index_reads_only_allowlisted_production_sources(tmp_path):
    _write(
        tmp_path / "backend" / "server.py",
        "def load_records():\n    return read_excel('ideas.xlsx')\n",
    )
    _write(
        tmp_path / "backend" / ".env",
        "AZURE_OPENAI_API_KEY=must-never-be-indexed\n",
    )
    _write(
        tmp_path / "frontend" / "src" / "lib" / "kpi.js",
        "export function roadmapBacklog(rows) {\n"
        "  return rows.filter((row) => row.allapot === 'Roadmap').length;\n"
        "}\n",
    )
    _write(
        tmp_path / "frontend" / "src" / "lib" / "kpi.test.js",
        "const forbiddenTestMarker = 'do not retrieve';\n",
    )
    _write(
        tmp_path / "frontend" / "build" / "static" / "bundle.js",
        "const forbiddenBuildMarker = true;\n",
    )

    index = CodebaseKnowledgeIndex(tmp_path)
    matches = index.search("Hogyan számolódik a roadmap backlog?")
    context = build_knowledge_context(matches)

    assert matches
    assert any(match.chunk.path == "frontend/src/lib/kpi.js" for match in matches)
    assert "must-never-be-indexed" not in context
    assert "forbiddenTestMarker" not in context
    assert "forbiddenBuildMarker" not in context


def test_source_metadata_and_context_are_stable(tmp_path):
    _write(
        tmp_path / "frontend" / "src" / "pages" / "Dashboard.jsx",
        "export function computeSummary(records) {\n"
        "  const backlog = records.filter((item) => item.allapot === 'Roadmap');\n"
        "  return { backlog: backlog.length };\n"
        "}\n",
    )

    index = CodebaseKnowledgeIndex(tmp_path)
    first = index.search("összefoglaló roadmap backlog")
    second = index.search("összefoglaló roadmap backlog")

    assert first[0].chunk.source_id == second[0].chunk.source_id
    assert first[0].chunk.path == "frontend/src/pages/Dashboard.jsx"
    assert first[0].chunk.start_line == 1
    assert first[0].chunk.end_line == 4
    assert first[0].chunk.symbol == "computeSummary"
    assert f"[{first[0].chunk.source_id}]" in build_knowledge_context(first)

    status = index.status()
    assert status["status"] == "ready"
    assert status["fileCount"] == 1
    assert status["chunkCount"] == 1


def test_index_refreshes_automatically_when_production_code_changes(tmp_path):
    source = tmp_path / "backend" / "ranking_service.py"
    _write(source, "def old_ranking_rule():\n    return 'legacy'\n")
    index = CodebaseKnowledgeIndex(tmp_path)

    assert index.search("old ranking rule")

    _write(
        source,
        "def ai_reachability_attempts():\n"
        "    return 5  # current retry rule with human review fallback\n",
    )
    refreshed = index.search("current retry rule human review")
    context = build_knowledge_context(refreshed)

    assert refreshed
    assert "ai_reachability_attempts" in context
    assert "old_ranking_rule" not in context


def test_actual_project_index_finds_roadmap_calculation():
    project_root = Path(__file__).resolve().parents[2]
    index = CodebaseKnowledgeIndex(project_root)

    matches = index.search("Hogyan számolódik az összefoglaló roadmap backlog?")
    paths = {match.chunk.path for match in matches}

    assert "frontend/src/pages/Dashboard.jsx" in paths
    assert any(path.startswith("frontend/src/lib/") for path in paths)
