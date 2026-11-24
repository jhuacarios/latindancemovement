"""Servicio HTTP del analizador. Sin estado: no toca la base de datos ni guarda
archivos; baja el audio de una URL firmada, lo analiza y devuelve JSON."""

import hmac
import os
import tempfile
import threading
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException

from . import ANALYZER_VERSION
from .analysis import analyze_file
from .audio import AudioError, download, to_wav
from .cutout import CutoutError, make_cutout, release_model
from .fingerprint import fingerprint
from .instruments import analyze_instruments
from .stems import StemUploadError, make_stems
from .video import VideoError, VideoUploadError, make_compat
from .schemas import (
    STEM_KEYS_BY_MODE,
    AnalyzeRequest,
    AnalyzeResponse,
    CompatRequest,
    CompatResponse,
    CutoutRequest,
    CutoutResponse,
    FingerprintRequest,
    FingerprintResponse,
    InstrumentsRequest,
    InstrumentsResponse,
    StemsRequest,
    StemsResponse,
)

app = FastAPI(title="Nectason analyzer", version=ANALYZER_VERSION)

# Separación (Demucs + karaoke): una a la vez. Cada una usa ~2-3 GB de RAM y todas las
# CPU asignadas; dos en paralelo no terminan antes y pueden agotar la memoria del
# servidor. Las demás peticiones esperan su turno (la API ya las encola de a una, pero
# un reintento puede llegar mientras la anterior sigue corriendo).
HEAVY = threading.Lock()
# Recorte de stickers: de a uno. El inteligente (~1 GB de RAM unos segundos) además toma
# el turno de HEAVY: junto a Demucs (~2,8 GB) el servidor se queda sin memoria.
CUTOUT = threading.Lock()
CUTOUT_WAIT_SEC = 10


def require_token(authorization: str | None = Header(default=None)) -> None:
    expected = os.environ.get("ANALYZER_TOKEN", "")
    given = (authorization or "").removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(given, expected):
        raise HTTPException(status_code=401, detail="Token inválido.")


def _prepare(url: str, workdir: Path, channels: int = 1) -> Path:
    raw = download(url, workdir / "input")
    return to_wav(raw, workdir / "audio.wav", channels)


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


# Separación de instrumentos: lenta (~5 min por canción con 2 CPU), por eso va aparte de /analyze.
# En estéreo: el modelo karaoke distingue coros de voz principal por la imagen estéreo.
@app.post("/instruments", response_model=InstrumentsResponse, dependencies=[Depends(require_token)])
def instruments_endpoint(body: InstrumentsRequest) -> InstrumentsResponse:
    with tempfile.TemporaryDirectory() as tmp:
        try:
            wav = _prepare(body.audioUrl, Path(tmp), channels=2)
            with HEAVY:
                return analyze_instruments(wav, body.mode)
        except AudioError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc


# Pistas para el mezclador: separa en estéreo y sube cada pista a la URL firmada que manda la API.
@app.post("/stems", response_model=StemsResponse, dependencies=[Depends(require_token)])
def stems_endpoint(body: StemsRequest) -> StemsResponse:
    missing = [k for k in STEM_KEYS_BY_MODE[body.mode] if k not in body.uploads]
    if missing:
        raise HTTPException(status_code=400, detail=f"Faltan URLs de subida: {', '.join(missing)}")
    with tempfile.TemporaryDirectory() as tmp:
        try:
            wav = _prepare(body.audioUrl, Path(tmp), channels=2)
            with HEAVY:
                return make_stems(wav, body.uploads, Path(tmp), body.mode)
        except AudioError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except StemUploadError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/compat", response_model=CompatResponse, dependencies=[Depends(require_token)])
def compat_endpoint(body: CompatRequest) -> CompatResponse:
    """Copia MP4 H.264 de un video de academia (si hace falta). Pesado: de a uno, en la misma cola que Demucs."""
    with tempfile.TemporaryDirectory() as tmp:
        try:
            with HEAVY:
                return CompatResponse(**make_compat(body.videoUrl, body.uploadUrl, body.maxDurationSec, Path(tmp)))
        except VideoError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except VideoUploadError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/cutout", response_model=CutoutResponse, dependencies=[Depends(require_token)])
def cutout_endpoint(body: CutoutRequest) -> CutoutResponse:
    """Sticker recortado según el contorno dibujado a mano (inteligente o tal cual)."""
    try:
        with CUTOUT:
            if body.mode != "smart":
                return CutoutResponse(**make_cutout(body.image, body.polygon, "manual"))
            # Si hay una canción separándose, no se espera minutos: se corta por la línea.
            if not HEAVY.acquire(timeout=CUTOUT_WAIT_SEC):
                return CutoutResponse(**make_cutout(body.image, body.polygon, "manual"), busy=True)
            try:
                return CutoutResponse(**make_cutout(body.image, body.polygon, "smart"))
            finally:
                release_model()
                HEAVY.release()
    except CutoutError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
