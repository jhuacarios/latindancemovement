import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main
from app.schemas import INSTRUMENT_KEYS, AnalyzeResponse, FingerprintResponse, InstrumentsResponse

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


@pytest.mark.parametrize("endpoint", ["/analyze", "/fingerprint", "/instruments", "/stems"])
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


def test_instruments_contract(client, monkeypatch):
    # Sin correr Demucs (eso lo cubre test_instruments): pistas falsas.
    from app import instruments

    monkeypatch.setattr(instruments, "separate", lambda y, sr: {"drums": y, "vocals": y * 0.5})
    res = client.post("/instruments", json={"audioUrl": "https://storage.test/a"}, headers=AUTH)
    assert res.status_code == 200
    body = InstrumentsResponse.model_validate(res.json())
    assert set(body.tracks) == set(INSTRUMENT_KEYS)
    assert body.stepMs > 0 and body.durationMs > 0
    assert len({len(v) for v in body.tracks.values()}) == 1


def test_stems_uploads_every_stem(client, monkeypatch):
    from app import instruments, stems

    monkeypatch.setattr(stems, "separate_stereo", lambda x, sr: {"vocals": x * 0.5, "drums": x * 0.2, "piano": x * 0.1})
    put = {}

    def fake_upload(path, url):
        assert path.suffix == ".m4a" and path.stat().st_size > 0
        put[url] = path.name

    monkeypatch.setattr(stems, "upload", fake_upload)
    keys = ["vocals", "guitar", "bass", "drums", "other"]
    uploads = {k: f"https://storage.test/put/{k}" for k in keys}
    res = client.post("/stems", json={"audioUrl": "https://storage.test/a", "uploads": uploads}, headers=AUTH)
    assert res.status_code == 200, res.text
    assert res.json()["stems"] == keys
    assert put == {uploads[k]: f"{k}.m4a" for k in keys}


def test_stems_requires_every_upload_url(client):
    res = client.post(
        "/stems",
        json={"audioUrl": "https://storage.test/a", "uploads": {"vocals": "https://storage.test/put/v"}},
        headers=AUTH,
    )
    assert res.status_code == 400


def test_stems_upload_failure_is_502(client, monkeypatch):
    from app import stems

    monkeypatch.setattr(stems, "separate_stereo", lambda x, sr: {})

    def failing(path, url):
        raise stems.StemUploadError("El storage rechazó la pista (HTTP 403).")

    monkeypatch.setattr(stems, "upload", failing)
    uploads = {k: "https://storage.test/put" for k in ["vocals", "guitar", "bass", "drums", "other"]}
    res = client.post("/stems", json={"audioUrl": "https://storage.test/a", "uploads": uploads}, headers=AUTH)
    assert res.status_code == 502
