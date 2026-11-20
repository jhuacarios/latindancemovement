import base64
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import main
from app.cutout import CutoutError, make_cutout, model_available

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
# Contorno a mano (algo torcido) alrededor del círculo, en 0..1.
RING = [(0.5 + 0.33 * np.cos(t), 0.5 + 0.31 * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 60, endpoint=False)]


def _photo() -> str:
    """Fondo gris con ruido y una pelota roja al centro."""
    rng = np.random.default_rng(0)
    bg = (120 + rng.normal(0, 8, (600, 600, 3))).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(bg)
    ImageDraw.Draw(img).ellipse((200, 200, 400, 400), fill=(220, 30, 40))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()


def _rgba(b64: str) -> np.ndarray:
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(b64))))


def test_manual_cutout_follows_the_drawn_outline():
    out = make_cutout(_photo(), RING, "manual")
    assert out["smart"] is False
    img = _rgba(out["image"])
    assert img.shape == (512, 512, 4)
    assert img[0, 0, 3] == 0  # esquina transparente
    assert img[256, 256, 3] == 255  # centro opaco
    bordered = _rgba(out["bordered"])
    # El borde blanco agranda la silueta.
    assert (bordered[..., 3] > 127).sum() > (img[..., 3] > 127).sum()


def test_tiny_outline_is_rejected():
    with pytest.raises(CutoutError):
        make_cutout(_photo(), [(0.5, 0.5), (0.501, 0.5), (0.5, 0.501)], "manual")


@pytest.mark.skipif(not model_available(), reason="sin el modelo ISNet (solo en la imagen Docker)")
def test_smart_cutout_snaps_to_the_object():
    def red_share(b64: str) -> float:
        img = _rgba(b64)
        opaque = img[..., 3] > 127
        red = (img[..., 0] > 160) & (img[..., 1] < 90)
        return float((red & opaque).sum() / opaque.sum())

    out = make_cutout(_photo(), RING, "smart")
    assert out["smart"] is True
    # El trazo a mano incluía bastante fondo gris; el inteligente se queda casi solo con la pelota.
    assert red_share(make_cutout(_photo(), RING, "manual")["image"]) < 0.5
    assert red_share(out["image"]) > 0.9


def test_endpoint_rejects_bad_image(monkeypatch):
    monkeypatch.setenv("ANALYZER_TOKEN", TOKEN)
    c = TestClient(main.app)
    r = c.post("/cutout", headers=AUTH, json={"image": base64.b64encode(b"nope").decode(), "polygon": RING, "mode": "manual"})
    assert r.status_code == 422
    r = c.post("/cutout", json={"image": "x", "polygon": RING})
    assert r.status_code == 401


def test_smart_falls_back_to_the_line_while_a_song_is_being_separated(monkeypatch):
    monkeypatch.setenv("ANALYZER_TOKEN", TOKEN)
    monkeypatch.setattr(main, "CUTOUT_WAIT_SEC", 0.1)
    c = TestClient(main.app)
    main.HEAVY.acquire()
    try:
        r = c.post("/cutout", headers=AUTH, json={"image": _photo(), "polygon": RING, "mode": "smart"})
    finally:
        main.HEAVY.release()
    assert r.status_code == 200
    assert r.json()["busy"] is True and r.json()["smart"] is False
