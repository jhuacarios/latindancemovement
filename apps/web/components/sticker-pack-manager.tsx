'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STICKERS_PER_PACK, type StickerPackDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { prepareSticker, stickerKeys, stickersApi, stickerUrl, type StickerOwner } from '@/lib/stickers';
import { Button, Card, Input } from '@/components/ui';

function PackEditor({ pack, onChanged }: { pack: StickerPackDto; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(pack.name);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar.');
    } finally {
      setBusy(null);
    }
  };

  const upload = (files: FileList | null) =>
    files &&
    void run('Subiendo…', async () => {
      const list = Array.from(files).slice(0, STICKERS_PER_PACK - pack.stickers.length);
      for (const f of list) {
        const { blob, name: fname } = await prepareSticker(f);
        await stickersApi.addSticker(pack.id, blob, fname);
      }
      if (input.current) input.current.value = '';
    });

  return (
    <div className="space-y-3 rounded-xl border border-neutral-800 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" maxLength={40} />
        {name.trim() !== pack.name && name.trim().length >= 2 && (
          <Button size="sm" onClick={() => void run('Guardando…', () => stickersApi.renamePack(pack.id, name))}>
            Guardar nombre
          </Button>
        )}
        <span className="text-xs text-neutral-500">
          {pack.stickers.length}/{STICKERS_PER_PACK}
        </span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`¿Borrar el pack "${pack.name}"? En los chats quedarán como "Sticker eliminado".`)) {
              void run('Borrando…', () => stickersApi.removePack(pack.id));
            }
          }}
          className="ml-auto text-xs text-red-400/80 hover:text-red-300"
        >
          Borrar pack
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {pack.stickers.map((id) => (
          <div key={id} className="group relative aspect-square rounded-lg bg-neutral-900 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={stickerUrl(id)} alt="" className="h-full w-full object-contain" />
            <button
              type="button"
              onClick={() => void run('Quitando…', () => stickersApi.removeSticker(id))}
              title="Quitar sticker"
              className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/75 px-1.5 text-xs text-white group-hover:block"
            >
              ✕
            </button>
          </div>
        ))}
        {pack.stickers.length < STICKERS_PER_PACK && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={Boolean(busy)}
            className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-neutral-700 text-2xl text-neutral-500 hover:border-brand/60 hover:text-brand"
            title="Agregar stickers"
          >
            +
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/webp,image/gif,image/jpeg"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      {busy && <p className="text-xs text-neutral-400">{busy}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

/**
 * Administrar los packs de stickers de un dueño (Nectason, una academia o un
 * social): crear packs, subir y quitar stickers.
 */
export function StickerPackManager({ owner, title, hint }: { owner: StickerOwner; title?: string; hint?: string }) {
  const qc = useQueryClient();
  const key = stickerKeys.owner(owner);
  const q = useQuery({ queryKey: key, queryFn: () => stickersApi.ofOwner(owner) });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: stickerKeys.available });
  };

  const create = async () => {
    setError(null);
    try {
      await stickersApi.createPack(owner, name.trim());
      setName('');
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear el pack.');
    }
  };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">{title ?? 'Stickers'}</h2>
        <p className="text-xs text-neutral-500">
          {hint ??
            'Los usan sus miembros en cualquier chat. PNG o WebP con fondo transparente se ven mejor (también GIF animados de hasta 512 KB).'}
        </p>
      </div>
      {q.isLoading && <p className="text-sm text-neutral-500">Cargando…</p>}
      {(q.data ?? []).map((p) => (
        <PackEditor key={p.id} pack={p} onChanged={refresh} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={q.data?.length ? 'Nombre de otro pack' : 'Nombre del pack (ej: "Vibrant Blaze")'}
          className="max-w-xs"
          maxLength={40}
        />
        <Button size="sm" onClick={() => void create()} disabled={name.trim().length < 2}>
          + Crear pack
        </Button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </Card>
  );
}
