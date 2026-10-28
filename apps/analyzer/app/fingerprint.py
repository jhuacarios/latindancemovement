"""Huella acústica con Chromaprint (`fpcalc`), para reconocer la misma grabación
entre archivos de distintos usuarios sin compartir el audio."""

import json
import subprocess
from pathlib import Path

from .audio import AudioError

# Los primeros 120 s alcanzan para distinguir grabaciones y mantienen la huella chica.
FINGERPRINT_SECONDS = 120


def fingerprint(path: Path) -> tuple[int, list[int]]:
    """Devuelve (duración en ms, huella cruda)."""
    proc = subprocess.run(
        ["fpcalc", "-raw", "-json", "-length", str(FINGERPRINT_SECONDS), str(path)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise AudioError("No se pudo calcular la huella del audio.")
    data = json.loads(proc.stdout)
    return round(float(data["duration"]) * 1000), [int(v) for v in data["fingerprint"]]
