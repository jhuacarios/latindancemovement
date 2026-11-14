"""Contrato HTTP del analizador. Debe calzar con los tipos de `@baile-latino/types`
(SongAnalysisResult y compañía) que consume la API."""

from typing import Literal

from pydantic import BaseModel, Field

SectionType = Literal[
    "INTRO", "VERSO", "CORO", "DERECHO", "MAJAO", "MONTUNO", "MAMBO", "SOLO", "PUENTE", "OUTRO", "OTRO"
]
MarkerType = Literal["BREAK", "ACENTO", "CORTE", "NOTA"]


class AnalyzeOptions(BaseModel):
    separateStems: bool = False  # Fase 3


class AnalyzeRequest(BaseModel):
    audioUrl: str = Field(min_length=1)
    options: AnalyzeOptions = AnalyzeOptions()


class FingerprintRequest(BaseModel):
    audioUrl: str = Field(min_length=1)


class FingerprintResponse(BaseModel):
    durationMs: int = Field(ge=0)
    # Huella cruda de Chromaprint (enteros de 32 bits). Se compara por bits en la API.
    fingerprint: list[int]


# Instrumentos que se miden (calza con INSTRUMENT_KEYS de @baile-latino/types).
# "vocals" = voz principal (sin coros); "guitar" = todas las guitarras juntas.
# Salsa usa las mismas pistas con otro nombre: keys = piano, other = metales,
# guira = güiro/maracas, bongo = bongó/timbal; y suma las congas.
INSTRUMENT_KEYS = (
    "vocals", "coros", "guitar", "requinto", "segunda", "bass",
    "guira", "bongo", "campana", "conga", "tumba", "keys", "other",
)
InstrumentKey = Literal[
    "vocals", "coros", "guitar", "requinto", "segunda", "bass",
    "guira", "bongo", "campana", "conga", "tumba", "keys", "other",
]


# Pistas que se guardan para el mezclador ("drums" = percusión sin la campana).
STEM_KEYS = ("vocals", "coros", "requinto", "segunda", "bass", "drums", "campana", "keys", "other")
StemKey = Literal["vocals", "coros", "requinto", "segunda", "bass", "drums", "campana", "keys", "other"]


class StemsRequest(BaseModel):
    audioUrl: str = Field(min_length=1)
    # URL firmada (PUT, Content-Type audio/mp4) donde subir cada pista. Deben venir todas.
    uploads: dict[StemKey, str]


class StemsResponse(BaseModel):
    analyzerVersion: str
    durationMs: int = Field(ge=0)
    stems: list[StemKey]


class InstrumentsRequest(BaseModel):
    audioUrl: str = Field(min_length=1)


class InstrumentsResponse(BaseModel):
    analyzerVersion: str
    durationMs: int = Field(ge=0)
    stepMs: int = Field(gt=0)
    # Actividad 0..1 de cada instrumento, un valor cada `stepMs`.
    tracks: dict[InstrumentKey, list[float]]


class Energy(BaseModel):
    stepMs: int = Field(gt=0)
    values: list[float]  # 0..1, normalizado al máximo de la canción


class Section(BaseModel):
    type: SectionType
    startMs: int = Field(ge=0)
    endMs: int = Field(ge=0)


class Marker(BaseModel):
    type: MarkerType
    timeMs: int = Field(ge=0)


class AnalyzeResponse(BaseModel):
    analyzerVersion: str
    durationMs: int = Field(ge=0)
    bpm: float = Field(gt=0)
    beatsMs: list[int]
    downbeatsMs: list[int]
    # El "1" de la primera frase de 8 tiempos (el usuario lo puede corregir).
    firstBeatOffsetMs: int = Field(ge=0)
    energy: Energy
    sections: list[Section]  # Fase 2
    markers: list[Marker]  # Fase 2
    fingerprint: list[int]
