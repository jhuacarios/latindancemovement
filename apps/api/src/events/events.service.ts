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
  type EventDto,
  type EventStatus,
  type EventsByRegionResponse,
  type EventsRegionSection,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import type { UploadedImage } from '../common/multipart';

/**
 * Un evento sin `endsAt` se considera "en curso" hasta 6 h después de empezar:
 * así un social que partió a las 22:00 sigue en "próximos" durante la noche.
 */
const DEFAULT_DURATION_MS = 6 * 60 * 60 * 1000;

/** Campos que devuelven las listas: todo menos el flyer (base64, pesado). */
const EVENT_SELECT = {
  id: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  region: true,
  city: true,
  venueName: true,
  address: true,
  styles: true,
  bachataPct: true,
  priceInfo: true,
  ticketUrl: true,
  instagramUrl: true,
  organizerName: true,
  organizerInstagram: true,
  status: true,
  flyerMime: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.EventSelect;

type EventRow = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;


function endOf(e: { startsAt: Date; endsAt: Date | null }): number {
  return e.endsAt
    ? e.endsAt.getTime()
    : e.startsAt.getTime() + DEFAULT_DURATION_MS;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(e: EventRow): EventDto {
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt ? e.endsAt.toISOString() : null,
      region: e.region as ChileRegion,
      city: e.city,
      venueName: e.venueName,
      address: e.address,
      styles: e.styles
        ? (e.styles.split(',').filter(Boolean) as DanceStyle[])
        : [],
      bachataPct: e.bachataPct,
      priceInfo: e.priceInfo,
      ticketUrl: e.ticketUrl,
      instagramUrl: e.instagramUrl,
      organizerName: e.organizerName,
      organizerInstagram: e.organizerInstagram,
      status: e.status as EventStatus,
      hasFlyer: Boolean(e.flyerMime),
      createdById: e.createdById,
      createdByName: e.createdBy.name,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  /**
   * Eventos agrupados por región (norte → sur). Siempre devuelve las 16 regiones,
   * aunque estén vacías, con el conteo de próximos para el título de la sección.
   */
  async listByRegion(q: QueryEventsDto): Promise<EventsByRegionResponse> {
    const now = Date.now();
    const where: Prisma.EventWhereInput = {};
    if (q.region) where.region = q.region;
    if (!q.includePast) {
      // Filtro grueso en DB; los "en curso" se resuelven en memoria con endOf().
      where.OR = [
        { endsAt: { gte: new Date(now) } },
        {
          endsAt: null,
          startsAt: { gte: new Date(now - DEFAULT_DURATION_MS) },
        },
      ];
    }
    const rows = await this.prisma.event.findMany({
      where,
      select: EVENT_SELECT,
      orderBy: { startsAt: 'asc' },
    });

    const byRegion = new Map<string, EventRow[]>();
    for (const r of rows) {
      const list = byRegion.get(r.region) ?? [];
      list.push(r);
      byRegion.set(r.region, list);
    }

    let upcomingTotal = 0;
    const sections: EventsRegionSection[] = CHILE_REGIONS.filter(
      (r) => !q.region || r.code === q.region,
    ).map((r) => {
      const list = byRegion.get(r.code) ?? [];
      const isUpcoming = (e: EventRow) =>
        endOf(e) >= now && e.status !== 'CANCELLED';
      const upcoming = list.filter(isUpcoming);
      // Los pasados van después, del más reciente al más antiguo.
      const past = list
        .filter((e) => !isUpcoming(e))
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
      upcomingTotal += upcoming.length;
      return {
        region: r.code,
        name: r.name,
        upcomingCount: upcoming.length,
        events: [...upcoming, ...past].map((e) => this.toDto(e)),
      };
    });

    return { sections, total: rows.length, upcomingTotal };
  }

  async findOne(id: string): Promise<EventDto> {
    const e = await this.prisma.event.findUnique({
      where: { id },
      select: EVENT_SELECT,
    });
    if (!e) throw new NotFoundException('Evento no encontrado.');
    return this.toDto(e);
  }

  async getFlyer(id: string): Promise<UploadedImage | null> {
    const e = await this.prisma.event.findUnique({
      where: { id },
      select: { flyerData: true, flyerMime: true },
    });
    if (!e?.flyerData || !e.flyerMime) return null;
    return { buffer: Buffer.from(e.flyerData, 'base64'), mime: e.flyerMime };
  }

  /** Normaliza un DTO (create o update) a los campos escalares de Prisma. */
  private toData(dto: UpdateEventDto): Prisma.EventUpdateInput {
    const data: Prisma.EventUpdateInput = {};
    const text = (v: string | null | undefined) => v?.trim() || null;
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = text(dto.description);
    if (dto.startsAt !== undefined) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) {
      data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    }
    if (dto.region !== undefined) data.region = dto.region;
    if (dto.city !== undefined) data.city = text(dto.city);
    if (dto.venueName !== undefined) data.venueName = text(dto.venueName);
    if (dto.address !== undefined) data.address = text(dto.address);
    if (dto.styles !== undefined) data.styles = dto.styles.join(',');
    if (dto.bachataPct !== undefined) data.bachataPct = dto.bachataPct ?? null;
    if (dto.priceInfo !== undefined) data.priceInfo = text(dto.priceInfo);
    if (dto.ticketUrl !== undefined) data.ticketUrl = text(dto.ticketUrl);
    if (dto.instagramUrl !== undefined) data.instagramUrl = text(dto.instagramUrl);
    if (dto.organizerName !== undefined) {
      data.organizerName = text(dto.organizerName);
    }
    if (dto.organizerInstagram !== undefined) {
      data.organizerInstagram =
        text(dto.organizerInstagram)?.replace(/^@/, '') ?? null;
    }
    if (dto.status !== undefined) data.status = dto.status;
    return data;
  }

  async create(
    user: AuthUser,
    dto: CreateEventDto,
    flyer?: UploadedImage | null,
  ): Promise<EventDto> {
    const data = this.toData(dto) as Prisma.EventUncheckedCreateInput;
    const e = await this.prisma.event.create({
      data: {
        ...data,
        title: dto.title.trim(),
        startsAt: new Date(dto.startsAt),
        region: dto.region,
        styles: (dto.styles ?? []).join(','),
        flyerData: flyer ? flyer.buffer.toString('base64') : null,
        flyerMime: flyer ? flyer.mime : null,
        createdById: user.id,
      },
      select: EVENT_SELECT,
    });
    return this.toDto(e);
  }

  /** Solo quien lo publicó o un SUPER_ADMIN puede modificarlo/eliminarlo. */
  private async assertOwner(user: AuthUser, id: string): Promise<void> {
    const e = await this.prisma.event.findUnique({
      where: { id },
      select: { createdById: true },
    });
    if (!e) throw new NotFoundException('Evento no encontrado.');
    if (e.createdById !== user.id && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Solo quien publicó este evento puede editarlo.',
      );
    }
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateEventDto,
  ): Promise<EventDto> {
    await this.assertOwner(user, id);
    const e = await this.prisma.event.update({
      where: { id },
      data: this.toData(dto),
      select: EVENT_SELECT,
    });
    return this.toDto(e);
  }

  async setFlyer(
    user: AuthUser,
    id: string,
    flyer: UploadedImage | null,
  ): Promise<EventDto> {
    await this.assertOwner(user, id);
    const e = await this.prisma.event.update({
      where: { id },
      data: {
        flyerData: flyer ? flyer.buffer.toString('base64') : null,
        flyerMime: flyer ? flyer.mime : null,
      },
      select: EVENT_SELECT,
    });
    return this.toDto(e);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.assertOwner(user, id);
    await this.prisma.event.delete({ where: { id } });
  }
}
