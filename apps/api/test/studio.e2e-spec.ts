/**
 * E2E del módulo Estudio contra el Postgres local (docker compose up -d db), con
 * el storage, el analizador Python y la cola reemplazados por dobles en memoria.
 * Correr: pnpm --filter @baile-latino/api test:e2e
 */
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { SongStudy, StudioUploadTicket } from '@baile-latino/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { TracksService } from '../src/music/tracks/tracks.service';
import { StudioController } from '../src/studio/studio.controller';
import { StudioService } from '../src/studio/studio.service';
import { StudioAnalysisService } from '../src/studio/studio-analysis.service';
import { StudioEnabledGuard } from '../src/studio/studio-enabled.guard';
import { StudioQueue } from '../src/studio/studio.queue';
import { AudioStorageService } from '../src/studio/audio-storage.service';
import { AnalyzerClient, AnalyzerFileError } from '../src/studio/analyzer.client';
import { STUDIO_CONFIG, type StudioConfig } from '../src/studio/studio.config';
import type { AnalyzerResultDto } from '../src/studio/dto/analyzer-result.dto';

process.env.JWT_SECRET = 'e2e-secret';

const MB = 1024 * 1024;
const config: StudioConfig = {
  s3: {
    endpoint: 'memory://',
    analyzerEndpoint: 'memory://',
    region: 'auto',
    bucket: 'test',
    accessKeyId: 'x',
    secretAccessKey: 'x',
  },
  redisUrl: 'redis://unused',
  analyzer: { url: 'http://unused', token: 'x' },
  maxUploadBytes: 30 * MB,
};

/** Storage en memoria. */
class FakeStorage {
  objects = new Map<string, number>();
  put(key: string, bytes: number) {
    this.objects.set(key, bytes);
  }
  async uploadUrl(key: string) {
    return `memory://upload/${key}`;
  }
  async playbackUrl(key: string) {
    return `memory://play/${key}`;
  }
  async analyzerUrl(key: string) {
    return `memory://analyze/${key}`;
  }
  async analyzerUploadUrl(key: string) {
    return `memory://upload/${key}`;
  }
  has(key: string) {
    return this.objects.has(key);
  }
  async size(key: string) {
    return this.objects.get(key) ?? null;
  }
  async remove(key: string) {
    this.objects.delete(key);
  }
}

const beatsMs = Array.from({ length: 64 }, (_, i) => 400 + i * 500); // 120 BPM
const fingerprint = Array.from({ length: 300 }, (_, i) => (i * 2654435761) >>> 0);

function analyzerResult(overrides: Partial<AnalyzerResultDto> = {}): AnalyzerResultDto {
  return {
    analyzerVersion: '0.1.1',
    durationMs: 32_000,
    bpm: 120,
    beatsMs,
    downbeatsMs: beatsMs.filter((_, i) => i % 4 === 0),
    firstBeatOffsetMs: 400,
    energy: { stepMs: 250, values: new Array(128).fill(0.5) },
    sections: [],
    markers: [],
    fingerprint,
    ...overrides,
  };
}

/** Analizador simulado: lo que se le encole a `next` es lo que devuelve. */
/** Actividad simulada: la primera frase sin percusión (intro), el resto con voz y percusión. */
function instrumentsResult() {
  const steps = 128;
  const level = (fromStep: number) => Array.from({ length: steps }, (_, i) => (i >= fromStep ? 0.8 : 0));
  const intro = 18; // 4,5 s ≈ fin de la primera frase (beats 400..4400 ms)
  return {
    analyzerVersion: '0.1.1',
    durationMs: 32_000,
    stepMs: 250,
    tracks: {
      vocals: new Array(steps).fill(0.8),
      guitar: new Array(steps).fill(0.6),
      bass: level(intro),
      guira: level(intro),
      bongo: level(intro),
      tumba: level(intro),
      other: new Array(steps).fill(0),
    },
  };
}

class FakeAnalyzer {
  next: () => AnalyzerResultDto = () => analyzerResult();
  instrumentsCalls = 0;
  async analyze() {
    return this.next();
  }
  async instruments() {
    this.instrumentsCalls++;
    return instrumentsResult();
  }
  stemUploads: Record<string, string> = {};
  async stems(_audioUrl: string, uploads: Record<string, string>) {
    this.stemUploads = uploads;
  }
}

/** Cola simulada: procesa en línea (sin Redis), incluida la detección de instrumentos. */
class InlineQueue {
  constructor(private readonly analysis: StudioAnalysisService) {}
  async enqueue(id: string) {
    const recordingId = await this.analysis.process(id);
    if (recordingId) await this.analysis.processInstruments(recordingId);
  }
  async enqueueStems(id: string) {
    await this.analysis.processStems(id);
  }
}

describe('Estudio (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let storage: FakeStorage;
  let analyzer: FakeAnalyzer;
  const users: { id: string; token: string }[] = [];
  const tag = `e2e-${Date.now()}`;

  beforeAll(async () => {
    storage = new FakeStorage();
    analyzer = new FakeAnalyzer();
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [StudioController],
      providers: [
        PrismaService,
        JwtStrategy,
        StudioEnabledGuard,
        StudioService,
        StudioAnalysisService,
        { provide: STUDIO_CONFIG, useValue: config },
        { provide: AudioStorageService, useValue: storage },
        { provide: AnalyzerClient, useValue: analyzer },
        {
          provide: StudioQueue,
          useFactory: (a: StudioAnalysisService) => new InlineQueue(a),
          inject: [StudioAnalysisService],
        },
        {
          provide: TracksService,
          useValue: { findOne: async () => ({ id: 'track' }) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = moduleRef.get(PrismaService);
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    for (const name of ['owner', 'other']) {
      const u = await prisma.user.create({
        data: { email: `${name}-${tag}@test.local`, name, role: 'BAILARIN' },
      });
      users.push({ id: u.id, token: jwt.sign({ sub: u.id, email: u.email, role: u.role }) });
    }
  });

  afterAll(async () => {
    const ids = users.map((u) => u.id);
    const recs = await prisma.audioFile.findMany({
      where: { userId: { in: ids } },
      select: { recordingId: true },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } }); // cascada: audios, secciones, marcas
    await prisma.recordingAnalysis.deleteMany({
      where: { id: { in: recs.map((r) => r.recordingId).filter((x): x is string => !!x) } },
    });
    await app.close();
  });

  const [owner, other] = [0, 1].map((i) => () => users[i]);

  function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token: string, payload?: object) {
    return app.inject({
      method,
      url: `/api/v1/studio${url}`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function uploadAndAnalyze(token: string, name = 'bachata.mp3', style?: string): Promise<SongStudy> {
    const ticket = await call('POST', '/uploads', token, {
      fileName: name,
      mimeType: 'audio/mpeg',
      sizeBytes: 4 * MB,
      rightsAccepted: true,
      ...(style ? { style } : {}),
    });
    expect(ticket.statusCode).toBe(201);
    const { audioFileId, uploadUrl } = ticket.json<StudioUploadTicket>();
    storage.put(uploadUrl.replace('memory://upload/', ''), 4 * MB); // "sube" el navegador
    const done = await call('POST', `/audio-files/${audioFileId}/complete`, token);
    expect(done.statusCode).toBe(200);
    return (await call('GET', `/audio-files/${audioFileId}`, token)).json<SongStudy>();
  }

  it('rechaza sin token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/studio/audio-files' });
    expect(res.statusCode).toBe(401);
  });

  it('exige el checkbox de derechos, un formato válido y respeta el tamaño máximo', async () => {
    const base = { fileName: 'a.mp3', mimeType: 'audio/mpeg', sizeBytes: MB, rightsAccepted: true };
    const t = owner().token;
    expect((await call('POST', '/uploads', t, { ...base, rightsAccepted: false })).statusCode).toBe(400);
    expect((await call('POST', '/uploads', t, { ...base, mimeType: 'audio/ogg' })).statusCode).toBe(400);
    expect((await call('POST', '/uploads', t, { ...base, sizeBytes: 31 * MB })).statusCode).toBe(400);
  });

  it('no encola si el archivo no llegó al storage', async () => {
    const ticket = await call('POST', '/uploads', owner().token, {
      fileName: 'a.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: MB,
      rightsAccepted: true,
    });
    const { audioFileId } = ticket.json<StudioUploadTicket>();
    const res = await call('POST', `/audio-files/${audioFileId}/complete`, owner().token);
    expect(res.statusCode).toBe(400);
  });

  it('sube, analiza y arma la grilla de frases de 8', async () => {
    const study = await uploadAndAnalyze(owner().token);
    expect(study.status).toBe('READY');
    expect(study.bpm).toBe(120);
    expect(study.beatsMs).toHaveLength(64);
    expect(study.firstBeatOffsetMs).toBe(400);
    expect(study.phraseStartIndexes).toEqual([0, 8, 16, 24, 32, 40, 48, 56]);

    const list = await call('GET', '/audio-files', owner().token);
    expect(list.json<{ id: string }[]>().map((f) => f.id)).toContain(study.id);
  });

  it('bachata: detecta instrumentos y propone secciones automáticas', async () => {
    const study = await uploadAndAnalyze(owner().token);
    expect(study.style).toBe('BACHATA');
    expect(study.instrumentsStatus).toBe('DONE');
    expect(study.instruments?.tracks.vocals).toHaveLength(128);
    expect(study.sections.map((x) => [x.type, x.origin])).toEqual([
      ['INTRO', 'AUTOMATICO'],
      ['DERECHO', 'AUTOMATICO'],
    ]);
    expect(study.sections[1].startMs).toBe(4400);

    // La grabación ya tiene instrumentos: otro archivo igual no vuelve a separar.
    const calls = analyzer.instrumentsCalls;
    await uploadAndAnalyze(owner().token, 'otra-copia.mp3');
    expect(analyzer.instrumentsCalls).toBe(calls);
  });

  it('mezclador: separa en pistas a pedido, privadas del dueño, y se borran con el audio', async () => {
    const study = await uploadAndAnalyze(owner().token);
    expect(study.stemsStatus).toBeNull();
    expect((await call('GET', `/audio-files/${study.id}/stems`, owner().token)).statusCode).toBe(409);

    const req = await call('POST', `/audio-files/${study.id}/stems`, owner().token);
    expect(req.statusCode).toBe(200);
    expect(Object.keys(analyzer.stemUploads).sort()).toEqual(['bass', 'drums', 'guitar', 'other', 'vocals']);
    for (const url of Object.values(analyzer.stemUploads)) storage.put(url.replace('memory://upload/', ''), MB);

    const after = (await call('GET', `/audio-files/${study.id}`, owner().token)).json<SongStudy>();
    expect(after.stemsStatus).toBe('DONE');
    const urls = await call('GET', `/audio-files/${study.id}/stems`, owner().token);
    expect(urls.statusCode).toBe(200);
    expect(Object.keys(urls.json()).sort()).toEqual(['bass', 'drums', 'guitar', 'other', 'vocals']);

    // Otro usuario no ve ni pide las pistas.
    expect((await call('GET', `/audio-files/${study.id}/stems`, other().token)).statusCode).toBe(404);
    expect((await call('POST', `/audio-files/${study.id}/stems`, other().token)).statusCode).toBe(404);

    await call('DELETE', `/audio-files/${study.id}`, owner().token);
    for (const url of Object.values(analyzer.stemUploads)) {
      expect(storage.has(url.replace('memory://upload/', ''))).toBe(false);
    }
  });

  it('salsa: no usa los instrumentos de bachata y la lista filtra por estilo', async () => {
    const study = await uploadAndAnalyze(owner().token, 'salsa.mp3', 'SALSA');
    expect(study.style).toBe('SALSA');
    expect(study.instrumentsStatus).toBeNull();
    expect(study.instruments).toBeNull();
    expect(study.sections).toEqual([]);

    const salsa = (await call('GET', '/audio-files?style=SALSA', owner().token)).json<{ id: string }[]>();
    const bachata = (await call('GET', '/audio-files?style=BACHATA', owner().token)).json<{ id: string }[]>();
    expect(salsa.map((f) => f.id)).toEqual([study.id]);
    expect(bachata.map((f) => f.id)).not.toContain(study.id);
    expect((await call('GET', '/audio-files?style=TANGO', owner().token)).statusCode).toBe(400);
  });

  it('corrige el "1": se ajusta al beat más cercano y recalcula, y se puede volver al automático', async () => {
    const study = await uploadAndAnalyze(owner().token);
    const fixed = await call('PATCH', `/audio-files/${study.id}/first-beat`, owner().token, {
      timeMs: 1450, // cerca del beat 2 (1400)
    });
    expect(fixed.statusCode).toBe(200);
    const body = fixed.json<SongStudy>();
    expect(body.firstBeatOffsetMs).toBe(1400);
    expect(body.firstBeatCorrected).toBe(true);
    expect(body.phraseStartIndexes.slice(0, 3)).toEqual([2, 10, 18]);

    const reset = await call('PATCH', `/audio-files/${study.id}/first-beat`, owner().token, {
      timeMs: null,
    });
    expect(reset.json<SongStudy>().firstBeatOffsetMs).toBe(400);
  });

  it('un usuario no puede ver, reproducir, editar ni borrar audios de otro', async () => {
    const study = await uploadAndAnalyze(owner().token);
    const t = other().token;
    expect((await call('GET', `/audio-files/${study.id}`, t)).statusCode).toBe(404);
    expect((await call('GET', `/audio-files/${study.id}/url`, t)).statusCode).toBe(404);
    expect(
      (await call('PATCH', `/audio-files/${study.id}/first-beat`, t, { timeMs: 900 })).statusCode,
    ).toBe(404);
    expect((await call('POST', `/audio-files/${study.id}/reanalyze`, t)).statusCode).toBe(404);
    expect((await call('DELETE', `/audio-files/${study.id}`, t)).statusCode).toBe(404);
    const list = await call('GET', '/audio-files', t);
    expect(list.json<{ id: string }[]>().map((f) => f.id)).not.toContain(study.id);
    // Y sigue intacto para su dueño.
    expect((await call('GET', `/audio-files/${study.id}`, owner().token)).statusCode).toBe(200);
  });

  it('reutiliza el análisis entre usuarios con la misma grabación, sin compartir el audio', async () => {
    const mine = await uploadAndAnalyze(owner().token);
    const theirs = await uploadAndAnalyze(other().token, 'misma-cancion.mp3');
    const [a, b] = await Promise.all(
      [mine.id, theirs.id].map((id) => prisma.audioFile.findUniqueOrThrow({ where: { id } })),
    );
    expect(a.recordingId).toBeTruthy();
    expect(b.recordingId).toBe(a.recordingId);
    expect(b.storageKey).not.toBe(a.storageKey); // cada uno su archivo

    // Corregir el "1" es privado: no afecta al otro usuario.
    await call('PATCH', `/audio-files/${mine.id}/first-beat`, owner().token, { timeMs: 2400 });
    const otherView = await call('GET', `/audio-files/${theirs.id}`, other().token);
    expect(otherView.json<SongStudy>().firstBeatOffsetMs).toBe(400);
  });

  it('borra todo: audio en el storage, archivo y la grabación cuando queda sin archivos', async () => {
    const before = await prisma.recordingAnalysis.count();
    analyzer.next = () => analyzerResult({ fingerprint: fingerprint.map((v) => ~v >>> 0) }); // otra canción
    const study = await uploadAndAnalyze(owner().token, 'para-borrar.mp3');
    analyzer.next = () => analyzerResult();
    const file = await prisma.audioFile.findUniqueOrThrow({ where: { id: study.id } });
    expect(await prisma.recordingAnalysis.count()).toBe(before + 1);

    const res = await call('DELETE', `/audio-files/${study.id}`, owner().token);
    expect(res.statusCode).toBe(200);
    expect(storage.objects.has(file.storageKey)).toBe(false);
    expect(await prisma.audioFile.findUnique({ where: { id: study.id } })).toBeNull();
    expect(await prisma.recordingAnalysis.count()).toBe(before);
  });

  it('si el analizador rechaza el archivo, queda en ERROR con el motivo', async () => {
    analyzer.next = () => {
      throw new AnalyzerFileError('El archivo no es un audio válido (MP3, M4A, WAV o FLAC).');
    };
    const study = await uploadAndAnalyze(owner().token, 'roto.mp3');
    analyzer.next = () => analyzerResult();
    expect(study.status).toBe('ERROR');
    expect(study.error).toMatch(/no es un audio válido/);
  });
});
