"""Actividad de instrumentos: qué suena en cada momento de la canción.

Se separa la canción en pistas con Demucs (htdemucs_6s) y de cada pista se mide
la energía cada 250 ms. Las pistas se descartan apenas se miden: el resultado
son solo datos (no audio), por eso se puede compartir entre usuarios.

Demucs no conoce los instrumentos de la bachata, así que varios se derivan:
- Voz → voz principal y coros, con un modelo karaoke (ver `karaoke.py`).
- Percusión → campana (la parte que RESUENA: el cencerro tiene un tono estable)
  y el resto por bandas de frecuencia (tumba grave, bongó medio, güira aguda).
- Guitarra → requinto (notas agudas, desde Mi4) y segunda (registro medio-grave),
  descontando los armónicos de las notas graves.
- "piano" de Demucs → teclados (en bachata casi nunca es piano: teclados, sintes).
Las derivadas son aproximaciones: sirven para saber cuándo suena cada uno, no
para aislarlos perfecto.
"""

import os
from functools import lru_cache
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from . import ANALYZER_VERSION
from .audio import MAX_DURATION_SEC, SAMPLE_RATE, AudioError
from .karaoke import split_vocals
from .schemas import INSTRUMENT_KEYS, InstrumentsResponse

STEP_MS = 250
HOP = 512
N_FFT = 2048
DEMUCS_MODEL = "htdemucs_6s"

# Bandas (Hz) de la pista de percusión (sin la campana).
PERCUSSION_BANDS = {
    "tumba": (30, 150),
    "bongo": (250, 2500),
    "guira": (5000, 16000),
}
# La campana: componente tonal de la percusión en esta banda (fundamental ~600-1100 Hz
# y sus parciales metálicos).
CAMPANA_BAND = (450.0, 5000.0)
# Registro de la guitarra: desde esta nota hacia arriba es requinto.
REQUINTO_FROM_NOTE = "E4"
# Bajo esta frecuencia todo lo de la guitarra va a la segunda (pista de audio).
SEGUNDA_BELOW_HZ = 300.0

# Una pista cuyo nivel típico queda tanto bajo la mezcla se considera ausente
# (si no, al normalizarla se amplifica el ruido que deja la separación).
ABSENT_BELOW_MIX_DB = 35.0
# Derivadas de otra pista (bandas, campana, requinto/segunda): relativo a esa pista.
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


# --- Derivadas: campana y requinto/segunda -----------------------------------------


def _stft(x: np.ndarray) -> np.ndarray:
    return librosa.stft(x, n_fft=N_FFT, hop_length=HOP)


def _istft(spec: np.ndarray, n: int) -> np.ndarray:
    return librosa.istft(spec, hop_length=HOP, n_fft=N_FFT, length=n)


def campana_mask(drums_mono: np.ndarray, sr: int) -> np.ndarray:
    """Máscara 0..1 (bins × frames) de la campana dentro de la percusión.

    HPSS separa lo que resuena (tono estable en el tiempo) de lo que es golpe.
    En la percusión de bachata lo que resuena en la banda media-aguda es el
    cencerro; bongó, güira y tumba son golpes.
    """
    mag = np.abs(_stft(drums_mono))
    harm, perc = librosa.decompose.hpss(mag, margin=(1.0, 1.0))
    mask = harm**2 / (harm**2 + perc**2 + 1e-12)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
    mask[(freqs < CAMPANA_BAND[0]) | (freqs > CAMPANA_BAND[1])] = 0.0
    return mask


def requinto_share(guitar_mono: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Energía (por frame STFT) del requinto y de la segunda, y la fracción de
    lo agudo que es requinto (0..1).

    Se mide con CQT (una fila por semitono). A cada nota se le descuenta la
    energía de la octava y la quinta de abajo: si esas suenan, la aguda es
    probablemente un armónico de la segunda y no una nota del requinto.
    """
    sr_cqt = 22050
    y = librosa.resample(guitar_mono, orig_sr=sr, target_sr=sr_cqt) if sr != sr_cqt else guitar_mono
    fmin = librosa.note_to_hz("E2")
    hop = HOP * sr_cqt // sr  # mismo paso en segundos que la STFT (sr = 44.1 kHz)
    cqt = np.abs(librosa.cqt(y, sr=sr_cqt, hop_length=hop, fmin=fmin, n_bins=60, bins_per_octave=12))
    clean = cqt.copy()
    clean[12:] = np.maximum(0.0, cqt[12:] - 0.6 * cqt[:-12])
    clean[19:] = np.maximum(0.0, clean[19:] - 0.4 * cqt[:-19])
    freqs = librosa.cqt_frequencies(60, fmin=fmin)
    hi = freqs >= librosa.note_to_hz(REQUINTO_FROM_NOTE)
    requinto = np.sqrt((clean[hi] ** 2).mean(axis=0))
    segunda = np.sqrt((clean[~hi] ** 2).mean(axis=0))
    raw_hi = np.sqrt((cqt[hi] ** 2).mean(axis=0))
    share = np.clip(np.divide(requinto, raw_hi, out=np.zeros_like(requinto), where=raw_hi > 0), 0.0, 1.0)
    return requinto, segunda, share


def split_drums(drums: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """Percusión estéreo (2, n) → (campana, resto), cada una (2, n)."""
    mask = campana_mask(drums.mean(0), sr)
    n = drums.shape[-1]
    campana = np.stack([_istft(_stft(ch) * mask, n) for ch in drums])
    return campana.astype(np.float32), (drums - campana).astype(np.float32)


def split_guitar(guitar: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """Guitarras estéreo (2, n) → (requinto, segunda), cada una (2, n).

    Lo grave va entero a la segunda; de lo agudo, va al requinto la fracción que
    no son armónicos de la segunda (ver `requinto_share`). Aproximado.
    """
    n = guitar.shape[-1]
    _, _, share = requinto_share(guitar.mean(0), sr)
    specs = [_stft(ch) for ch in guitar]
    frames = specs[0].shape[1]
    share = np.interp(np.arange(frames), np.linspace(0, frames - 1, len(share)), share) if len(share) else np.zeros(frames)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
    mask = np.where(freqs[:, None] >= SEGUNDA_BELOW_HZ, share[None, :], 0.0)
    requinto = np.stack([_istft(s * mask, n) for s in specs])
    return requinto.astype(np.float32), (guitar - requinto).astype(np.float32)


# --- Actividad ---------------------------------------------------------------------


def _bin_by_time(frames: np.ndarray, sr: int, n_steps: int) -> np.ndarray:
    """Promedia valores por frame (hop HOP) en pasos exactos de STEP_MS."""
    times_ms = librosa.frames_to_time(np.arange(len(frames)), sr=sr, hop_length=HOP) * 1000
    idx = np.minimum((times_ms // STEP_MS).astype(int), n_steps - 1)
    sums = np.bincount(idx, weights=frames, minlength=n_steps)
    counts = np.bincount(idx, minlength=n_steps)
    return np.divide(sums, counts, out=np.zeros(n_steps), where=counts > 0)


def _rms(x: np.ndarray, sr: int, n_steps: int) -> np.ndarray:
    return _bin_by_time(librosa.feature.rms(y=x, frame_length=N_FFT, hop_length=HOP)[0], sr, n_steps)


def _bands(spec_mag: np.ndarray, sr: int, n_steps: int) -> tuple[dict[str, np.ndarray], np.ndarray]:
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)

    def level(lo: float, hi: float) -> np.ndarray:
        mask = (freqs >= lo) & (freqs < hi)
        return _bin_by_time(np.sqrt((spec_mag[mask] ** 2).mean(axis=0)), sr, n_steps)

    return {k: level(lo, hi) for k, (lo, hi) in PERCUSSION_BANDS.items()}, level(20, sr / 2)


def _normalize(values: np.ndarray, reference: float, absent_db: float) -> np.ndarray:
    """0..1 respecto del nivel típico de la propia pista (percentil 95); ceros si está ausente."""
    typical = float(np.percentile(values, 95)) if values.size else 0.0
    if typical <= 0 or typical < reference * 10 ** (-absent_db / 20):
        return np.zeros_like(values)
    return np.clip(values / typical, 0.0, 1.0)


def activity(y: np.ndarray, sr: int, stems: dict[str, np.ndarray]) -> dict[str, list[float]]:
    """Actividad 0..1 por instrumento, cada STEP_MS, a partir de las pistas (mono).

    `stems` trae las pistas de Demucs con "vocals" = voz principal y, si se
    separaron, "coros".
    """
    n_steps = max(1, int(np.ceil(len(y) / sr * 1000 / STEP_MS)))
    mix_ref = float(np.percentile(_rms(y, sr, n_steps), 95))

    def stem(name: str) -> np.ndarray:
        return stems.get(name, np.zeros_like(y))

    raw = {
        "vocals": _rms(stem("vocals"), sr, n_steps),
        "coros": _rms(stem("coros"), sr, n_steps),
        "bass": _rms(stem("bass"), sr, n_steps),
        "guitar": _rms(stem("guitar"), sr, n_steps),
        "keys": _rms(stem("piano"), sr, n_steps),
        "other": _rms(stem("other"), sr, n_steps),
    }
    out = {k: _normalize(v, mix_ref, ABSENT_BELOW_MIX_DB) for k, v in raw.items()}

    # Guitarra → requinto / segunda (solo si hay guitarra).
    guitar = stem("guitar")
    if out["guitar"].any():
        req, seg, _ = requinto_share(guitar, sr)  # mismo paso que la STFT (HOP a `sr`)
        req, seg = _bin_by_time(req, sr, n_steps), _bin_by_time(seg, sr, n_steps)
        both = float(np.percentile(np.maximum(req, seg), 95))
        out["requinto"] = _normalize(req, both, ABSENT_BAND_BELOW_DB)
        out["segunda"] = _normalize(seg, both, ABSENT_BAND_BELOW_DB)
    else:
        out["requinto"] = out["segunda"] = np.zeros(n_steps)

    # Percusión → campana (lo que resuena) + bandas del resto (golpes).
    drums = stem("drums")
    drums_present = _normalize(_rms(drums, sr, n_steps), mix_ref, ABSENT_BELOW_MIX_DB).any()
    mag = np.abs(_stft(drums))
    cmask = campana_mask(drums, sr) if drums_present else np.zeros_like(mag)
    _, full = _bands(mag, sr, n_steps)
    full_ref = float(np.percentile(full, 95))
    bands, _ = _bands(mag * (1.0 - cmask), sr, n_steps)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
    in_band = (freqs >= CAMPANA_BAND[0]) & (freqs <= CAMPANA_BAND[1])
    campana = _bin_by_time(np.sqrt(((mag * cmask)[in_band] ** 2).mean(axis=0)), sr, n_steps)
    bands["campana"] = campana
    for key, values in bands.items():
        out[key] = _normalize(values, full_ref, ABSENT_BAND_BELOW_DB) if drums_present else np.zeros(n_steps)

    return {k: [round(float(v), 3) for v in out[k]] for k in INSTRUMENT_KEYS}


def separate_all(stereo: np.ndarray, sr: int) -> dict[str, np.ndarray]:
    """Demucs + coros: pistas estéreo (2, n) con "vocals" = voz principal y "coros"."""
    stems = separate_stereo(stereo, sr)
    lead, coros = split_vocals(stems["vocals"], sr)
    stems["vocals"], stems["coros"] = lead, coros
    return stems


def analyze_instruments(wav: Path) -> InstrumentsResponse:
    audio, sr = sf.read(str(wav), dtype="float32", always_2d=True)  # (n, canales)
    # Estéreo de verdad: el modelo karaoke separa los coros por su imagen estéreo.
    stereo = audio.T if audio.shape[1] == 2 else np.repeat(audio.T[:1], 2, axis=0)
    if sr != SAMPLE_RATE:
        stereo = librosa.resample(stereo, orig_sr=sr, target_sr=SAMPLE_RATE)
        sr = SAMPLE_RATE
    y = stereo.mean(0)
    duration_sec = len(y) / sr
    if duration_sec > MAX_DURATION_SEC:
        raise AudioError("El audio supera la duración máxima de 10 minutos.")

    stems = separate_all(np.ascontiguousarray(stereo), sr)
    return InstrumentsResponse(
        analyzerVersion=ANALYZER_VERSION,
        durationMs=round(duration_sec * 1000),
        stepMs=STEP_MS,
        tracks=activity(y, sr, {name: x.mean(0) for name, x in stems.items()}),
    )
