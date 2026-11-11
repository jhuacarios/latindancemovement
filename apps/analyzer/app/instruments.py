"""Actividad de instrumentos: qué suena en cada momento de la canción.

Se separa la canción en pistas con Demucs (htdemucs_6s) y de cada pista se mide
la energía cada 250 ms. Las pistas se descartan apenas se miden: el resultado
son solo datos (no audio), por eso se puede compartir entre usuarios.

Demucs no conoce los instrumentos del baile latino: toda la percusión le sale en
una sola pista ("drums"). Para la bachata se divide por bandas de frecuencia
(tumba grave, bongó medio, güira aguda). Es una aproximación: sirve para saber
cuándo suena cada uno, no para aislarlos.
"""

import os
from functools import lru_cache
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from . import ANALYZER_VERSION
from .audio import MAX_DURATION_SEC, SAMPLE_RATE, AudioError
from .schemas import INSTRUMENT_KEYS, InstrumentsResponse

STEP_MS = 250
HOP = 512
N_FFT = 2048
DEMUCS_MODEL = "htdemucs_6s"

# Bandas (Hz) de la pista de percusión.
PERCUSSION_BANDS = {
    "tumba": (30, 150),
    "bongo": (250, 2500),
    "guira": (5000, 16000),
}
# Una pista cuyo nivel típico queda tanto bajo la mezcla se considera ausente
# (si no, al normalizarla se amplifica el ruido que deja la separación).
ABSENT_BELOW_MIX_DB = 35.0
# Bandas de percusión: relativo a la percusión completa (los agudos son naturalmente más bajos).
ABSENT_BAND_BELOW_DB = 50.0


@lru_cache(maxsize=1)
def _model():
    import torch
    from demucs.pretrained import get_model

    torch.set_num_threads(int(os.environ.get("ANALYZER_THREADS", "4")))
    model = get_model(DEMUCS_MODEL)
    model.eval()
    return model


def separate_stereo(stereo: np.ndarray, sr: int) -> dict[str, np.ndarray]:
    """Separa audio estéreo (2, n) en las pistas de Demucs, cada una (2, n)."""
    import torch
    from demucs.apply import apply_model

    model = _model()
    if sr != model.samplerate:
        stereo = librosa.resample(stereo, orig_sr=sr, target_sr=model.samplerate)
    wav = torch.from_numpy(np.ascontiguousarray(stereo)).float()
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        out = apply_model(
            model, ((wav - mean) / std)[None], device="cpu", shifts=0, split=True, overlap=0.25, progress=False
        )[0]
    out = out * std + mean
    return {name: out[i].numpy() for i, name in enumerate(model.sources)}


def separate(y: np.ndarray, sr: int) -> dict[str, np.ndarray]:
    """Separa el audio mono en las pistas de Demucs (mono, mismo largo)."""
    stems = separate_stereo(np.stack([y, y]), sr)  # el modelo espera estéreo
    return {name: x.mean(0) for name, x in stems.items()}


def _bin_by_time(frames: np.ndarray, sr: int, n_steps: int) -> np.ndarray:
    """Promedia valores por frame (hop HOP) en pasos exactos de STEP_MS."""
    times_ms = librosa.frames_to_time(np.arange(len(frames)), sr=sr, hop_length=HOP) * 1000
    idx = np.minimum((times_ms // STEP_MS).astype(int), n_steps - 1)
    sums = np.bincount(idx, weights=frames, minlength=n_steps)
    counts = np.bincount(idx, minlength=n_steps)
    return np.divide(sums, counts, out=np.zeros(n_steps), where=counts > 0)


def _rms(x: np.ndarray, sr: int, n_steps: int) -> np.ndarray:
    return _bin_by_time(librosa.feature.rms(y=x, frame_length=N_FFT, hop_length=HOP)[0], sr, n_steps)


def _bands(x: np.ndarray, sr: int, n_steps: int) -> tuple[dict[str, np.ndarray], np.ndarray]:
    spec = np.abs(librosa.stft(x, n_fft=N_FFT, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)

    def level(lo: float, hi: float) -> np.ndarray:
        mask = (freqs >= lo) & (freqs < hi)
        return _bin_by_time(np.sqrt((spec[mask] ** 2).mean(axis=0)), sr, n_steps)

    return {k: level(lo, hi) for k, (lo, hi) in PERCUSSION_BANDS.items()}, level(20, sr / 2)


def _normalize(values: np.ndarray, reference: float, absent_db: float) -> np.ndarray:
    """0..1 respecto del nivel típico de la propia pista (percentil 95); ceros si está ausente."""
    typical = float(np.percentile(values, 95)) if values.size else 0.0
    if typical <= 0 or typical < reference * 10 ** (-absent_db / 20):
        return np.zeros_like(values)
    return np.clip(values / typical, 0.0, 1.0)


def activity(y: np.ndarray, sr: int, stems: dict[str, np.ndarray]) -> dict[str, list[float]]:
    """Actividad 0..1 por instrumento, cada STEP_MS, a partir de las pistas separadas."""
    n_steps = max(1, int(np.ceil(len(y) / sr * 1000 / STEP_MS)))
    mix_ref = float(np.percentile(_rms(y, sr, n_steps), 95))

    def stem(name: str) -> np.ndarray:
        return stems.get(name, np.zeros_like(y))

    raw = {
        "vocals": _rms(stem("vocals"), sr, n_steps),
        "bass": _rms(stem("bass"), sr, n_steps),
        "guitar": _rms(stem("guitar"), sr, n_steps),
        # "piano" casi nunca es piano en bachata (teclados, sintes): va con "otros".
        "other": _rms(stem("other") + stem("piano"), sr, n_steps),
    }
    out = {k: _normalize(v, mix_ref, ABSENT_BELOW_MIX_DB) for k, v in raw.items()}

    drums = stem("drums")
    drums_present = _normalize(_rms(drums, sr, n_steps), mix_ref, ABSENT_BELOW_MIX_DB).any()
    bands, full = _bands(drums, sr, n_steps)
    full_ref = float(np.percentile(full, 95))
    for key, values in bands.items():
        out[key] = _normalize(values, full_ref, ABSENT_BAND_BELOW_DB) if drums_present else np.zeros(n_steps)

    return {k: [round(float(v), 3) for v in out[k]] for k in INSTRUMENT_KEYS}


def analyze_instruments(wav: Path) -> InstrumentsResponse:
    y, sr = sf.read(str(wav), dtype="float32")
    if y.ndim > 1:
        y = y.mean(axis=1)
    if sr != SAMPLE_RATE:
        y = librosa.resample(y, orig_sr=sr, target_sr=SAMPLE_RATE)
        sr = SAMPLE_RATE
    duration_sec = len(y) / sr
    if duration_sec > MAX_DURATION_SEC:
        raise AudioError("El audio supera la duración máxima de 10 minutos.")

    return InstrumentsResponse(
        analyzerVersion=ANALYZER_VERSION,
        durationMs=round(duration_sec * 1000),
        stepMs=STEP_MS,
        tracks=activity(y, sr, separate(y, sr)),
    )
