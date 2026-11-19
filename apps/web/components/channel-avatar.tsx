'use client';

import type { ChatChannelInfo } from '@baile-latino/types';
import { placePhotoUrl } from '@/lib/community-places';
import { clsx } from '@/components/clsx';

/**
 * Avatar de un canal de comunidad: la foto principal del social con un "#"
 * chico en la esquina (para distinguirlo de un chat privado). Sin foto, solo "#".
 */
export function ChannelAvatar({
  channel,
  size = 'md',
}: {
  channel: ChatChannelInfo;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'h-9 w-9' : 'h-10 w-10';
  const img = placePhotoUrl({
    id: channel.placeId,
    hasPhoto: channel.placeHasPhoto,
    updatedAt: channel.placeUpdatedAt,
  });
  if (!img) {
    return (
      <div
        className={clsx(
          box,
          'flex shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-sm font-semibold text-amber-300',
        )}
      >
        #
      </div>
    );
  }
  return (
    <div className={clsx(box, 'relative shrink-0')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt="" className="h-full w-full rounded-xl object-cover" loading="lazy" />
      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-md border border-neutral-900 bg-amber-500 text-[10px] font-bold leading-none text-neutral-950">
        #
      </span>
    </div>
  );
}
