"""Descarga y decodificación del audio de entrada."""

import subprocess
from pathlib import Path

import httpx

MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024
MAX_DURATION_SEC = 10 * 60
SAMPLE_RATE = 44100


class AudioError(Exception):
    """Error atribuible al archivo (no se pudo bajar, formato inválido, muy largo)."""


def download(url: str, dest: Path) -> Path:
    try:
        with httpx.stream("GET", url, timeout=60, follow_redirects=True) as res:
            if res.status_code != 200:
                raise AudioError(f"No se pudo descargar el audio (HTTP {res.status_code}).")
            size = 0
            with dest.open("wb") as fh:
                for chunk in res.iter_bytes():
                    size += len(chunk)
                    if size > MAX_DOWNLOAD_BYTES:
                        raise AudioError("El archivo supera el tamaño máximo.")
                    fh.write(chunk)
    except httpx.HTTPError as exc:
        raise AudioError(f"No se pudo descargar el audio: {exc}") from exc
    return dest


def to_wav(src: Path, dest: Path, channels: int = 1) -> Path:
    """Convierte cualquier formato soportado por ffmpeg a WAV 44.1 kHz (mono por defecto)."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", str(channels), "-ar", str(SAMPLE_RATE), str(dest)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0 or not dest.exists():
        raise AudioError("El archivo no es un audio válido (MP3, M4A, WAV o FLAC).")
    return dest
