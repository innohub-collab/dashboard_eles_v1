"""Backend API tests for Innovation Dashboard."""

import os

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")

if not os.environ.get("REACT_APP_BACKEND_URL"):
    pytest.skip(
        "Élő backend smoke teszt: REACT_APP_BACKEND_URL nincs beállítva.",
        allow_module_level=True,
    )

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def records_resp():
    r = requests.get(f"{API}/records", timeout=30)
    assert r.status_code == 200
    return r.json()


# --- /api/records ---
def test_records_count_and_outcome(records_resp):
    data = records_resp
    assert "records" in data and "count" in data and "loaded_at" in data
    assert data["count"] >= 800, f"expected >=800 got {data['count']}"
    assert len(data["records"]) == data["count"]
    valid_outcomes = {"Nyitott", "Megvalósítva", "Elutasítva", "Lezárva"}
    for r in data["records"][:50]:
        assert r["outcome"] in valid_outcomes
        assert r["feladattipus"] in ("Innováció", "Feladat")


def test_records_have_expected_fields(records_resp):
    r0 = records_resp["records"][0]
    for k in (
        "id",
        "cim",
        "leiras",
        "allapot",
        "outcome",
        "cimkek",
        "igazgatosag",
        "bejelento",
    ):
        assert k in r0


# --- /api/meta ---
def test_meta():
    r = requests.get(f"{API}/meta", timeout=30)
    assert r.status_code == 200
    d = r.json()
    for k in ("loaded_at", "count", "source", "program_tags"):
        assert k in d
    assert isinstance(d["program_tags"], list) and len(d["program_tags"]) >= 5
    assert d["count"] >= 800


# --- /api/reload ---
def test_reload():
    r = requests.post(f"{API}/reload", timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok"
    assert d["count"] >= 800
    assert d["loaded_at"]


# --- root ---
def test_root():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"
