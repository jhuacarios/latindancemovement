import numpy as np
import pytest

from app import instruments
from app.schemas import INSTRUMENT_KEYS

SR = 44100


def tone(freq: float, seconds: float, amp: float = 0.5) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def noise_bursts(seconds: float, lo: float, hi: float, every: float = 0.25) -> np.ndarray:
    """Golpes cortos de ruido filtrado a una banda (percusión sintética)."""
    rng = np.random.default_rng(0)
    y = np.zeros(int(seconds * SR), dtype=np.float32)
    n = int(0.04 * SR)
    for start in np.arange(0, seconds - 0.05, every):
        burst = rng.standard_normal(n)
        spec = np.fft.rfft(burst)
        freqs = np.fft.rfftfreq(n, 1 / SR)
        spec[(freqs < lo) | (freqs > hi)] = 0
        i = int(start * SR)
        y[i : i + n] += 0.3 * np.fft.irfft(spec, n).astype(np.float32) * np.exp(-np.arange(n) / (0.01 * SR))
    return y


def test_activity_follows_each_stem():
    seconds = 8.0
    half = int(4 * SR)
    vocals = tone(440, seconds)
    vocals[half:] = 0  # la voz se calla en la segunda mitad
    guira = noise_bursts(seconds, 6000, 12000)
    guira[:half] = 0  # la güira entra en la segunda mitad
    stems = {"vocals": vocals, "drums": guira, "bass": np.zeros_like(vocals)}
    mix = vocals + guira

    act = instruments.activity(mix, SR, stems)

    assert set(act) == set(INSTRUMENT_KEYS)
    steps = int(seconds * 1000 / instruments.STEP_MS)
    assert all(len(v) == steps for v in act.values())
    first, second = slice(2, steps // 2 - 2), slice(steps // 2 + 2, steps - 2)
    assert np.mean(act["vocals"][first]) > 0.8 and np.mean(act["vocals"][second]) < 0.05
    assert np.mean(act["guira"][second]) > 0.4 and np.mean(act["guira"][first]) < 0.05
    # Lo que no sonó queda en cero (no se amplifica el ruido).
    assert not any(act["bass"]) and not any(act["guitar"])
    # La güira es aguda: no aparece como tumba.
    assert np.mean(act["tumba"][second]) < np.mean(act["guira"][second])


def test_analyze_instruments_rejects_long_audio(tmp_path, monkeypatch):
    import soundfile as sf

    monkeypatch.setattr(instruments, "MAX_DURATION_SEC", 1)
    path = tmp_path / "long.wav"
    sf.write(path, tone(440, 2.0), SR)
    with pytest.raises(instruments.AudioError):
        instruments.analyze_instruments(path)


def test_demucs_separates_real_audio(tmp_path):
    """Corre el modelo de verdad sobre unos segundos (lento: carga torch y el modelo)."""
    import soundfile as sf

    path = tmp_path / "mix.wav"
    sf.write(path, tone(220, 4.0) + noise_bursts(4.0, 6000, 12000), SR)
    res = instruments.analyze_instruments(path)
    assert res.stepMs == instruments.STEP_MS
    assert set(res.tracks) == set(INSTRUMENT_KEYS)
    assert all(len(v) == 16 for v in res.tracks.values())
    assert all(0.0 <= x <= 1.0 for v in res.tracks.values() for x in v)
