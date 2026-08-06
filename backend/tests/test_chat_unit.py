"""Unit tests for the debora chat endpoint."""

from types import SimpleNamespace

from fastapi.testclient import TestClient

import server

client = TestClient(server.app)


def test_openai_client_prefers_api_key(monkeypatch):
    captured = {}

    def fake_client(**kwargs):
        captured.update(kwargs)
        return object()

    def unexpected_token_provider(*_args):
        raise AssertionError("API-kulcs mellett nem kérhet Azure Identity tokent")

    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "unit-test-key")
    monkeypatch.setattr(server, "OpenAI", fake_client)
    monkeypatch.setattr(server, "get_bearer_token_provider", unexpected_token_provider)
    server._get_openai_client.cache_clear()

    try:
        result = server._get_openai_client()
    finally:
        server._get_openai_client.cache_clear()

    assert result is not None
    assert captured == {
        "base_url": server.AZURE_OPENAI_ENDPOINT,
        "api_key": "unit-test-key",
    }


def test_chat_returns_model_answer(monkeypatch):
    def fake_response(messages):
        assert messages[-1].role == "user"
        assert messages[-1].content == "Mi Franciaország fővárosa?"
        return (
            "Párizs.",
            "resp_test_123",
            [
                {
                    "sourceId": "SRC_test",
                    "path": "frontend/src/lib/kpi.js",
                    "startLine": 10,
                    "endLine": 20,
                    "symbol": "computeSummary",
                }
            ],
        )

    monkeypatch.setattr(server, "_create_debora_response_sync", fake_response)

    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "Mi Franciaország fővárosa?"}]},
    )

    assert response.status_code == 200
    assert response.json() == {
        "answer": "Párizs.",
        "model": server.AZURE_OPENAI_DEPLOYMENT,
        "response_id": "resp_test_123",
        "sources": [
            {
                "sourceId": "SRC_test",
                "path": "frontend/src/lib/kpi.js",
                "startLine": 10,
                "endLine": 20,
                "symbol": "computeSummary",
            }
        ],
    }


def test_chat_requires_last_message_from_user():
    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "assistant", "content": "Miben segíthetek?"}]},
    )

    assert response.status_code == 400
    assert "felhasználói" in response.json()["detail"]


def test_chat_rejects_empty_messages():
    response = client.post("/api/chat", json={"messages": []})

    assert response.status_code == 422


def test_chat_hides_provider_error(monkeypatch):
    def fail(_messages):
        raise RuntimeError("secret provider detail")

    monkeypatch.setattr(server, "_create_debora_response_sync", fail)

    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "Szia!"}]},
    )

    assert response.status_code == 502
    assert "secret provider detail" not in response.text
    assert "Azure-hitelesítést" in response.json()["detail"]


def test_debora_uses_retrieved_context_and_returns_validated_sources(monkeypatch):
    source = {
        "sourceId": "SRC_unit",
        "path": "frontend/src/lib/kpi.js",
        "startLine": 12,
        "endLine": 24,
        "symbol": "computeSummary",
    }
    chunk = SimpleNamespace(
        source_id="SRC_unit",
        public_source=lambda: source,
        prompt_block=lambda: (
            "[SRC_unit] frontend/src/lib/kpi.js:12-24 · szimbólum: "
            "computeSummary\n```\nconst backlog = records.filter(...).length;\n```"
        ),
    )
    fake_index = SimpleNamespace(
        search=lambda query, **kwargs: [SimpleNamespace(chunk=chunk, score=42.0)]
    )
    captured = {}

    class FakeResponses:
        def parse(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                id="resp_grounded",
                output_parsed=server.DeboraModelAnswer(
                    answer=(
                        "A számítást a frontend/src/lib/kpi.js "
                        "computeSummary függvénye végzi."
                    ),
                    source_ids=["[SRC_unit]"],
                ),
            )

    monkeypatch.setattr(server, "_get_codebase_knowledge", lambda: fake_index)
    monkeypatch.setattr(
        server,
        "_get_openai_client",
        lambda: SimpleNamespace(responses=FakeResponses()),
    )

    answer, response_id, sources = server._create_debora_response_sync(
        [server.ChatMessage(role="user", content="Hogyan számolódik a backlog?")]
    )

    assert "computeSummary" in answer
    assert response_id == "resp_grounded"
    assert [item.model_dump(by_alias=True) for item in sources] == [source]
    assert captured["text_format"] is server.DeboraModelAnswer
    assert "[SRC_unit]" in captured["instructions"]
    assert "KIZÁRÓLAG" in captured["instructions"]


def test_debora_repairs_unknown_source_identifier_once(monkeypatch):
    source = {
        "sourceId": "SRC_allowed",
        "path": "backend/ranking_service.py",
        "startLine": 450,
        "endLine": 490,
        "symbol": "_parse_with_reachability_retries",
    }
    chunk = SimpleNamespace(
        source_id="SRC_allowed",
        public_source=lambda: source,
        prompt_block=lambda: (
            "[SRC_allowed] backend/ranking_service.py:450-490\n"
            "```\nAI_REACHABILITY_ATTEMPTS = 5\n```"
        ),
    )
    fake_index = SimpleNamespace(
        search=lambda query, **kwargs: [SimpleNamespace(chunk=chunk, score=20.0)]
    )
    calls = []

    class FakeResponses:
        def parse(self, **kwargs):
            calls.append(kwargs)
            source_ids = ["SRC_invented"] if len(calls) == 1 else ["SRC_allowed"]
            return SimpleNamespace(
                id=f"resp_repair_{len(calls)}",
                output_parsed=server.DeboraModelAnswer(
                    answer="Öt alkalmazásszintű elérési próbálkozás történik.",
                    source_ids=source_ids,
                ),
            )

    monkeypatch.setattr(server, "_get_codebase_knowledge", lambda: fake_index)
    monkeypatch.setattr(
        server,
        "_get_openai_client",
        lambda: SimpleNamespace(responses=FakeResponses()),
    )

    answer, response_id, sources = server._create_debora_response_sync(
        [server.ChatMessage(role="user", content="Mikor lesz technikai hiba?")]
    )

    assert len(calls) == 2
    assert "JAVÍTÓ STRUKTURÁLT VÁLASZ" in calls[1]["instructions"]
    assert "SRC_allowed" in calls[1]["instructions"]
    assert response_id == "resp_repair_2"
    assert "Öt" in answer
    assert [item.source_id for item in sources] == ["SRC_allowed"]


def test_debora_rejects_invented_source_identifier(monkeypatch):
    chunk = SimpleNamespace(
        source_id="SRC_allowed",
        public_source=lambda: {
            "sourceId": "SRC_allowed",
            "path": "backend/server.py",
            "startLine": 1,
            "endLine": 2,
            "symbol": None,
        },
        prompt_block=lambda: "[SRC_allowed] backend/server.py:1-2\n```\npass\n```",
    )
    fake_index = SimpleNamespace(
        search=lambda query, **kwargs: [SimpleNamespace(chunk=chunk, score=10.0)]
    )
    fake_response = SimpleNamespace(
        id="resp_bad_source",
        output_parsed=server.DeboraModelAnswer(
            answer="Nem alátámasztott válasz.",
            source_ids=["SRC_invented"],
        ),
    )
    fake_client = SimpleNamespace(
        responses=SimpleNamespace(parse=lambda **kwargs: fake_response)
    )
    monkeypatch.setattr(server, "_get_codebase_knowledge", lambda: fake_index)
    monkeypatch.setattr(server, "_get_openai_client", lambda: fake_client)

    try:
        server._create_debora_response_sync(
            [server.ChatMessage(role="user", content="Mit jelent ez a KPI?")]
        )
    except RuntimeError as exc:
        assert "ismeretlen kódbázis-forrásra" in str(exc)
    else:
        raise AssertionError(
            "Az ismeretlen forrásazonosítót el kellett volna utasítani."
        )


def test_dashboard_question_retrieves_calculation_filters_and_data_source():
    server._get_codebase_knowledge.cache_clear()
    try:
        matches = server._retrieve_debora_knowledge(
            [
                server.ChatMessage(
                    role="user",
                    content=(
                        "Hogyan számolódik az összefoglaló Roadmap backlog, "
                        "milyen szűrők és adatforrás vonatkozik rá?"
                    ),
                )
            ]
        )
    finally:
        server._get_codebase_knowledge.cache_clear()

    paths = {match.chunk.path for match in matches}
    symbols = {match.chunk.symbol for match in matches}

    assert "frontend/src/pages/Dashboard.jsx" in paths
    assert "frontend/src/context/DataContext.jsx" in paths
    assert "backend/server.py" in paths
    assert "Dashboard" in symbols
    assert "DataProvider" in symbols
    assert "get_records" in symbols
    assert "_read_excel_sync" in symbols


def test_ranking_weight_question_retrieves_formula_backend_and_frontend_trigger():
    server._get_codebase_knowledge.cache_clear()
    try:
        matches = server._retrieve_debora_knowledge(
            [
                server.ChatMessage(
                    role="user",
                    content="Hogyan működik a súlyalapú újrapontozás?",
                )
            ]
        )
    finally:
        server._get_codebase_knowledge.cache_clear()

    paths = {match.chunk.path for match in matches}
    symbols = {match.chunk.symbol for match in matches}

    assert "backend/ranking_service.py" in paths
    assert "backend/ranking_store.py" in paths
    assert "frontend/src/components/ranking/ProcessingSummary.jsx" in paths
    assert "calculate_weighted_score" in symbols
    assert "rescore_all" in symbols
    assert "stage_weight_update" in symbols


def test_ranking_reliability_question_retrieves_retry_and_review_workflows():
    server._get_codebase_knowledge.cache_clear()
    try:
        matches = server._retrieve_debora_knowledge(
            [
                server.ChatMessage(
                    role="user",
                    content=(
                        "Mikor lesz technikai hiba, és mi történik hibás "
                        "AI-válasznál vagy emberi felülvizsgálatnál?"
                    ),
                )
            ]
        )
    finally:
        server._get_codebase_knowledge.cache_clear()

    paths = {match.chunk.path for match in matches}
    symbols = {match.chunk.symbol for match in matches}

    assert "backend/ranking_service.py" in paths
    assert "backend/ranking_store.py" in paths
    assert "_parse_with_reachability_retries" in symbols
    assert "_persist_ai_response_review_required" in symbols
    assert "save_ai_response_review_required" in symbols


def test_compound_ranking_question_keeps_weight_and_reliability_sources():
    server._get_codebase_knowledge.cache_clear()
    try:
        matches = server._retrieve_debora_knowledge(
            [
                server.ChatMessage(
                    role="user",
                    content=(
                        "Hogyan működik a súlyalapú újrapontozás, mikor lesz "
                        "technikai hiba, és mi történik érvénytelen AI-válasznál?"
                    ),
                )
            ]
        )
    finally:
        server._get_codebase_knowledge.cache_clear()

    symbols = {match.chunk.symbol for match in matches}

    assert "calculate_weighted_score" in symbols
    assert "stage_weight_update" in symbols
    assert "_parse_with_reachability_retries" in symbols
    assert "_persist_ai_response_review_required" in symbols
