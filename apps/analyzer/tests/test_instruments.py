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
    for key in ("bass", "guitar", "requinto", "segunda", "coros", "keys"):
        assert not any(act[key]), key
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


def test_campana_goes_to_its_own_track():
    """Un tono sostenido (cencerro) sale como campana; los golpes de ruido no."""
    seconds = 6.0
    bell = tone(700, seconds, amp=0.3)
    hits = noise_bursts(seconds, 300, 2000)
    drums = np.stack([bell + hits, bell + hits])

    campana, rest = instruments.split_drums(drums, SR)

    def energy(x):
        return float((x**2).mean())

    assert energy(campana) > 0.5 * energy(np.stack([bell, bell]))
    # Lo que queda en "resto" es casi solo golpe: poca energía a 700 Hz.
    spec = np.abs(np.fft.rfft(rest[0]))
    freqs = np.fft.rfftfreq(rest.shape[1], 1 / SR)
    around = (freqs > 690) & (freqs < 710)
    spec_bell = np.abs(np.fft.rfft(bell))
    assert spec[around].max() < 0.3 * spec_bell[around].max()
    # Las dos partes suman la percusión original.
    assert np.allclose(campana + rest, drums, atol=1e-4)


def test_guitar_splits_by_register():
    """Notas agudas → requinto; notas graves → segunda."""
    seconds = 8.0
    half = int(4 * SR)
    low = tone(147, seconds)  # D3: segunda
    low[half:] = 0
    high = tone(880, seconds)  # A5: requinto
    high[:half] = 0
    guitar = low + high
    act = instruments.activity(guitar, SR, {"guitar": guitar})
    steps = len(act["requinto"])
    first, second = slice(2, steps // 2 - 2), slice(steps // 2 + 2, steps - 2)
    assert np.mean(act["segunda"][first]) > np.mean(act["requinto"][first])
    assert np.mean(act["requinto"][second]) > np.mean(act["segunda"][second])

    req, seg = instruments.split_guitar(np.stack([guitar, guitar]), SR)
    assert np.allclose(req + seg, np.stack([guitar, guitar]), atol=1e-4)
    assert float((req[:, :half] ** 2).mean()) < 0.1 * float((seg[:, :half] ** 2).mean())


def test_karaoke_model_keeps_length_and_sum():
    """Corre el modelo karaoke de verdad sobre unos segundos (lento)."""
    from app import karaoke

    voice = np.stack([tone(330, 3.0), tone(330, 3.0)])
    lead, coros = karaoke.split_vocals(voice, SR)
    assert lead.shape == voice.shape and coros.shape == voice.shape
    assert np.allclose(lead + coros * karaoke.COMPENSATE, voice, atol=1e-4)
