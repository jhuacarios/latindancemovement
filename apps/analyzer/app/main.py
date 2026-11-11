"""Servicio HTTP del analizador. Sin estado: no toca la base de datos ni guarda
archivos; baja el audio de una URL firmada, lo analiza y devuelve JSON."""

import hmac
import os
import tempfile
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException

from . import ANALYZER_VERSION
from .analysis import analyze_file
from .audio import AudioError, download, to_wav
from .fingerprint import fingerprint
from .instruments import analyze_instruments
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    FingerprintRequest,
    FingerprintResponse,
    InstrumentsRequest,
    InstrumentsResponse,
)

app = FastAPI(title="Nectason analyzer", version=ANALYZER_VERSION)


def require_token(authorization: str | None = Header(default=None)) -> None:
    expected = os.environ.get("ANALYZER_TOKEN", "")
    given = (authorization or "").removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(given, expected):
        raise HTTPException(status_code=401, detail="Token inválido.")


def _prepare(url: str, workdir: Path) -> Path:
    raw = download(url, workdir / "input")
    return to_wav(raw, workdir / "audio.wav")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "analyzerVersion": ANALYZER_VERSION}


# Endpoints sincrónicos a propósito: el análisis es CPU y FastAPI los corre en un threadpool.
@app.post("/fingerprint", response_model=FingerprintResponse, dependencies=[Depends(require_token)])
def fingerprint_endpoint(body: FingerprintRequest) -> FingerprintResponse:
    with tempfile.TemporaryDirectory() as tmp:
        try:
            wav = _prepare(body.audioUrl, Path(tmp))
            duration_ms, fp = fingerprint(wav)
        except AudioError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    return FingerprintResponse(durationMs=duration_ms, fingerprint=fp)


@app.post("/analyze", response_model=AnalyzeResponse, dependencies=[Depends(require_token)])
def analyze_endpoint(body: AnalyzeRequest) -> AnalyzeResponse:
    with tempfile.TemporaryDirectory() as tmp:
        try:
            wav = _prepare(body.audioUrl, Path(tmp))
            return analyze_file(wav)
        except AudioError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc


# Separación de instrumentos: lenta (~1-2 min por canción con 4 CPU), por eso va aparte de /analyze.
@app.post("/instruments", response_model=InstrumentsResponse, dependencies=[Depends(require_token)])
def instruments_endpoint(body: InstrumentsRequest) -> InstrumentsResponse:
    with tempfile.TemporaryDirectory() as tmp:
        try:
            wav = _prepare(body.audioUrl, Path(tmp))
            return analyze_instruments(wav)
        except AudioError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
