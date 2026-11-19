import { placeData, type PlaceFields } from '../common/place';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  publicName,
  CHILE_REGIONS,
  COMMUNITY_PLACE_GALLERY_MAX,
  stylesFromPct,
  type ChileRegion,
  type DanceStyle,
  type CommunityPlaceDto,
  type CommunityPlaceKind,
  type CommunityPlacesByRegionResponse,
  type CommunityPlacesRegionSection,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { UploadedImage } from '../common/multipart';
import {
  CreateCommunityPlaceDto,
  QueryCommunityPlacesDto,
  UpdateCommunityPlaceDto,
} from './dto/community-place.dto';

/** Campos de las listas: todo menos la foto (base64, pesada). */
const SELECT = {
  id: true,
  kind: true,
  name: true,
  region: true,
  city: true,
  commune: true,
  lat: true,
  lng: true,
  bachataPct: true,
  place: true,
  address: true,
  schedule: true,
  styles: true,
  description: true,
  instagramHandles: true,
  photoMime: true,
  active: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true, displayName: true } },
  adminId: true,
  admin: { select: { name: true, displayName: true } },
  gallery: { select: { id: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.CommunityPlaceSelect;

type Row = Prisma.CommunityPlaceGetPayload<{ select: typeof SELECT }>;

const csv = (v: string) => v.split(',').filter(Boolean);
const normHandle = (h: string) => h.trim().replace(/^@/, '').toLowerCase();

@Injectable()
export class CommunityPlacesService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(r: Row): CommunityPlaceDto {
    return {
      id: r.id,
      kind: r.kind as CommunityPlaceKind,
      name: r.name,
      region: r.region as ChileRegion,
      city: r.city,
      commune: r.commune,
      lat: r.lat,
      lng: r.lng,
      bachataPct: r.bachataPct,
      place: r.place,
      address: r.address,
      schedule: r.schedule,
      styles: csv(r.styles) as DanceStyle[],
      description: r.description,
      instagramHandles: csv(r.instagramHandles),
      hasPhoto: Boolean(r.photoMime),
      galleryIds: r.gallery.map((g) => g.id),
      adminId: r.adminId,
      adminName: r.admin ? publicName(r.admin) : null,
      active: r.active,
      createdById: r.createdById,
      createdByName: publicName(r.createdBy),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  /** Lugares de un tipo agrupados por región (norte → sur); las 16 regiones siempre, con conteo. */
  async listByRegion(
    q: QueryCommunityPlacesDto,
  ): Promise<CommunityPlacesByRegionResponse> {
    const where: Prisma.CommunityPlaceWhereInput = { kind: q.kind };
    if (q.region) where.region = q.region;
    if (!q.includeInactive) where.active = true;
    const rows = await this.prisma.communityPlace.findMany({
      where,
      select: SELECT,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });

    const byRegion = new Map<string, Row[]>();
    for (const r of rows) {
      byRegion.set(r.region, [...(byRegion.get(r.region) ?? []), r]);
    }
    const sections: CommunityPlacesRegionSection[] = CHILE_REGIONS.filter(
      (r) => !q.region || r.code === q.region,
    ).map((r) => {
      const list = byRegion.get(r.code) ?? [];
      return {
        region: r.code,
        name: r.name,
        count: list.filter((s) => s.active).length,
        places: list.map((s) => this.toDto(s)),
      };
    });
    return { sections, total: rows.length };
  }

  async findOne(id: string): Promise<CommunityPlaceDto> {
    const r = await this.prisma.communityPlace.findUnique({ where: { id }, select: SELECT });
    if (!r) throw new NotFoundException('Lugar no encontrado.');
    return this.toDto(r);
  }

  async getPhoto(id: string): Promise<UploadedImage | null> {
    const r = await this.prisma.communityPlace.findUnique({
      where: { id },
      select: { photoData: true, photoMime: true },
    });
    if (!r?.photoData || !r.photoMime) return null;
    return { buffer: Buffer.from(r.photoData, 'base64'), mime: r.photoMime };
  }

  private toData(
    dto: UpdateCommunityPlaceDto,
    current?: PlaceFields | null,
  ): Prisma.CommunityPlaceUpdateInput {
    const data: Prisma.CommunityPlaceUpdateInput = {};
    const text = (v: string | null | undefined) => v?.trim() || null;
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.region !== undefined) data.region = dto.region;
    const place = placeData(dto, current);
    if (place) Object.assign(data, place);
    if (dto.lat !== undefined || dto.lng !== undefined) {
      const lat = dto.lat ?? null;
      const lng = dto.lng ?? null;
      if ((lat === null) !== (lng === null)) {
        throw new BadRequestException('El punto del mapa necesita latitud y longitud.');
      }
      data.lat = lat;
      data.lng = lng;
    }
    if (dto.place !== undefined) data.place = text(dto.place);
    if (dto.address !== undefined) data.address = text(dto.address);
    if (dto.schedule !== undefined) data.schedule = text(dto.schedule);
    if (dto.styles !== undefined) data.styles = dto.styles.join(',');
    if (dto.bachataPct !== undefined) {
      data.bachataPct = dto.bachataPct;
      // Los estilos salen del % (para filtros y avisos por estilo).
      if (dto.bachataPct !== null) data.styles = stylesFromPct(dto.bachataPct).join(',');
    }
    if (dto.description !== undefined) data.description = text(dto.description);
    if (dto.instagramHandles !== undefined) {
      data.instagramHandles = [
        ...new Set(dto.instagramHandles.map(normHandle).filter(Boolean)),
      ].join(',');
    }
    if (dto.active !== undefined) data.active = dto.active;
    return data;
  }

  async create(
    user: AuthUser,
    dto: CreateCommunityPlaceDto,
    photo?: UploadedImage | null,
  ): Promise<CommunityPlaceDto> {
    const data = this.toData(dto) as Prisma.CommunityPlaceUncheckedCreateInput;
    const r = await this.prisma.communityPlace.create({
      data: {
        ...data,
        kind: dto.kind,
        name: dto.name.trim(),
        region: dto.region,
        photoData: photo ? photo.buffer.toString('base64') : null,
        photoMime: photo ? photo.mime : null,
        createdById: user.id,
      },
      select: SELECT,
    });
    return this.toDto(r);
  }

  /** Solo quien lo agregó o un SUPER_ADMIN puede modificarlo/eliminarlo. */
  /** La foto y la galería: solo el SUPER_ADMIN o el administrador asignado. */
  private async assertImageEditor(user: AuthUser, id: string): Promise<void> {
    const r = await this.prisma.communityPlace.findUnique({
      where: { id },
      select: { adminId: true },
    });
    if (!r) throw new NotFoundException('Lugar no encontrado.');
    if (user.role !== 'SUPER_ADMIN' && r.adminId !== user.id) {
      throw new ForbiddenException('Solo el administrador de este lugar puede cambiar sus fotos.');
    }
  }

  /** Asigna (por correo) o quita (`null`) el administrador. Solo SUPER_ADMIN (lo exige el controller). */
  async setAdmin(id: string, email: string | null): Promise<CommunityPlaceDto> {
    let adminId: string | null = null;
    if (email?.trim()) {
      const u = await this.prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true },
      });
      if (!u) {
        throw new NotFoundException(
          'No hay ninguna cuenta con ese correo. La persona debe entrar primero a Nectason.',
        );
      }
      adminId = u.id;
    }
    const exists = await this.prisma.communityPlace.count({ where: { id } });
    if (!exists) throw new NotFoundException('Lugar no encontrado.');
    await this.prisma.communityPlace.update({ where: { id }, data: { adminId } });
    return this.findOne(id);
  }

  private async assertOwner(user: AuthUser, id: string): Promise<void> {
    const r = await this.prisma.communityPlace.findUnique({
      where: { id },
      select: { createdById: true },
    });
    if (!r) throw new NotFoundException('Lugar no encontrado.');
    if (r.createdById !== user.id && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo quien agregó este lugar puede editarlo.');
    }
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateCommunityPlaceDto,
  ): Promise<CommunityPlaceDto> {
    await this.assertOwner(user, id);
    const current = await this.prisma.communityPlace.findUnique({
      where: { id },
      select: { region: true, city: true, commune: true },
    });
    const r = await this.prisma.communityPlace.update({
      where: { id },
      data: this.toData(dto, current),
      select: SELECT,
    });
    return this.toDto(r);
  }

  async setPhoto(
    user: AuthUser,
    id: string,
    photo: UploadedImage | null,
  ): Promise<CommunityPlaceDto> {
    await this.assertImageEditor(user, id);
    const r = await this.prisma.communityPlace.update({
      where: { id },
      data: {
        photoData: photo ? photo.buffer.toString('base64') : null,
        photoMime: photo ? photo.mime : null,
      },
      select: SELECT,
    });
    return this.toDto(r);
  }

  // --- galería (hasta COMMUNITY_PLACE_GALLERY_MAX fotos) --------------------------

  async addGalleryPhoto(
    user: AuthUser,
    id: string,
    photo: UploadedImage,
  ): Promise<CommunityPlaceDto> {
    await this.assertImageEditor(user, id);
    const count = await this.prisma.communityPlacePhoto.count({ where: { placeId: id } });
    if (count >= COMMUNITY_PLACE_GALLERY_MAX) {
      throw new BadRequestException(
        `La galería admite hasta ${COMMUNITY_PLACE_GALLERY_MAX} fotos. Quita alguna para agregar otra.`,
      );
    }
    const last = await this.prisma.communityPlacePhoto.findFirst({
      where: { placeId: id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    await this.prisma.communityPlacePhoto.create({
      data: {
        placeId: id,
        data: photo.buffer.toString('base64'),
        mime: photo.mime,
        position: (last?.position ?? -1) + 1,
      },
    });
    return this.findOne(id);
  }

  async removeGalleryPhoto(
    user: AuthUser,
    id: string,
    photoId: string,
  ): Promise<CommunityPlaceDto> {
    await this.assertImageEditor(user, id);
    const { count } = await this.prisma.communityPlacePhoto.deleteMany({
      where: { id: photoId, placeId: id },
    });
    if (count === 0) throw new NotFoundException('Esa foto no está en la galería.');
    return this.findOne(id);
  }

  async getGalleryPhoto(id: string, photoId: string): Promise<UploadedImage | null> {
    const p = await this.prisma.communityPlacePhoto.findFirst({
      where: { id: photoId, placeId: id },
      select: { data: true, mime: true },
    });
    return p ? { buffer: Buffer.from(p.data, 'base64'), mime: p.mime } : null;
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.assertOwner(user, id);
    await this.prisma.communityPlace.delete({ where: { id } });
  }
}
