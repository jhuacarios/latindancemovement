"""Coros vs. voz principal.

Demucs entrega toda la voz en una pista. Para separar los coros de la voz
principal se pasa esa pista por un modelo "karaoke" de UVR (MDX-Net,
UVR_MDXNET_KARA_2, ONNX). El modelo estima los coros; la voz principal es lo que
queda de la voz al restarlos.

La inferencia se hace acá directo con onnxruntime (sin la librería
audio-separator, que arrastra muchas dependencias). Es la misma receta MDX:
STFT → modelo → STFT inversa, por trozos con ventana y solape.
"""

import os
from functools import lru_cache
from pathlib import Path

import numpy as np

KARAOKE_MODEL_PATH = Path(os.environ.get("KARAOKE_MODEL_PATH", "/models/UVR_MDXNET_KARA_2.onnx"))
KARAOKE_SR = 44100

# Parámetros del modelo (de la tabla de modelos MDX de UVR).
N_FFT = 5120
HOP = 1024
DIM_F = 2048
DIM_T = 256
COMPENSATE = 1.065
OVERLAP = 0.25

TRIM = N_FFT // 2
CHUNK = HOP * (DIM_T - 1)
GEN = CHUNK - 2 * TRIM


@lru_cache(maxsize=1)
def _session():
    import onnxruntime as ort

    opts = ort.SessionOptions()
    # Por defecto ORT abre un hilo por núcleo del HOST: con la CPU limitada en
    # Docker eso se estorba y tarda ~4 veces más.
    opts.intra_op_num_threads = int(os.environ.get("ANALYZER_THREADS", "2"))
    opts.inter_op_num_threads = 1
    opts.log_severity_level = 3
    # Sin el pool de memoria de ORT: con él la RAM crece hasta ~2,5 GB y no se devuelve.
    opts.enable_cpu_mem_arena = False
    opts.enable_mem_pattern = False
    return ort.InferenceSession(str(KARAOKE_MODEL_PATH), sess_options=opts, providers=["CPUExecutionProvider"])


def _run_chunk(chunk: np.ndarray) -> np.ndarray:
    """(2, CHUNK) → coros estimados (2, CHUNK)."""
    import torch

    window = torch.hann_window(N_FFT, periodic=True)
    x = torch.from_numpy(chunk)
    spec = torch.stft(x, n_fft=N_FFT, hop_length=HOP, window=window, center=True, return_complex=True)
    # (2, F, T) complejo → (1, 4, DIM_F, T) real: [L.re, L.im, R.re, R.im]
    ri = torch.view_as_real(spec).permute(0, 3, 1, 2).reshape(4, -1, spec.shape[-1])[:, :DIM_F]
    ri[:, :3] = 0
    out = _session().run(None, {"input": ri[None].numpy()})[0][0]
    out = torch.from_numpy(out)
    full = torch.zeros((4, N_FFT // 2 + 1, out.shape[-1]))
    full[:, :DIM_F] = out
    cplx = torch.view_as_complex(full.reshape(2, 2, N_FFT // 2 + 1, -1).permute(0, 2, 3, 1).contiguous())
    return torch.istft(cplx, n_fft=N_FFT, hop_length=HOP, window=window, center=True, length=CHUNK).numpy()


def split_vocals(vocals: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """Voz estéreo (2, n) → (voz principal, coros), cada una (2, n) en `sr`."""
    import librosa

    if not vocals.any():
        return vocals, np.zeros_like(vocals)
    mix = vocals if sr == KARAOKE_SR else librosa.resample(vocals, orig_sr=sr, target_sr=KARAOKE_SR)
    mix = np.ascontiguousarray(mix, dtype=np.float32)
    peak = float(np.abs(mix).max()) or 1.0
    norm = mix / peak

    n = norm.shape[-1]
    pad = GEN + TRIM - (n % GEN)
    padded = np.concatenate([np.zeros((2, TRIM), np.float32), norm, np.zeros((2, pad), np.float32)], axis=1)
    step = int((1 - OVERLAP) * CHUNK)
    acc = np.zeros_like(padded)
    div = np.zeros_like(padded)
    for start in range(0, padded.shape[-1], step):
        end = min(start + CHUNK, padded.shape[-1])
        part = padded[:, start:end]
        if part.shape[-1] < CHUNK:
            part = np.pad(part, ((0, 0), (0, CHUNK - part.shape[-1])))
        win = np.hanning(end - start).astype(np.float32)
        acc[:, start:end] += _run_chunk(part)[:, : end - start] * win
        div[:, start:end] += win
    backing = (np.divide(acc, div, out=np.zeros_like(acc), where=div > 0)[:, TRIM:-TRIM][:, :n]) * peak

    if sr != KARAOKE_SR:
        backing = librosa.resample(backing, orig_sr=KARAOKE_SR, target_sr=sr)
    backing = _fit(backing, vocals.shape[-1])
    lead = vocals - backing * COMPENSATE
    return lead.astype(np.float32), backing.astype(np.float32)


def _fit(x: np.ndarray, n: int) -> np.ndarray:
    if x.shape[-1] >= n:
        return x[:, :n]
    return np.pad(x, ((0, 0), (0, n - x.shape[-1])))
