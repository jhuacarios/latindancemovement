'use client';

import { StickerPackManager } from '@/components/sticker-pack-manager';

/** Stickers de Nectason: los puede usar cualquiera en cualquier chat (solo SUPER_ADMIN los administra). */
export default function AdminStickersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🩰 Stickers de Nectason</h1>
        <p className="text-sm text-neutral-400">
          Packs que puede usar cualquier persona en cualquier chat. Las academias y los sociales crean los suyos desde su
          página.
        </p>
      </div>
      <StickerPackManager
        owner={{ scope: 'PLATFORM' }}
        title="Packs de Nectason"
        hint="PNG o WebP con fondo transparente se ven mejor (también GIF animados de hasta 512 KB). Se achican a 320 px."
      />
    </div>
  );
}
