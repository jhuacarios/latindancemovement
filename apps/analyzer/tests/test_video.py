"""Versión compatible de videos (HEVC/HDR del iPhone -> MP4 H.264 SDR <= 1080p)."""

import shutil
import subprocess
from pathlib import Path

import pytest

from app import video


def _make(path: Path, args: list[str]) -> Path:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y",
         "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30:duration=2",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
         *args, "-shortest", str(path)],
        check=True,
    )
    return path


@pytest.fixture
def h264_sdr(tmp_path: Path) -> Path:
    return _make(tmp_path / "sdr.mp4", ["-vf", "scale=1280:720", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"])


@pytest.fixture
def hevc_hdr_portrait(tmp_path: Path) -> Path:
    """Como un video vertical del iPhone: HEVC 10 bits, HLG (HDR), 1440x2560."""
    return _make(
        tmp_path / "iphone.mov",
        [
            "-vf", "scale=1440:2560,format=yuv420p10le",
            "-c:v", "libx265",
            "-x265-params", "log-level=error:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc",
            "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc",
            "-tag:v", "hvc1", "-c:a", "aac",
        ],
    )


def test_h264_sdr_no_necesita_copia(h264_sdr: Path):
    info = video.probe(h264_sdr)
    assert info["codec"] == "h264"
    assert not video.needs_compat(info)


def test_hevc_hdr_necesita_copia(hevc_hdr_portrait: Path):
    info = video.probe(hevc_hdr_portrait)
    assert info["codec"] == "hevc"
    assert video.is_hdr(info)
    assert video.needs_compat(info)


def test_convierte_a_h264_sdr_1080_vertical(hevc_hdr_portrait: Path, tmp_path: Path):
    info = video.probe(hevc_hdr_portrait)
    out = video.transcode(hevc_hdr_portrait, tmp_path / "out.mp4", info)
    res = video.probe(out)
    assert res["codec"] == "h264"
    assert res["pix_fmt"] == "yuv420p"
    assert res["transfer"] in ("bt709", "")
    assert (res["width"], res["height"]) == (1080, 1920)  # lado corto a 1080, se mantiene vertical
    assert abs(res["duration"] - info["duration"]) < 0.2


def _fake_io(monkeypatch, source: Path, uploaded: dict):
    monkeypatch.setattr(video, "download_video", lambda url, dest: Path(shutil.copy(source, dest)))
    monkeypatch.setattr(video, "upload", lambda path, url: uploaded.update(url=url, size=path.stat().st_size))


def test_make_compat_convierte_y_sube(monkeypatch, hevc_hdr_portrait: Path, tmp_path: Path):
    uploaded: dict = {}
    _fake_io(monkeypatch, hevc_hdr_portrait, uploaded)
    work = tmp_path / "work"
    work.mkdir()
    r = video.make_compat("http://src", "http://dst", 900, work)
    assert r["result"] == "converted"
    assert r["sizeBytes"] == uploaded["size"] > 0
    assert uploaded["url"] == "http://dst"


def test_make_compat_no_convierte_lo_compatible_ni_lo_largo(monkeypatch, h264_sdr: Path, hevc_hdr_portrait: Path, tmp_path: Path):
    uploaded: dict = {}
    _fake_io(monkeypatch, h264_sdr, uploaded)
    w1 = tmp_path / "w1"
    w1.mkdir()
    assert video.make_compat("http://src", "http://dst", 900, w1)["result"] == "not_needed"

    _fake_io(monkeypatch, hevc_hdr_portrait, uploaded)
    w2 = tmp_path / "w2"
    w2.mkdir()
    assert video.make_compat("http://src", "http://dst", 1, w2)["result"] == "too_long"
    assert uploaded == {}
