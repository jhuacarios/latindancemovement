"""Versión compatible (MP4 H.264, color normal) de los videos de las academias.

Los iPhone graban en HEVC y muchas veces en HDR (HLG / Dolby Vision): Safari los
reproduce, pero Chrome/Firefox en muchos computadores y algunos Android no. Acá se
baja el original (URL firmada), se decide si hace falta convertir, se convierte a
H.264 + AAC (máx. 1080p en el lado corto, HDR -> SDR) y se sube el MP4 a otra URL
firmada. El original no se toca.
"""

import json
import os
import subprocess
from pathlib import Path

import httpx

# Los videos de las academias pueden pesar hasta 3 GB.
MAX_DOWNLOAD_BYTES = int(3.2 * 1024**3)
MAX_SHORT_SIDE = 1080
CRF = "21"
HDR_TRANSFERS = {"smpte2084", "arib-std-b67"}  # PQ (HDR10 / Dolby Vision) y HLG


class VideoError(Exception):
    """Error atribuible al archivo (no se pudo bajar, no es un video válido)."""


class VideoUploadError(Exception):
    """No se pudo subir el resultado (URL firmada vencida, storage caído)."""


def download_video(url: str, dest: Path) -> Path:
    try:
        with httpx.stream("GET", url, timeout=120, follow_redirects=True) as res:
            if res.status_code != 200:
                raise VideoError(f"No se pudo descargar el video (HTTP {res.status_code}).")
            size = 0
            with dest.open("wb") as fh:
                for chunk in res.iter_bytes(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_DOWNLOAD_BYTES:
                        raise VideoError("El video supera el tamaño máximo.")
                    fh.write(chunk)
    except httpx.HTTPError as exc:
        raise VideoError(f"No se pudo descargar el video: {exc}") from exc
    return dest


def probe(path: Path) -> dict:
    """Códec, profundidad de color, transferencia (HDR), tamaño y duración del video."""
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,pix_fmt,color_transfer,width,height",
            "-show_entries", "format=duration",
            "-of", "json", str(path),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise VideoError("El archivo no es un video válido.")
    data = json.loads(proc.stdout or "{}")
    streams = data.get("streams") or []
    if not streams:
        raise VideoError("El archivo no tiene video.")
    s = streams[0]
    duration = float((data.get("format") or {}).get("duration") or 0)
    return {
        "codec": s.get("codec_name") or "",
        "pix_fmt": s.get("pix_fmt") or "",
        "transfer": s.get("color_transfer") or "",
        "width": int(s.get("width") or 0),
        "height": int(s.get("height") or 0),
        "duration": duration,
    }


def is_hdr(info: dict) -> bool:
    return info["transfer"] in HDR_TRANSFERS


def needs_compat(info: dict) -> bool:
    """Hace falta copia si no es H.264 de 8 bits en color normal (lo que todos reproducen)."""
    ten_bit = "10" in info["pix_fmt"] or "12" in info["pix_fmt"]
    return info["codec"] != "h264" or ten_bit or is_hdr(info)


def video_filter(info: dict) -> str:
    """Escala el lado corto a máx. 1080 (sirve en horizontal y vertical) y pasa HDR a SDR."""
    if min(info["width"], info["height"]) > MAX_SHORT_SIDE:
        if info["width"] >= info["height"]:
            scale = f"scale=-2:{MAX_SHORT_SIDE}"
        else:
            scale = f"scale={MAX_SHORT_SIDE}:-2"
    else:
        scale = "scale=trunc(iw/2)*2:trunc(ih/2)*2"
    if is_hdr(info):
        # HDR -> SDR (BT.709) con tone mapping: sin esto los colores quedan lavados.
        tone = (
            "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
            "tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv"
        )
        return f"{tone},{scale},format=yuv420p"
    return f"{scale},format=yuv420p"


def transcode(src: Path, dest: Path, info: dict) -> Path:
    threads = os.environ.get("ANALYZER_THREADS", "2")
    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-i", str(src),
            "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", video_filter(info),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", CRF,
            "-profile:v", "high", "-pix_fmt", "yuv420p",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
            "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart",
            "-threads", threads,
            str(dest),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0 or not dest.exists():
        raise VideoError(f"No se pudo convertir el video: {proc.stderr.strip()[-300:]}")
    return dest


def upload(path: Path, url: str) -> None:
    try:
        with path.open("rb") as fh:
            res = httpx.put(
                url,
                content=fh,
                headers={"Content-Type": "video/mp4", "Content-Length": str(path.stat().st_size)},
                timeout=600,
            )
        if res.status_code not in (200, 201, 204):
            raise VideoUploadError(f"El storage rechazó la copia (HTTP {res.status_code}).")
    except httpx.HTTPError as exc:
        raise VideoUploadError(f"No se pudo subir la copia: {exc}") from exc


def make_compat(source_url: str, upload_url: str, max_duration_sec: int, workdir: Path) -> dict:
    """
    Devuelve {"result": "converted" | "not_needed" | "too_long", ...}. Solo convierte
    (y sube) si hace falta y el video no supera la duración máxima.
    """
    src = download_video(source_url, workdir / "input")
    info = probe(src)
    duration_ms = int(info["duration"] * 1000)
    if not needs_compat(info):
        return {"result": "not_needed", "durationMs": duration_ms}
    if info["duration"] > max_duration_sec:
        return {"result": "too_long", "durationMs": duration_ms}
    out = transcode(src, workdir / "compat.mp4", info)
    src.unlink(missing_ok=True)  # libera disco antes de subir
    upload(out, upload_url)
    return {"result": "converted", "durationMs": duration_ms, "sizeBytes": out.stat().st_size}
