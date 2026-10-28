# Analizador de audio (módulo Estudio)

Servicio Python **sin estado** que analiza bachatas para el módulo Estudio. La API
(NestJS) le pasa una URL firmada del audio del usuario; el analizador la baja,
la analiza y devuelve JSON. No toca la base de datos ni guarda archivos.

## Endpoints

Todos menos `/health` piden `Authorization: Bearer $ANALYZER_TOKEN`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Estado y versión del analizador |
| POST | `/fingerprint` | `{ audioUrl }` → `{ durationMs, fingerprint }`. Rápido; sirve para reconocer una grabación ya analizada |
| POST | `/analyze` | `{ audioUrl, options }` → BPM, beats, downbeats, el "1" de la frase de 8, energía, huella. Contrato en [app/schemas.py](app/schemas.py) |

Errores del archivo (no se pudo bajar, formato inválido, > 10 min) → **422**.

## Correr en local

```bash
# Desde la raíz del monorepo: levanta Postgres, Redis, el S3 local y el analizador
docker compose up -d --build
curl http://localhost:8000/health

# Tests (dentro del contenedor: el Python local puede ser demasiado nuevo para madmom)
docker build -t nectason-analyzer apps/analyzer
docker run --rm nectason-analyzer python -m pytest -q
```

## Decisión de librerías (2026-10)

Prueba en Python 3.12 con clicks sintéticos a 120 y 130 BPM:

| Librería | Resultado | Decisión |
|---|---|---|
| **madmom** (commit fijo de `main`) | BPM exacto, beats y downbeats correctos; ~4.5 s por 30 s de audio en CPU | **Beats y downbeats (v0.1)** |
| librosa | Erró 120 BPM por 2.5 y arrancó tarde | Solo energía y onsets |
| beat_this | Se instala, pero el servidor de su modelo (JKU) respondía HTTP 500 | Reevaluar con canciones reales; si se adopta, el modelo va **dentro de la imagen** |
| allin1 (secciones) | Falla al importar: requiere `natten` | Fase 2: evaluar o reemplazar por auto-similitud con librosa |
| Chromaprint (`fpcalc`) | OK | Huella acústica para reutilizar análisis entre usuarios |

**Pendiente:** repetir la comparación con 2–3 bachatas reales antes de cerrar la Fase 1.

## El "1" de la frase

madmom entrega los downbeats (el 1 de cada compás de 4). Una frase de bachata son
2 compases, así que el "1" de frase cae en uno de cada dos downbeats. Se elige la
paridad cuyos downbeats concentran más cambio de energía (las frases suelen
arrancar donde entra algo nuevo). Es una heurística: el usuario lo corrige en la
vista de estudio y la API recalcula la grilla.

## Versionado

`ANALYZER_VERSION` en [app/__init__.py](app/__init__.py) se guarda con cada análisis.
Súbela en cada cambio que altere resultados, para poder re-analizar lo existente.
