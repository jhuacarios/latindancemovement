"""Recorte de stickers: la persona dibuja a mano el contorno de lo que quiere y acá
se recorta.

- "manual": se recorta tal cual el trazo (con el borde suavizado).
- "smart": un modelo de segmentación (ISNet, el "general use" de rembg; ONNX en CPU)
  busca el objeto principal SOLO dentro del trazo y ajusta el borde a él. El trazo
  manda: lo que quede lejos de la línea se descarta, así el modelo no se va a otra
  persona del fondo. Si el modelo no encuentra nada razonable adentro, se usa el trazo.

Devuelve el sticker cuadrado (512 px, fondo transparente) sin borde y con el borde
blanco tipo WhatsApp, para que el teléfono cambie entre ambos sin volver a pedirlo.
"""

import base64
import io
import os
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy import ndimage

CUTOUT_MODEL_PATH = Path(os.environ.get("CUTOUT_MODEL_PATH", "/models/isnet-general-use.onnx"))
MODEL_SIZE = 1024
MAX_SIDE = 1280
OUT = 512
BORDER_PX = 12
PAD_PX = BORDER_PX + 10


class CutoutError(Exception):
    """La imagen o el trazo no sirven (responde 422)."""


@lru_cache(maxsize=1)
def _session():
    import onnxruntime as ort

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = int(os.environ.get("ANALYZER_THREADS", "2"))
    opts.inter_op_num_threads = 1
    opts.log_severity_level = 3
    opts.enable_cpu_mem_arena = False
    opts.enable_mem_pattern = False
    return ort.InferenceSession(str(CUTOUT_MODEL_PATH), sess_options=opts, providers=["CPUExecutionProvider"])


def release_model() -> None:
    """Suelta el modelo de la memoria (~200 MB): los recortes son esporádicos."""
    _session.cache_clear()


def model_available() -> bool:
    return CUTOUT_MODEL_PATH.is_file()


def _load(image_b64: str):
    from PIL import Image, ImageOps

    try:
        img = Image.open(io.BytesIO(base64.b64decode(image_b64, validate=True)))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception as e:  # imagen corrupta o formato raro
        raise CutoutError("No se pudo leer la imagen.") from e
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    return img


def _polygon_mask(size: tuple[int, int], points: list[tuple[float, float]]) -> np.ndarray:
    from PIL import Image, ImageDraw

    w, h = size
    pts = [(min(max(x, 0.0), 1.0) * (w - 1), min(max(y, 0.0), 1.0) * (h - 1)) for x, y in points]
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.asarray(m) > 127


def _saliency(crop) -> np.ndarray:
    """Probabilidad (0..1) de que cada píxel sea el objeto principal del recorte."""
    from PIL import Image

    x = np.asarray(crop.resize((MODEL_SIZE, MODEL_SIZE), Image.LANCZOS), dtype=np.float32)
    x = x / max(float(x.max()), 1e-6) - 0.5  # mismo preproceso que rembg (media 0,5, std 1)
    x = x.transpose(2, 0, 1)[None]
    sess = _session()
    pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    lo, hi = float(pred.min()), float(pred.max())
    pred = (pred - lo) / max(hi - lo, 1e-6)
    out = Image.fromarray((pred * 255).astype(np.uint8)).resize(crop.size, Image.LANCZOS)
    return np.asarray(out, dtype=np.float32) / 255.0


def _keep_main_parts(alpha: np.ndarray) -> np.ndarray:
    """Quita islas sueltas (manchas que el modelo dejó lejos del objeto)."""
    labels, n = ndimage.label(alpha > 0.5)
    if n <= 1:
        return alpha
    areas = ndimage.sum(np.ones_like(labels), labels, index=range(1, n + 1))
    keep = np.isin(labels, [i + 1 for i, a in enumerate(areas) if a >= 0.08 * areas.max()])
    # Lo semitransparente del borde se conserva si está pegado a una parte que queda.
    near = ndimage.binary_dilation(keep, iterations=3)
    return np.where(near, alpha, 0.0)


def _square(rgb: np.ndarray, alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Recorta a lo visible, lo centra en un cuadrado con margen y lo deja en OUT px."""
    from PIL import Image

    ys, xs = np.nonzero(alpha > 0.05)
    if len(xs) == 0:
        raise CutoutError("El recorte quedó vacío: dibuja el contorno alrededor de lo que quieres.")
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, alpha = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
    h, w = alpha.shape
    scale = (OUT - 2 * PAD_PX) / max(h, w)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
    small = np.asarray(Image.fromarray(rgba, "RGBA").resize((nw, nh), Image.LANCZOS))
    canvas = np.zeros((OUT, OUT, 4), dtype=np.uint8)
    ox, oy = (OUT - nw) // 2, (OUT - nh) // 2
    canvas[oy : oy + nh, ox : ox + nw] = small
    return canvas[..., :3], canvas[..., 3].astype(np.float32) / 255.0


def _with_border(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Borde blanco alrededor de la silueta (debajo del recorte), con el canto suave."""
    dist = ndimage.distance_transform_edt(alpha < 0.5)
    ring = np.clip(BORDER_PX + 1 - dist, 0, 1)
    out_a = np.maximum(alpha, ring)
    white = np.full_like(rgb, 255, dtype=np.float32)
    a = alpha[..., None]
    mixed = rgb.astype(np.float32) * a + white * (1 - a)
    return np.dstack([mixed.astype(np.uint8), (out_a * 255).astype(np.uint8)])


def _png(rgba: np.ndarray) -> str:
    from PIL import Image

    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def make_cutout(image_b64: str, polygon: list[tuple[float, float]], mode: str) -> dict:
    img = _load(image_b64)
    w, h = img.size
    poly = _polygon_mask(img.size, polygon)
    if poly.sum() < 0.002 * w * h:
        raise CutoutError("El contorno es muy chico: dibuja alrededor de lo que quieres recortar.")

    # Borde del trazo suavizado: es la forma del recorte "manual" y el límite del inteligente.
    soft_poly = ndimage.gaussian_filter(poly.astype(np.float32), sigma=1.5)
    alpha = soft_poly
    smart = False
    if mode == "smart" and model_available():
        ys, xs = np.nonzero(poly)
        bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        pad = int(0.08 * max(bw, bh)) + 4
        x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
        x1, y1 = min(w, xs.max() + 1 + pad), min(h, ys.max() + 1 + pad)
        # El modelo ve la foto completa (entiende mejor qué es "el objeto"); si el trazo es
        # chico, también mira de cerca el recorte (más detalle) y se queda con lo mejor de ambos.
        sal = _saliency(img)
        if max(x1 - x0, y1 - y0) < 0.6 * max(w, h):
            sal[y0:y1, x0:x1] = np.maximum(sal[y0:y1, x0:x1], _saliency(img.crop((x0, y0, x1, y1))))
        # Se permite salir un poco del trazo (la línea a mano nunca es exacta), con caída suave.
        reach = max(6.0, 0.04 * max(bw, bh))
        outside = ndimage.distance_transform_edt(~poly)
        allowed = np.clip(1.0 - outside / reach, 0.0, 1.0)
        cand = _keep_main_parts(sal * allowed)
        found = float((cand > 0.5).sum())
        # Aceptable si el modelo encontró algo de tamaño razonable dentro del trazo.
        if 0.12 * poly.sum() <= found <= 1.6 * poly.sum():
            alpha = cand
            smart = True

    rgb, a = _square(np.asarray(img), alpha)
    plain = np.dstack([rgb, (a * 255).astype(np.uint8)])
    return {"image": _png(plain), "bordered": _png(_with_border(rgb, a)), "smart": smart}
