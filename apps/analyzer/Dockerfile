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

COPY . .

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", ": \"${ANALYZER_TOKEN:?falta ANALYZER_TOKEN}\" && uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
