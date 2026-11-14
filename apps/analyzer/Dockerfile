# Analizador de audio del módulo Estudio. Python 3.12 fijo: madmom no soporta 3.13+.
FROM python:3.12-slim

# ffmpeg: decodifica MP3/M4A/WAV/FLAC. libchromaprint-tools: `fpcalc` (huella acústica).
# build-essential + cython: madmom compila extensiones al instalarse.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libchromaprint-tools git build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir cython numpy==2.5.4 \
  && pip install --no-cache-dir -r requirements-dev.txt

# Pesos del modelo de separación dentro de la imagen (~80 MB): sin descargas al arrancar.
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs_6s')"

# Modelo karaoke (coros vs. voz principal), ~50 MB, verificado por hash.
ARG KARAOKE_MODEL_URL=https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR_MDXNET_KARA_2.onnx
ARG KARAOKE_MODEL_SHA256=bf32e15105a09c0f7dddd2b67346146334d6f3ecb399ed7638eba2ab07cbf5f4
RUN mkdir -p /models   && python -c "import urllib.request,sys; urllib.request.urlretrieve(sys.argv[1], '/models/UVR_MDXNET_KARA_2.onnx')" "$KARAOKE_MODEL_URL"   && echo "$KARAOKE_MODEL_SHA256  /models/UVR_MDXNET_KARA_2.onnx" | sha256sum -c -
ENV KARAOKE_MODEL_PATH=/models/UVR_MDXNET_KARA_2.onnx
# Menos arenas de malloc: la memoria liberada entre pasos (Demucs → karaoke → divisiones)
# vuelve al sistema en vez de acumularse (pico medido ~2,8 GB por canción).
ENV MALLOC_ARENA_MAX=2

COPY . .

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", ": \"${ANALYZER_TOKEN:?falta ANALYZER_TOKEN}\" && uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
