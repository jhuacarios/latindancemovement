import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Playlist } from '@baile-latino/types';
import type { AuthUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { toPublicPlaylist } from '../mappers';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { AddItemDto } from './dto/add-item.dto';
import { ReorderDto } from './dto/reorder.dto';

const ITEMS_INCLUDE = {
  items: { include: { track: true }, orderBy: { position: 'asc' as const } },
};

@Injectable()
export class PlaylistsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePlaylistDto, userId: string): Promise<Playlist> {
    const created = await this.prisma.playlist.create({
      data: {
        name: dto.name,
        source: dto.source ?? 'YOUTUBE',
        eventId: dto.eventId ?? null,
        status: dto.status ?? 'BORRADOR',
        visibility: dto.visibility ?? 'SOLO_ENTRADA',
        targetBachataPct: dto.targetBachataPct ?? null,
        bachatasPerBlock: dto.bachatasPerBlock ?? null,
        salsasPerBlock: dto.salsasPerBlock ?? null,
        ownerId: userId,
      },
      include: ITEMS_INCLUDE,
    });
    return toPublicPlaylist(created);
  }

  async findAllForUser(
    user: AuthUser,
    source?: 'YOUTUBE' | 'SPOTIFY',
  ): Promise<Playlist[]> {
    const where: { ownerId?: string; source?: string } =
      user.role === 'SUPER_ADMIN' ? {} : { ownerId: user.id };
    if (source) where.source = source;
    const rows = await this.prisma.playlist.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: ITEMS_INCLUDE,
    });
    return rows.map(toPublicPlaylist);
  }

  async findOne(id: string): Promise<Playlist> {
    const p = await this.prisma.playlist.findUnique({
      where: { id },
      include: ITEMS_INCLUDE,
    });
    if (!p) throw new NotFoundException('Playlist no encontrada');
    return toPublicPlaylist(p);
  }

  async update(
    id: string,
    dto: UpdatePlaylistDto,
    user: AuthUser,
  ): Promise<Playlist> {
    await this.assertOwner(id, user);
    const updated = await this.prisma.playlist.update({
      where: { id },
      data: {
        name: dto.name,
        eventId: dto.eventId,
        status: dto.status,
        visibility: dto.visibility,
        targetBachataPct: dto.targetBachataPct,
        bachatasPerBlock: dto.bachatasPerBlock,
        salsasPerBlock: dto.salsasPerBlock,
      },
      include: ITEMS_INCLUDE,
    });
    return toPublicPlaylist(updated);
  }

  async remove(id: string, user: AuthUser): Promise<{ id: string; deleted: true }> {
    await this.assertOwner(id, user);
    await this.prisma.playlist.delete({ where: { id } });
    return { id, deleted: true };
  }

  async addItem(
    playlistId: string,
    dto: AddItemDto,
    user: AuthUser,
  ): Promise<Playlist> {
    await this.assertOwner(playlistId, user);

    const track = await this.prisma.track.findUnique({
      where: { id: dto.trackId },
      select: { id: true },
    });
    if (!track) throw new NotFoundException('Canción no encontrada');

    const existing = await this.prisma.playlistItem.findUnique({
      where: { playlistId_trackId: { playlistId, trackId: dto.trackId } },
    });
    if (existing) {
      throw new ForbiddenException('La canción ya está en la playlist');
    }

    const count = await this.prisma.playlistItem.count({ where: { playlistId } });
    const position = dto.position ?? count + 1;

    await this.prisma.playlistItem.create({
      data: {
        playlistId,
        trackId: dto.trackId,
        position,
        isWarmup: dto.isWarmup ?? false,
        addedById: user.id,
      },
    });
    return this.findOne(playlistId);
  }

  async removeItem(
    playlistId: string,
    itemId: string,
    user: AuthUser,
  ): Promise<Playlist> {
    await this.assertOwner(playlistId, user);
    const item = await this.prisma.playlistItem.findFirst({
      where: { id: itemId, playlistId },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado en la playlist');
    await this.prisma.playlistItem.delete({ where: { id: itemId } });
    return this.findOne(playlistId);
  }

  async reorder(
    playlistId: string,
    dto: ReorderDto,
    user: AuthUser,
  ): Promise<Playlist> {
    await this.assertOwner(playlistId, user);
    await this.prisma.$transaction(
      dto.itemIds.map((itemId, idx) =>
        this.prisma.playlistItem.updateMany({
          where: { id: itemId, playlistId },
          data: { position: idx + 1 },
        }),
      ),
    );
    return this.findOne(playlistId);
  }

  private async assertOwner(id: string, user: AuthUser): Promise<void> {
    const p = await this.prisma.playlist.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!p) throw new NotFoundException('Playlist no encontrada');
    if (user.role !== 'SUPER_ADMIN' && p.ownerId !== user.id) {
      throw new ForbiddenException('No eres dueño de esta playlist');
    }
  }
}
