"""Análisis musical: beats, downbeats, el "1" de la frase de 8 y curva de energía."""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import librosa
import numpy as np

from . import ANALYZER_VERSION
from .audio import MAX_DURATION_SEC, AudioError
from .fingerprint import fingerprint
from .schemas import AnalyzeResponse, Energy

ENERGY_STEP_MS = 250
ANALYSIS_SR = 22050
BEATS_PER_PHRASE = 8


@dataclass
class Beats:
    beats: np.ndarray  # segundos
    downbeats: np.ndarray  # segundos (subconjunto de beats)


@lru_cache(maxsize=1)
def _madmom_processors():
    # Cargar las redes de madmom tarda; se hace una vez por proceso.
    from madmom.features.downbeats import DBNDownBeatTrackingProcessor, RNNDownBeatProcessor

    return RNNDownBeatProcessor(), DBNDownBeatTrackingProcessor(beats_per_bar=[4], fps=100)


def detect_beats(wav: Path) -> Beats:
    """Detector de beats/downbeats. Hoy madmom; aislado acá para poder cambiarlo."""
    rnn, dbn = _madmom_processors()
    result = dbn(rnn(str(wav)))
    if len(result) < 2:
        raise AudioError("No se detectó un pulso en el audio.")
    beats = result[:, 0]
    downbeats = result[result[:, 1] == 1, 0]
    return Beats(beats=beats, downbeats=downbeats)


def estimate_bpm(beats: np.ndarray) -> float:
    """BPM a partir de los beats detectados.

    madmom entrega beats en pasos de 10 ms, así que un solo intervalo viene
    redondeado (124 BPM = 484 ms → 480 o 490). Se mide sobre tramos de 8 beats,
    que diluyen ese redondeo, y la mediana ignora tramos con beats perdidos.
    """
    span = min(BEATS_PER_PHRASE, len(beats) - 1)
    periods = (beats[span:] - beats[:-span]) / span
    return 60.0 / float(np.median(periods))


def compute_energy(y: np.ndarray, sr: int, step_ms: int = ENERGY_STEP_MS) -> list[float]:
    hop = 512
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    # Agrupa por tiempo exacto (no por N frames fijos): 250 ms no es múltiplo del
    # hop, y redondear haría que la curva se desfase a lo largo de la canción.
    times_ms = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop) * 1000
    n_steps = int(np.ceil(len(y) / sr * 1000 / step_ms))
    step_idx = np.minimum((times_ms // step_ms).astype(int), n_steps - 1)
    sums = np.bincount(step_idx, weights=rms, minlength=n_steps)
    counts = np.bincount(step_idx, minlength=n_steps)
    values = np.divide(sums, counts, out=np.zeros(n_steps), where=counts > 0)
    peak = float(values.max()) if values.size else 0.0
    if peak > 0:
        values = values / peak
    return [round(float(v), 3) for v in values]


def pick_phrase_start(beats: np.ndarray, downbeats: np.ndarray, y: np.ndarray, sr: int) -> float:
    """Elige el downbeat que abre la frase de 8 tiempos.

    Una frase son 2 compases de 4, así que el "1" cae en uno de cada dos downbeats.
    Las frases suelen empezar donde la música cambia (entra una voz, sube la
    energía), entonces se elige la paridad cuyos downbeats concentran más cambio
    de energía. El usuario lo corrige si no acierta.
    """
    if len(downbeats) == 0:
        return float(beats[0])
    if len(downbeats) < 4:
        return float(downbeats[0])

    hop = 512
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    beat_period = float(np.median(np.diff(beats)))
    window = 2 * beat_period

    def change_at(t: float) -> float:
        before = rms[(times >= t - window) & (times < t)]
        after = rms[(times >= t) & (times < t + window)]
        if before.size == 0 or after.size == 0:
            return 0.0
        return abs(float(after.mean()) - float(before.mean()))

    scores = [sum(change_at(float(t)) for t in downbeats[parity::2]) for parity in (0, 1)]
    return float(downbeats[int(np.argmax(scores))])


def analyze_file(wav: Path) -> AnalyzeResponse:
    y, sr = librosa.load(str(wav), sr=ANALYSIS_SR, mono=True)
    duration_sec = len(y) / sr
    if duration_sec > MAX_DURATION_SEC:
        raise AudioError("El audio supera la duración máxima de 10 minutos.")

    detected = detect_beats(wav)
    phrase_start = pick_phrase_start(detected.beats, detected.downbeats, y, sr)
    _, fp = fingerprint(wav)

    return AnalyzeResponse(
        analyzerVersion=ANALYZER_VERSION,
        durationMs=round(duration_sec * 1000),
        bpm=round(estimate_bpm(detected.beats), 1),
        beatsMs=[round(t * 1000) for t in detected.beats],
        downbeatsMs=[round(t * 1000) for t in detected.downbeats],
        firstBeatOffsetMs=round(phrase_start * 1000),
        energy=Energy(stepMs=ENERGY_STEP_MS, values=compute_energy(y, sr)),
        sections=[],
        markers=[],
        fingerprint=fp,
    )
