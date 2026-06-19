import type {
  DanceStyle,
  Playlist,
  PlaylistItem,
  PlaylistStatus,
  PlaylistVisibility,
  Track,
  TrackApprovalStatus,
  TrackScope,
  TrackSource,
} from '@baile-latino/types';
import type {
  Track as PrismaTrack,
  Playlist as PrismaPlaylist,
  PlaylistItem as PrismaPlaylistItem,
} from '@prisma/client';
import { buildTrackUrl } from './track-url.util';

/** Convierte el registro de Prisma al tipo público (agrega la URL canónica). */
export function toPublicTrack(t: PrismaTrack): Track {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    style: t.style as DanceStyle,
    substyles: t.substyle
      ? t.substyle.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    bpm: t.bpm,
    year: t.year,
    source: t.source as TrackSource,
    sourceId: t.sourceId,
    url: buildTrackUrl(t.source as TrackSource, t.sourceId),
    coverUrl: t.coverUrl,
    durationSec: t.durationSec,
    isRelease: t.isRelease,
    approvalStatus: t.approvalStatus as TrackApprovalStatus,
    scope: t.scope as TrackScope,
    ownerId: t.ownerId,
    artistUserId: t.artistUserId,
    createdById: t.createdById,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    details: parseYtMetadata(t.ytMetadata),
  };
}

function parseYtMetadata(raw: string | null): Track['details'] {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Track['details'];
  } catch {
    return null;
  }
}

type PrismaItemWithTrack = PrismaPlaylistItem & { track?: PrismaTrack | null };
type PrismaPlaylistWithItems = PrismaPlaylist & {
  items?: PrismaItemWithTrack[];
};

export function toPublicPlaylistItem(i: PrismaItemWithTrack): PlaylistItem {
  return {
    id: i.id,
    playlistId: i.playlistId,
    trackId: i.trackId,
    position: i.position,
    isWarmup: i.isWarmup,
    addedById: i.addedById,
    track: i.track ? toPublicTrack(i.track) : undefined,
  };
}

export function toPublicPlaylist(p: PrismaPlaylistWithItems): Playlist {
  return {
    id: p.id,
    name: p.name,
    eventId: p.eventId,
    status: p.status as PlaylistStatus,
    visibility: p.visibility as PlaylistVisibility,
    targetBachataPct: p.targetBachataPct,
    ownerId: p.ownerId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    items: p.items
      ? [...p.items]
          .sort((a, b) => a.position - b.position)
          .map(toPublicPlaylistItem)
      : undefined,
  };
}
