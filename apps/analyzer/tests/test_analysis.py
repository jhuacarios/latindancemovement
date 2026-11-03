import numpy as np
import pytest

from app.analysis import analyze_file

TOLERANCE_MS = 30


# 124 y 127: periodos que no son múltiplo de 10 ms (la resolución de madmom).
@pytest.mark.parametrize("bpm", [120, 124, 127, 130])
def test_bpm_and_beats_on_click_track(make_clicks, bpm):
    path, truth = make_clicks(bpm)
    result = analyze_file(path)

    assert abs(result.bpm - bpm) <= 1

    truth_ms = truth * 1000
    beats = np.array(result.beatsMs)
    # Ignora el primer y último segundo, donde los detectores arrancan/cortan.
    inner = beats[(beats > truth_ms[0] + 1000) & (beats < truth_ms[-1] - 1000)]
    assert len(inner) > 0
    errors = np.array([np.min(np.abs(truth_ms - b)) for b in inner])
    assert errors.max() <= TOLERANCE_MS


def test_first_beat_offset_is_a_downbeat(make_clicks):
    path, _ = make_clicks(125)
    result = analyze_file(path)
    assert result.firstBeatOffsetMs in result.downbeatsMs
    # Con acento cada 4 tiempos, los downbeats deben estar separados por ~4 beats.
    gaps = np.diff(result.downbeatsMs)
    beat_ms = 60000 / 125
    assert np.allclose(np.median(gaps), 4 * beat_ms, atol=TOLERANCE_MS)


def test_energy_is_normalized(make_clicks):
    path, _ = make_clicks(120)
    result = analyze_file(path)
    assert result.energy.stepMs == 250
    assert max(result.energy.values) == pytest.approx(1.0)
    assert min(result.energy.values) >= 0
    # Una entrada por cada 250 ms (±1 por redondeo del último tramo).
    assert abs(len(result.energy.values) - result.durationMs / 250) <= 1
