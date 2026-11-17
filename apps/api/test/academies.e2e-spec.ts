/**
 * E2E de Academias contra el Postgres local (docker compose up -d db), con el
 * storage de media reemplazado por un doble en memoria.
 * Correr: pnpm --filter @baile-latino/api test:e2e
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyMultipart from '@fastify/multipart';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type {
  AcademyDto,
  AcademyShareLinkDto,
  AcademyVideoDto,
  AcademyVideoUploadTicket,
  SharedClassDto,
  UserRole,
} from '@baile-latino/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { AcademiesController } from '../src/academies/academies.controller';
import { AcademiesService } from '../src/academies/academies.service';
import { AcademyVideosService } from '../src/academies/academy-videos.service';
import { AcademyShareService } from '../src/academies/academy-share.service';
import { ShareController } from '../src/academies/share.controller';
import { MediaStorageService } from '../src/academies/media-storage.service';

process.env.JWT_SECRET = 'e2e-secret';

const MB = 1024 * 1024;

class FakeMedia {
  enabled = true;
  objects = new Map<string, number>();
  assertEnabled() {}
  async uploadUrl(key: string) {
    return `memory://upload/${key}`;
  }
  async viewUrl(key: string) {
    return `memory://view/${key}`;
  }
  /** Clase de almacenamiento de cada objeto (STANDARD_IA = bóveda). */
  classes = new Map<string, string>();
  async downloadUrl(key: string, fileName: string) {
    return `memory://download/${key}?name=${encodeURIComponent(fileName)}`;
  }
  async copy(from: string, to: string, storageClass: string) {
    const size = this.objects.get(from);
    if (size === undefined) throw new Error(`no existe ${from}`);
    this.objects.set(to, size);
    this.classes.set(to, storageClass);
  }
  async size(key: string) {
    return this.objects.get(key) ?? null;
  }
  async remove(key: string) {
    this.objects.delete(key);
  }
  /** Simula el PUT del navegador. */
  put(uploadUrl: string, bytes: number) {
    this.objects.set(uploadUrl.replace('memory://upload/', ''), bytes);
  }
  has(key: string) {
    return this.objects.has(key);
  }
}

describe('Academias (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const media = new FakeMedia();
  const tag = randomUUID().slice(0, 8);
  const users: Record<string, { id: string; email: string; token: string }> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [AcademiesController, ShareController],
      providers: [
        PrismaService,
        JwtStrategy,
        RolesGuard,
        AcademiesService,
        AcademyVideosService,
        AcademyShareService,
        { provide: MediaStorageService, useValue: media },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyMultipart as never);
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
    const roles: Record<string, UserRole> = { owner: 'PROFESOR', teacher: 'BAILARIN', viewer: 'BAILARIN' };
    for (const [name, role] of Object.entries(roles)) {
      const email = `${name}-${tag}@test.local`;
      const u = await prisma.user.create({ data: { email, name, role } });
      users[name] = { id: u.id, email, token: jwt.sign({ sub: u.id, email, role }) };
    }
  });

  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id);
    await prisma.academy.deleteMany({ where: { members: { some: { userId: { in: ids } } } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, who: string, payload?: object) {
    return app.inject({
      method,
      url: `/api/v1/academies${url}`,
      headers: { authorization: `Bearer ${users[who].token}` },
      payload,
    });
  }

  async function createAcademy(name = 'Academia Clave'): Promise<AcademyDto> {
    const boundary = 'x-boundary';
    const data = JSON.stringify({ name, region: 'VALPARAISO', city: 'Viña del Mar', styles: ['BACHATA'], instagramHandle: '@Clave.Vina' });
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${data}\r\n--${boundary}--\r\n`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/academies',
      headers: {
        authorization: `Bearer ${users.owner.token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    return res.json<AcademyDto>();
  }

  async function uploadVideo(academyId: string, extra: object = {}): Promise<AcademyVideoDto> {
    const t = await call('POST', `/${academyId}/videos`, 'owner', {
      title: 'Clase 1: paso básico',
      mimeType: 'video/mp4',
      sizeBytes: 50 * MB,
      ...extra,
    });
    expect(t.statusCode).toBe(201);
    const ticket = t.json<AcademyVideoUploadTicket>();
    media.put(ticket.uploadUrl, 50 * MB);
    media.put(ticket.thumbUploadUrl, 20_000);
    const done = await call('POST', `/${academyId}/videos/${ticket.videoId}/complete`, 'owner', { durationMs: 90_000 });
    expect(done.statusCode).toBe(200);
    return done.json<AcademyVideoDto>();
  }

  it('crea una academia (dueño) y la ve cualquier usuario con cuenta, sin datos privados', async () => {
    const a = await createAcademy();
    expect(a.myRole).toBe('OWNER');
    expect(a.instagramHandle).toBe('clave.vina');
    expect(a.members).toHaveLength(1);
    expect(a.storage).toEqual({ usedBytes: 0, quotaBytes: 51200 * MB, vaultUsedBytes: 0, vaultQuotaBytes: 204800 * MB });

    const seen = (await call('GET', `/${a.id}`, 'viewer')).json<AcademyDto>();
    expect(seen.myRole).toBeNull();
    expect(seen.members).toEqual([]);
    expect(seen.storage).toBeNull();

    const list = (await call('GET', '?region=VALPARAISO', 'viewer')).json<{ id: string }[]>();
    expect(list.map((x) => x.id)).toContain(a.id);
    expect((await call('GET', '/mine', 'owner')).json<{ id: string }[]>().map((x) => x.id)).toContain(a.id);
  });

  it('solo PROFESOR (o PILOTO/SUPER_ADMIN) crea academias; solo quien administra edita', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/academies',
      headers: { authorization: `Bearer ${users.viewer.token}`, 'content-type': 'multipart/form-data; boundary=b' },
      payload: '--b\r\nContent-Disposition: form-data; name="data"\r\n\r\n{"name":"X","region":"VALPARAISO"}\r\n--b--\r\n',
    });
    expect(res.statusCode).toBe(403);

    const a = await createAcademy('Otra');
    expect((await call('PATCH', `/${a.id}`, 'viewer', { name: 'Hackeada' })).statusCode).toBe(403);
    expect((await call('PATCH', `/${a.id}`, 'owner', { description: 'Clases de bachata' })).json<AcademyDto>().description).toBe(
      'Clases de bachata',
    );
  });

  it('profesores: el dueño los agrega por correo y pueden administrar, pero no quitar a otros', async () => {
    const a = await createAcademy('Con profes');
    expect((await call('POST', `/${a.id}/members`, 'owner', { email: 'nadie@test.local' })).statusCode).toBe(404);
    const added = await call('POST', `/${a.id}/members`, 'owner', { email: users.teacher.email });
    expect(added.json<AcademyDto>().members.map((m) => m.role)).toEqual(['OWNER', 'TEACHER']);
    expect((await call('POST', `/${a.id}/members`, 'owner', { email: users.teacher.email })).statusCode).toBe(409);

    // El profesor crea una clase, pero no gestiona profesores.
    const c = await call('POST', `/${a.id}/classes`, 'teacher', { title: 'Bachata básico', weekday: 2, startTime: '20:00' });
    expect(c.statusCode).toBe(201);
    expect((await call('DELETE', `/${a.id}/members/${users.owner.id}`, 'teacher')).statusCode).toBe(403);
    expect((await call('DELETE', `/${a.id}/members/${users.owner.id}`, 'owner')).statusCode).toBe(400);
    expect((await call('DELETE', `/${a.id}/members/${users.teacher.id}`, 'owner')).statusCode).toBe(200);
    expect((await call('POST', `/${a.id}/classes`, 'teacher', { title: 'Otra clase', weekday: 1, startTime: '19:00' })).statusCode).toBe(403);
  });

  it('clases: horario ordenado, validación y las inactivas solo las ve quien administra', async () => {
    const a = await createAcademy('Horario');
    expect((await call('POST', `/${a.id}/classes`, 'owner', { title: 'Mal', weekday: 7, startTime: '25:00' })).statusCode).toBe(400);
    await call('POST', `/${a.id}/classes`, 'owner', { title: 'Jueves', weekday: 4, startTime: '21:00', level: 'AVANZADO' });
    await call('POST', `/${a.id}/classes`, 'owner', { title: 'Martes tarde', weekday: 2, startTime: '20:00' });
    const early = (
      await call('POST', `/${a.id}/classes`, 'owner', { title: 'Martes temprano', weekday: 2, startTime: '19:00', active: false })
    ).json<{ id: string }>();

    const own = (await call('GET', `/${a.id}`, 'owner')).json<AcademyDto>();
    expect(own.classes.map((c) => c.title)).toEqual(['Martes temprano', 'Martes tarde', 'Jueves']);
    const seen = (await call('GET', `/${a.id}`, 'viewer')).json<AcademyDto>();
    expect(seen.classes.map((c) => c.title)).toEqual(['Martes tarde', 'Jueves']);
    expect(seen.classCount).toBe(2);

    expect((await call('PATCH', `/${a.id}/classes/${early.id}`, 'owner', { active: true })).json<{ active: boolean }>().active).toBe(true);
  });

  it('videos: sube directo al storage, cuenta en el cupo, lo ve cualquiera y se borra del storage', async () => {
    const a = await createAcademy('Videos');
    const cls = (await call('POST', `/${a.id}/classes`, 'owner', { title: 'Salsa On1', weekday: 3, startTime: '20:00' })).json<{ id: string }>();
    const v = await uploadVideo(a.id, { classId: cls.id, recordedOn: '2026-11-12', style: 'SALSA' });
    expect(v.classTitle).toBe('Salsa On1');
    expect(v.recordedOn).toBe('2026-11-12');
    expect(v.durationMs).toBe(90_000);
    expect(v.thumbUrl).toMatch(/^memory:\/\/view\/academies\/.+\.jpg$/);

    // Cualquier usuario con cuenta lo lista y lo reproduce.
    const list = (await call('GET', `/${a.id}/videos?classId=${cls.id}`, 'viewer')).json<AcademyVideoDto[]>();
    expect(list.map((x) => x.id)).toEqual([v.id]);
    const url = await call('GET', `/${a.id}/videos/${v.id}/url`, 'viewer');
    expect(url.json<{ url: string }>().url).toMatch(/^memory:\/\/view\/academies\/.+\.mp4$/);
    // Pero no lo sube, edita ni borra.
    expect((await call('POST', `/${a.id}/videos`, 'viewer', { title: 'Mi video', mimeType: 'video/mp4', sizeBytes: MB })).statusCode).toBe(403);
    expect((await call('DELETE', `/${a.id}/videos/${v.id}`, 'viewer')).statusCode).toBe(403);

    expect((await call('GET', `/${a.id}`, 'owner')).json<AcademyDto>().storage?.usedBytes).toBe(50 * MB);

    // Formato y tamaño.
    expect((await call('POST', `/${a.id}/videos`, 'owner', { title: 'X', mimeType: 'video/avi', sizeBytes: MB })).statusCode).toBe(400);
    expect(
      (await call('POST', `/${a.id}/videos`, 'owner', { title: 'X', mimeType: 'video/mp4', sizeBytes: 4 * 1024 * MB })).statusCode,
    ).toBe(400);
    // Hasta 3 GB por video.
    expect(
      (await call('POST', `/${a.id}/videos`, 'owner', { title: 'Clase completa', mimeType: 'video/mp4', sizeBytes: 2.5 * 1024 * MB })).statusCode,
    ).toBe(201);

    // Borrar la clase deja el video como contenido general.
    await call('DELETE', `/${a.id}/classes/${cls.id}`, 'owner');
    expect((await call('GET', `/${a.id}/videos`, 'viewer')).json<AcademyVideoDto[]>()[0].classId).toBeNull();

    const keys = [...media.objects.keys()].filter((k) => k.includes(a.id));
    expect(keys).toHaveLength(2);
    expect((await call('DELETE', `/${a.id}/videos/${v.id}`, 'owner')).statusCode).toBe(204);
    for (const k of keys) expect(media.has(k)).toBe(false);
  });

  it('videos: respeta el cupo y no confirma si el archivo no llegó o es más grande', async () => {
    const a = await createAcademy('Cupo');
    await prisma.academy.update({ where: { id: a.id }, data: { storageQuotaMb: 100 } });
    const big = await call('POST', `/${a.id}/videos`, 'owner', { title: 'Grande', mimeType: 'video/mp4', sizeBytes: 101 * MB });
    expect(big.statusCode).toBe(409);
    expect(big.json<{ message: string }>().message).toContain('No queda espacio');

    const t = (await call('POST', `/${a.id}/videos`, 'owner', { title: 'Ok', mimeType: 'video/mp4', sizeBytes: 10 * MB })).json<AcademyVideoUploadTicket>();
    expect((await call('POST', `/${a.id}/videos/${t.videoId}/complete`, 'owner', {})).statusCode).toBe(400);
    // Mientras sube, no aparece en la lista.
    expect((await call('GET', `/${a.id}/videos`, 'viewer')).json<unknown[]>()).toEqual([]);

    media.put(t.uploadUrl, 20 * MB); // subió más de lo declarado
    expect((await call('POST', `/${a.id}/videos/${t.videoId}/complete`, 'owner', {})).statusCode).toBe(400);
    expect(media.has(t.uploadUrl.replace('memory://upload/', ''))).toBe(false);

    // Sin miniatura: queda sin thumbUrl.
    const t2 = (await call('POST', `/${a.id}/videos`, 'owner', { title: 'Sin mini', mimeType: 'video/quicktime', sizeBytes: 10 * MB })).json<AcademyVideoUploadTicket>();
    media.put(t2.uploadUrl, 10 * MB);
    const done = (await call('POST', `/${a.id}/videos/${t2.videoId}/complete`, 'owner', {})).json<AcademyVideoDto>();
    expect(done.thumbUrl).toBeNull();
  });

  it('reportes: cualquier usuario reporta; el SUPER_ADMIN los ve y los marca revisados', async () => {
    const a = await createAcademy('Reportes');
    const v = await uploadVideo(a.id);
    expect((await call('POST', `/${a.id}/videos/${v.id}/report`, 'viewer', { reason: 'no' })).statusCode).toBe(400);
    expect(
      (await call('POST', `/${a.id}/videos/${v.id}/report`, 'viewer', { reason: 'Aparezco sin haber dado permiso.' })).statusCode,
    ).toBe(204);
    expect((await call('GET', '/reports', 'viewer')).statusCode).toBe(403);

    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const admin = jwt.sign({ sub: users.viewer.id, email: users.viewer.email, role: 'SUPER_ADMIN' });
    const get = (url: string, method: 'GET' | 'POST' = 'GET') =>
      app.inject({ method, url: `/api/v1/academies${url}`, headers: { authorization: `Bearer ${admin}` } });
    const reports = (await get('/reports')).json<{ id: string; videoId: string }[]>().filter((r) => r.videoId === v.id);
    expect(reports).toHaveLength(1);
    expect((await get(`/reports/${reports[0].id}/resolve`, 'POST')).statusCode).toBe(204);
    expect((await get('/reports')).json<{ videoId: string }[]>().some((r) => r.videoId === v.id)).toBe(false);
  });

  it('borrar la academia borra sus videos del storage; solo el dueño puede', async () => {
    const a = await createAcademy('Para borrar');
    await uploadVideo(a.id);
    const keys = [...media.objects.keys()].filter((k) => k.includes(a.id));
    expect(keys.length).toBeGreaterThan(0);
    await call('POST', `/${a.id}/members`, 'owner', { email: users.teacher.email });
    expect((await call('DELETE', `/${a.id}`, 'teacher')).statusCode).toBe(403);
    expect((await call('DELETE', `/${a.id}`, 'owner')).statusCode).toBe(204);
    for (const k of keys) expect(media.has(k)).toBe(false);
    expect((await call('GET', `/${a.id}`, 'viewer')).statusCode).toBe(404);
  });
  it('fotos: se suben como los videos, con su tipo, y tienen su propio límite de tamaño', async () => {
    const a = await createAcademy('Fotos');
    const big = await call('POST', `/${a.id}/videos`, 'owner', { title: 'Foto enorme', mimeType: 'image/jpeg', sizeBytes: 26 * MB });
    expect(big.statusCode).toBe(400);
    const t = (
      await call('POST', `/${a.id}/videos`, 'owner', { title: 'Grupo del jueves', mimeType: 'image/jpeg', sizeBytes: 3 * MB })
    ).json<AcademyVideoUploadTicket>();
    expect(t.uploadUrl).toMatch(/\/photos\/.+\.jpg$/);
    media.put(t.uploadUrl, 3 * MB);
    media.put(t.thumbUploadUrl, 30_000);
    const photo = (await call('POST', `/${a.id}/videos/${t.videoId}/complete`, 'owner', {})).json<AcademyVideoDto>();
    expect(photo.kind).toBe('PHOTO');
    const video = await uploadVideo(a.id);
    expect(video.kind).toBe('VIDEO');
    const list = (await call('GET', `/${a.id}/videos`, 'viewer')).json<AcademyVideoDto[]>();
    expect(list.map((x) => x.kind).sort()).toEqual(['PHOTO', 'VIDEO']);
    expect((await call('GET', `/${a.id}/videos/${photo.id}/url`, 'viewer')).json<{ url: string }>().url).toMatch(/\.jpg$/);
  });
  it('duplicados: avisa cuáles ya están y rechaza subir el mismo archivo otra vez', async () => {
    const a = await createAcademy('Duplicados');
    const h1 = 'a'.repeat(64);
    const h2 = 'b'.repeat(64);
    const t = (
      await call('POST', `/${a.id}/videos`, 'owner', { title: 'Original', mimeType: 'video/mp4', sizeBytes: 5 * MB, contentHash: h1 })
    ).json<AcademyVideoUploadTicket>();

    // A medias no cuenta: se puede reintentar.
    expect((await call('POST', `/${a.id}/videos/duplicates`, 'owner', { hashes: [h1] })).json()).toEqual([]);

    media.put(t.uploadUrl, 5 * MB);
    await call('POST', `/${a.id}/videos/${t.videoId}/complete`, 'owner', {});
    const dups = await call('POST', `/${a.id}/videos/duplicates`, 'owner', { hashes: [h1, h2] });
    expect(dups.statusCode).toBe(200);
    expect(dups.json()).toEqual([{ hash: h1, videoId: t.videoId, title: 'Original', location: 'GALLERY' }]);

    const again = await call('POST', `/${a.id}/videos`, 'owner', { title: 'Copia', mimeType: 'video/mp4', sizeBytes: 5 * MB, contentHash: h1 });
    expect(again.statusCode).toBe(409);
    expect(again.json<{ message: string }>().message).toMatch(/^Ya está en la galería: "Original"/);
    // Otro archivo sí pasa; huellas inválidas o de quien no administra, no.
    expect((await call('POST', `/${a.id}/videos`, 'owner', { title: 'Otro', mimeType: 'video/mp4', sizeBytes: MB, contentHash: h2 })).statusCode).toBe(201);
    expect((await call('POST', `/${a.id}/videos/duplicates`, 'owner', { hashes: ['xyz'] })).statusCode).toBe(400);
    expect((await call('POST', `/${a.id}/videos/duplicates`, 'viewer', { hashes: [h1] })).statusCode).toBe(403);
  });
  it('bóveda: libera la galería, no se reproduce, solo se descarga y se puede devolver', async () => {
    const a = await createAcademy('Bóveda');
    const v = await uploadVideo(a.id); // 50 MB, título "Clase 1: paso básico"
    const before = (await call('GET', `/${a.id}`, 'owner')).json<AcademyDto>();
    expect(before.storage).toMatchObject({ usedBytes: 50 * MB, vaultUsedBytes: 0, vaultQuotaBytes: 204800 * MB });

    // Solo quien administra mueve y ve la bóveda.
    expect((await call('POST', `/${a.id}/vault`, 'viewer', { videoIds: [v.id] })).statusCode).toBe(403);
    expect((await call('GET', `/${a.id}/vault`, 'viewer')).statusCode).toBe(403);

    const moved = await call('POST', `/${a.id}/vault`, 'owner', { videoIds: [v.id] });
    expect(moved.json()).toEqual({ moved: 1 });
    const after = (await call('GET', `/${a.id}`, 'owner')).json<AcademyDto>();
    expect(after.storage).toMatchObject({ usedBytes: 0, vaultUsedBytes: 50 * MB });
    expect(after.videoCount).toBe(0);

    // Sale de la galería, queda en la bóveda con la clase barata y el archivo viejo se borra.
    expect((await call('GET', `/${a.id}/videos`, 'viewer')).json<unknown[]>()).toEqual([]);
    const vault = (await call('GET', `/${a.id}/vault`, 'owner')).json<AcademyVideoDto[]>();
    expect(vault.map((x) => [x.id, x.location])).toEqual([[v.id, 'VAULT']]);
    expect(vault[0].vaultedAt).not.toBeNull();
    const vaultKeys = [...media.classes.entries()].filter(([k]) => k.includes(`academies/${a.id}/vault/`));
    expect(vaultKeys.map(([, c]) => c)).toEqual(['STANDARD_IA']);
    expect([...media.objects.keys()].some((k) => k.includes(`academies/${a.id}/videos/`) && k.endsWith('.mp4'))).toBe(false);

    // No se reproduce: para quien administra avisa; para el resto no existe.
    expect((await call('GET', `/${a.id}/videos/${v.id}/url`, 'owner')).statusCode).toBe(409);
    expect((await call('GET', `/${a.id}/videos/${v.id}/url`, 'viewer')).statusCode).toBe(404);
    // Se descarga con su nombre y extensión.
    const dl = await call('GET', `/${a.id}/videos/${v.id}/download`, 'owner');
    expect(dl.json<{ url: string }>().url).toContain(`name=${encodeURIComponent('Clase 1: paso básico.mp4')}`);
    expect((await call('GET', `/${a.id}/videos/${v.id}/download`, 'viewer')).statusCode).toBe(403);

    // Un archivo idéntico avisa que está en la bóveda.
    const hashA = 'c'.repeat(64);
    await prisma.academyVideo.update({ where: { id: v.id }, data: { contentHash: hashA } });
    const dup = await call('POST', `/${a.id}/videos`, 'owner', { title: 'Copia', mimeType: 'video/mp4', sizeBytes: MB, contentHash: hashA });
    expect(dup.json<{ message: string }>().message).toContain('(en la bóveda)');

    // Cupo de la bóveda.
    await prisma.academy.update({ where: { id: a.id }, data: { vaultQuotaMb: 10 } });
    const other = await uploadVideo(a.id);
    const full = await call('POST', `/${a.id}/vault`, 'owner', { videoIds: [other.id] });
    expect(full.statusCode).toBe(409);
    expect(full.json<{ message: string }>().message).toContain('No hay espacio en la bóveda');

    // Volver a la galería: se ve y se reproduce otra vez, en almacenamiento normal.
    expect((await call('POST', `/${a.id}/vault/restore`, 'owner', { videoIds: [v.id] })).json()).toEqual({ moved: 1 });
    const back = (await call('GET', `/${a.id}/videos`, 'viewer')).json<AcademyVideoDto[]>();
    expect(back.find((x) => x.id === v.id)?.location).toBe('GALLERY');
    expect((await call('GET', `/${a.id}/videos/${v.id}/url`, 'viewer')).statusCode).toBe(200);
    const restored = [...media.classes.entries()].find(([k]) => k.includes(`academies/${a.id}/videos/`));
    expect(restored?.[1]).toBe('STANDARD');
  });
  it('miniatura: quien administra la reemplaza por un cuadro elegido y se borra la anterior', async () => {
    const a = await createAcademy('Miniaturas');
    const v = await uploadVideo(a.id);
    const oldThumb = v.thumbUrl!.replace('memory://view/', '');
    expect(media.has(oldThumb)).toBe(true);

    expect((await call('POST', `/${a.id}/videos/${v.id}/thumb`, 'viewer')).statusCode).toBe(403);
    const t = (await call('POST', `/${a.id}/videos/${v.id}/thumb`, 'owner')).json<{ uploadUrl: string }>();
    // Sin subir todavía: no confirma.
    expect((await call('POST', `/${a.id}/videos/${v.id}/thumb/complete`, 'owner')).statusCode).toBe(400);

    media.put(t.uploadUrl, 40_000);
    const done = await call('POST', `/${a.id}/videos/${v.id}/thumb/complete`, 'owner');
    expect(done.statusCode).toBe(200);
    const newThumb = done.json<AcademyVideoDto>().thumbUrl!.replace('memory://view/', '');
    expect(newThumb).toMatch(new RegExp(`^academies/${a.id}/thumbs/${v.id}-.+\\.jpg$`));
    expect(media.has(oldThumb)).toBe(false);
    expect(media.has(newThumb)).toBe(true);

    await call('DELETE', `/${a.id}/videos/${v.id}`, 'owner');
    expect(media.has(newThumb)).toBe(false);
  });
  it('link compartido: solo los videos de esa clase, sin sesión, para ver y descargar; se puede desactivar', async () => {
    const a = await createAcademy('Compartir');
    const lunes = (await call('POST', `/${a.id}/classes`, 'owner', { title: 'Bachata lunes', weekday: 1, startTime: '20:00' })).json<{ id: string }>();
    const martes = (await call('POST', `/${a.id}/classes`, 'owner', { title: 'Salsa martes', weekday: 2, startTime: '21:00' })).json<{ id: string }>();
    const v1 = await uploadVideo(a.id, { classId: lunes.id, title: 'Figura 1' });
    const v2 = await uploadVideo(a.id, { classId: lunes.id, title: 'Figura 2' });
    const otra = await uploadVideo(a.id, { classId: martes.id });
    // Uno del lunes va a la bóveda: no se comparte.
    await call('POST', `/${a.id}/vault`, 'owner', { videoIds: [v2.id] });

    // Solo quien administra crea y ve el link.
    expect((await call('POST', `/${a.id}/classes/${lunes.id}/share`, 'viewer')).statusCode).toBe(403);
    expect((await call('GET', `/${a.id}/classes/${lunes.id}/share`, 'owner')).body).toBe('null');
    const link = (await call('POST', `/${a.id}/classes/${lunes.id}/share`, 'owner')).json<AcademyShareLinkDto>();
    expect(link.access).toBe('PUBLIC');
    expect(link.token.length).toBeGreaterThanOrEqual(20);

    // Sin sesión.
    const open = (url: string) => app.inject({ method: 'GET', url: `/api/v1/share/${url}` });
    const shared = await open(link.token);
    expect(shared.statusCode).toBe(200);
    const body = shared.json<SharedClassDto>();
    expect(body.academy.name).toBe('Compartir');
    expect(body.class).toMatchObject({ title: 'Bachata lunes', weekday: 1, startTime: '20:00' });
    expect(body.items.map((x) => x.id)).toEqual([v1.id]);
    expect((await open(`${link.token}/media/${v1.id}/url`)).json<{ url: string }>().url).toMatch(/^memory:\/\/view\//);
    expect((await open(`${link.token}/media/${v1.id}/download`)).json<{ url: string }>().url).toContain(
      `name=${encodeURIComponent('Figura 1.mp4')}`,
    );
    // Ni de otra clase ni de la bóveda.
    expect((await open(`${link.token}/media/${otra.id}/url`)).statusCode).toBe(404);
    expect((await open(`${link.token}/media/${v2.id}/download`)).statusCode).toBe(404);
    expect((await open('no-existe')).statusCode).toBe(404);

    // Un link nuevo desactiva el anterior; desactivar lo corta.
    const again = (await call('POST', `/${a.id}/classes/${lunes.id}/share`, 'owner')).json<AcademyShareLinkDto>();
    expect(again.token).not.toBe(link.token);
    expect((await open(link.token)).statusCode).toBe(404);
    expect((await open(again.token)).statusCode).toBe(200);
    expect((await call('DELETE', `/${a.id}/classes/${lunes.id}/share`, 'owner')).statusCode).toBe(204);
    expect((await open(again.token)).statusCode).toBe(404);
  });
});
