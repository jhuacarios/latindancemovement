import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  STICKER_MAX_BYTES,
  STICKERS_PER_PACK,
  type StickerPackDto,
  type StickerPackScope,
} from '@baile-latino/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { UploadedImage } from '../common/multipart';
import { AcademiesService } from '../academies/academies.service';
import { CommunityChannelsService } from '../community/community-channels.service';
import type { CreateStickerPackDto } from './stickers.dto';

const PACK_SELECT = {
  id: true,
  name: true,
  scope: true,
  academyId: true,
  placeId: true,
  stickers: { select: { id: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.StickerPackSelect;

type PackRow = {
  id: string;
  name: string;
  scope: string;
  academyId: string | null;
  placeId: string | null;
  stickers: { id: string }[];
};

/**
 * Packs de stickers: de Nectason (todos), de una academia (su equipo y alumnos
 * inscritos) y de un social (los miembros de su comunidad). Los stickers son
 * imágenes públicas; se pueden mandar en cualquier chat.
 */
@Injectable()
export class StickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academies: AcademiesService,
    private readonly community: CommunityChannelsService,
  ) {}

  /** ¿Puede administrar el pack (o crear uno para ese dueño)? */
  private async canManage(
    user: AuthUser,
    p: { scope: string; academyId: string | null; placeId: string | null },
  ): Promise<boolean> {
    if (user.role === 'SUPER_ADMIN') return true;
    if (p.scope === 'ACADEMY' && p.academyId) return Boolean(await this.academies.roleIn(user, p.academyId));
    if (p.scope === 'PLACE' && p.placeId) return this.community.canManagePlace(user, p.placeId);
    return false;
  }

  private async toDtos(user: AuthUser, rows: PackRow[]): Promise<StickerPackDto[]> {
    const [academyNames, placeNames] = await Promise.all([
      this.academies.academyNames(rows.flatMap((r) => (r.academyId ? [r.academyId] : []))),
      this.community.placeNames(rows.flatMap((r) => (r.placeId ? [r.placeId] : []))),
    ]);
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        scope: r.scope as StickerPackScope,
        academyId: r.academyId,
        placeId: r.placeId,
        ownerName: r.academyId
          ? (academyNames.get(r.academyId) ?? null)
          : r.placeId
            ? (placeNames.get(r.placeId) ?? null)
            : null,
        stickers: r.stickers.map((s) => s.id),
        canManage: await this.canManage(user, r),
      })),
    );
  }

  /** Los packs que puedo usar: Nectason + mis academias + mis sociales (los vacíos no). */
  async available(user: AuthUser): Promise<StickerPackDto[]> {
    const [academyIds, placeIds] = await Promise.all([
      this.academies.academyIdsFor(user.id),
      this.community.placeIdsFor(user.id),
    ]);
    const rows = await this.prisma.stickerPack.findMany({
      where: {
        stickers: { some: {} },
        OR: [{ scope: 'PLATFORM' }, { academyId: { in: academyIds } }, { placeId: { in: placeIds } }],
      },
      select: PACK_SELECT,
      orderBy: [{ scope: 'desc' }, { createdAt: 'asc' }],
    });
    return this.toDtos(user, rows);
  }

  /** Packs de un dueño (para administrarlos): `PLATFORM`, una academia o un social. */
  async ofOwner(
    user: AuthUser,
    q: { scope: StickerPackScope; academyId?: string; placeId?: string },
  ): Promise<StickerPackDto[]> {
    const owner = this.owner(q);
    if (!(await this.canManage(user, owner))) throw new ForbiddenException('No puedes administrar estos stickers.');
    const rows = await this.prisma.stickerPack.findMany({
      where: { scope: owner.scope, academyId: owner.academyId, placeId: owner.placeId },
      select: PACK_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return this.toDtos(user, rows);
  }

  private owner(q: { scope: StickerPackScope; academyId?: string | null; placeId?: string | null }) {
    if (q.scope === 'ACADEMY') {
      if (!q.academyId) throw new BadRequestException('Falta la academia.');
      return { scope: q.scope, academyId: q.academyId, placeId: null };
    }
    if (q.scope === 'PLACE') {
      if (!q.placeId) throw new BadRequestException('Falta el social.');
      return { scope: q.scope, academyId: null, placeId: q.placeId };
    }
    return { scope: 'PLATFORM' as const, academyId: null, placeId: null };
  }

  async createPack(user: AuthUser, dto: CreateStickerPackDto): Promise<StickerPackDto> {
    const owner = this.owner(dto);
    if (!(await this.canManage(user, owner))) throw new ForbiddenException('No puedes crear stickers acá.');
    const row = await this.prisma.stickerPack.create({
      data: { name: dto.name.trim(), ...owner, createdById: user.id },
      select: PACK_SELECT,
    });
    return (await this.toDtos(user, [row]))[0];
  }

  private async managedPack(user: AuthUser, packId: string): Promise<PackRow> {
    const p = await this.prisma.stickerPack.findUnique({ where: { id: packId }, select: PACK_SELECT });
    if (!p) throw new NotFoundException('Pack no encontrado.');
    if (!(await this.canManage(user, p))) throw new ForbiddenException('No puedes administrar este pack.');
    return p;
  }

  async renamePack(user: AuthUser, packId: string, name: string): Promise<StickerPackDto> {
    await this.managedPack(user, packId);
    const row = await this.prisma.stickerPack.update({
      where: { id: packId },
      data: { name: name.trim() },
      select: PACK_SELECT,
    });
    return (await this.toDtos(user, [row]))[0];
  }

  /** Borra el pack y sus stickers (en los chats quedan como "Sticker eliminado"). */
  async removePack(user: AuthUser, packId: string): Promise<void> {
    await this.managedPack(user, packId);
    await this.prisma.stickerPack.delete({ where: { id: packId } });
  }

  async addSticker(user: AuthUser, packId: string, file: UploadedImage): Promise<StickerPackDto> {
    const p = await this.managedPack(user, packId);
    if (p.stickers.length >= STICKERS_PER_PACK) {
      throw new BadRequestException(`Un pack puede tener hasta ${STICKERS_PER_PACK} stickers.`);
    }
    if (file.buffer.length > STICKER_MAX_BYTES) {
      throw new BadRequestException('El sticker no puede pesar más de 512 KB (usa una imagen más chica).');
    }
    await this.prisma.sticker.create({
      data: { packId, data: file.buffer.toString('base64'), mime: file.mime, order: p.stickers.length },
    });
    return (await this.toDtos(user, [(await this.prisma.stickerPack.findUnique({ where: { id: packId }, select: PACK_SELECT }))!]))[0];
  }

  async removeSticker(user: AuthUser, stickerId: string): Promise<StickerPackDto> {
    const s = await this.prisma.sticker.findUnique({ where: { id: stickerId }, select: { packId: true } });
    if (!s) throw new NotFoundException('Sticker no encontrado.');
    await this.managedPack(user, s.packId);
    await this.prisma.sticker.delete({ where: { id: stickerId } });
    return (await this.toDtos(user, [(await this.prisma.stickerPack.findUnique({ where: { id: s.packId }, select: PACK_SELECT }))!]))[0];
  }

  async image(stickerId: string): Promise<UploadedImage | null> {
    const s = await this.prisma.sticker.findUnique({ where: { id: stickerId }, select: { data: true, mime: true } });
    return s ? { buffer: Buffer.from(s.data, 'base64'), mime: s.mime } : null;
  }
}
