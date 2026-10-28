import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CHILE_REGIONS,
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
  createdBy: { select: { name: true } },
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
      place: r.place,
      address: r.address,
      schedule: r.schedule,
      styles: csv(r.styles) as DanceStyle[],
      description: r.description,
      instagramHandles: csv(r.instagramHandles),
      hasPhoto: Boolean(r.photoMime),
      active: r.active,
      createdById: r.createdById,
      createdByName: r.createdBy.name,
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

  private toData(dto: UpdateCommunityPlaceDto): Prisma.CommunityPlaceUpdateInput {
    const data: Prisma.CommunityPlaceUpdateInput = {};
    const text = (v: string | null | undefined) => v?.trim() || null;
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.region !== undefined) data.region = dto.region;
    if (dto.city !== undefined) data.city = text(dto.city);
    if (dto.place !== undefined) data.place = text(dto.place);
    if (dto.address !== undefined) data.address = text(dto.address);
    if (dto.schedule !== undefined) data.schedule = text(dto.schedule);
    if (dto.styles !== undefined) data.styles = dto.styles.join(',');
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
    const r = await this.prisma.communityPlace.update({
      where: { id },
      data: this.toData(dto),
      select: SELECT,
    });
    return this.toDto(r);
  }

  async setPhoto(
    user: AuthUser,
    id: string,
    photo: UploadedImage | null,
  ): Promise<CommunityPlaceDto> {
    await this.assertOwner(user, id);
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

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.assertOwner(user, id);
    await this.prisma.communityPlace.delete({ where: { id } });
  }
}
