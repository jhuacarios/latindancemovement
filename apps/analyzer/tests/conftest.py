from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

SR = 44100


def click_track(bpm: float, seconds: float = 40.0, offset: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """Clicks a BPM conocido, con acento (más fuerte y agudo) en cada 1 del compás.

    Devuelve (audio, tiempos reales de los beats en segundos)."""
    period = 60.0 / bpm
    times = np.arange(offset, seconds - 0.1, period)
    y = np.zeros(int(seconds * SR))
    n = int(0.03 * SR)
    env = np.exp(-np.arange(n) / (0.005 * SR))
    for i, t in enumerate(times):
        start = int(t * SR)
        freq, amp = (1500, 1.0) if i % 4 == 0 else (1000, 0.5)
        y[start : start + n] += amp * np.sin(2 * np.pi * freq * np.arange(n) / SR) * env
    return y, times


@pytest.fixture
def make_clicks(tmp_path: Path):
    def _make(bpm: float, **kwargs) -> tuple[Path, np.ndarray]:
        y, times = click_track(bpm, **kwargs)
        path = tmp_path / f"click-{bpm}.wav"
        sf.write(path, y, SR)
        return path, times

    return _make
