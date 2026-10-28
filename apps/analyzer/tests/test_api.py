import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main
from app.schemas import AnalyzeResponse, FingerprintResponse

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client(monkeypatch, make_clicks):
    monkeypatch.setenv("ANALYZER_TOKEN", TOKEN)
    path, _ = make_clicks(128)

    # En vez de bajar de una URL firmada, copia el archivo sintético.
    def fake_download(url: str, dest: Path) -> Path:
        if url == "https://storage.test/no-existe":
            raise main.AudioError("No se pudo descargar el audio (HTTP 404).")
        shutil.copy(path, dest)
        return dest

    monkeypatch.setattr(main, "download", fake_download)
    return TestClient(main.app)


def test_health_is_public(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["ok"] is True


@pytest.mark.parametrize("endpoint", ["/analyze", "/fingerprint"])
def test_requires_token(client, endpoint):
    assert client.post(endpoint, json={"audioUrl": "https://storage.test/a"}).status_code == 401
    bad = {"Authorization": "Bearer otro"}
    assert client.post(endpoint, json={"audioUrl": "https://storage.test/a"}, headers=bad).status_code == 401


def test_analyze_contract(client):
    res = client.post("/analyze", json={"audioUrl": "https://storage.test/a"}, headers=AUTH)
    assert res.status_code == 200
    body = AnalyzeResponse.model_validate(res.json())
    assert body.analyzerVersion
    assert body.durationMs > 0
    assert body.beatsMs == sorted(body.beatsMs)
    assert set(body.downbeatsMs) <= set(body.beatsMs)
    assert body.fingerprint
    assert body.sections == [] and body.markers == []


def test_fingerprint_contract(client):
    res = client.post("/fingerprint", json={"audioUrl": "https://storage.test/a"}, headers=AUTH)
    assert res.status_code == 200
    body = FingerprintResponse.model_validate(res.json())
    assert body.durationMs > 0 and body.fingerprint


def test_download_error_is_422(client):
    res = client.post("/analyze", json={"audioUrl": "https://storage.test/no-existe"}, headers=AUTH)
    assert res.status_code == 422
