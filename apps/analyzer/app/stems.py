"""Pistas separadas para el mezclador del Estudio.

A diferencia de la actividad de instrumentos (datos compartibles), esto es AUDIO
derivado del archivo de un usuario: se sube a URLs firmadas que da la API (que lo
guarda privado para ese usuario) y acá no queda nada.
"""

import subprocess
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf

from . import ANALYZER_VERSION
from .audio import MAX_DURATION_SEC, SAMPLE_RATE, AudioError
from .instruments import separate_all, split_drums, split_guitar
from .schemas import STEM_KEYS_BY_MODE, SeparationMode, StemsResponse

STEM_BITRATE = "128k"
STEM_MIME = "audio/mp4"


class StemUploadError(Exception):
    """No se pudo subir una pista al storage (se reintenta desde la API)."""


def encode_m4a(audio: np.ndarray, sr: int, dest: Path) -> Path:
    """(2, n) float → AAC en m4a, con el índice al inicio para reproducir mientras baja."""
    wav = dest.with_suffix(".wav")
    sf.write(wav, np.clip(audio.T, -1.0, 1.0), sr, subtype="FLOAT")
    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-i", str(wav),
            "-c:a", "aac", "-b:a", STEM_BITRATE, "-movflags", "+faststart", str(dest),
        ],
        capture_output=True,
        text=True,
    )
    wav.unlink(missing_ok=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg no pudo codificar la pista: {proc.stderr[-300:]}")
    return dest


def upload(path: Path, url: str) -> None:
    try:
        res = httpx.put(url, content=path.read_bytes(), headers={"Content-Type": STEM_MIME}, timeout=120)
    except httpx.HTTPError as exc:
        raise StemUploadError(f"No se pudo subir la pista: {exc}") from exc
    if res.status_code >= 300:
        raise StemUploadError(f"El storage rechazó la pista (HTTP {res.status_code}).")


def make_stems(wav: Path, uploads: dict[str, str], workdir: Path, mode: SeparationMode = "deep") -> StemsResponse:
    audio, sr = sf.read(str(wav), dtype="float32", always_2d=True)  # (n, canales)
    stereo = audio.T if audio.shape[1] == 2 else np.repeat(audio.T[:1], 2, axis=0)
    if sr != SAMPLE_RATE:
        raise AudioError("Frecuencia de muestreo inesperada.")
    duration_sec = stereo.shape[1] / sr
    if duration_sec > MAX_DURATION_SEC:
        raise AudioError("El audio supera la duración máxima de 10 minutos.")

    sources = separate_all(stereo, sr, mode)
    zeros = np.zeros_like(stereo)
    if mode == "basic":
        # Las 6 pistas de Demucs tal cual: voces juntas, guitarras juntas, percusión entera.
        stems = {
            "vocals": sources.get("vocals", zeros),
            "guitar": sources.get("guitar", zeros),
            "bass": sources.get("bass", zeros),
            "drums": sources.get("drums", zeros),
            "keys": sources.get("piano", zeros),
            "other": sources.get("other", zeros),
        }
        return _upload_all(stems, uploads, workdir, sr, duration_sec, mode)
    requinto, segunda = split_guitar(sources.get("guitar", zeros), sr)
    campana, drums = split_drums(sources.get("drums", zeros), sr)
    stems = {
        "vocals": sources.get("vocals", zeros),  # voz principal
        "coros": sources.get("coros", zeros),
        "requinto": requinto,
        "segunda": segunda,
        "bass": sources.get("bass", zeros),
        "drums": drums,  # percusión sin la campana
        "campana": campana,
        # "piano" casi nunca es piano en bachata: teclados y sintes.
        "keys": sources.get("piano", zeros),
        "other": sources.get("other", zeros),
    }
    return _upload_all(stems, uploads, workdir, sr, duration_sec, mode)


def _upload_all(
    stems: dict[str, np.ndarray], uploads: dict[str, str], workdir: Path, sr: int, duration_sec: float, mode: SeparationMode
) -> StemsResponse:
    keys = STEM_KEYS_BY_MODE[mode]
    for key in keys:
        upload(encode_m4a(stems[key], sr, workdir / f"{key}.m4a"), uploads[key])
    return StemsResponse(
        analyzerVersion=ANALYZER_VERSION, mode=mode, durationMs=round(duration_sec * 1000), stems=list(keys)
    )
