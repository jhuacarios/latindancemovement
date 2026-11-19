'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlaceMediaDto, PlaceMediaStorage } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  fileHash,
  formatBytes,
  formatVideoDuration,
  isDuplicateError,
  mediaMaxBytes,
  mediaMimeType,
} from '@/lib/academies';
import { asPlayerItem, downloadPlaceMedia, placeMediaApi, uploadPlaceMedia } from '@/lib/place-media';
import { AcademyVideoPlayer } from '@/components/academy-video-player';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';

const ACCEPT = 'video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp';
const keyOf = (placeId: string) => ['place-media', placeId] as const;

function Meter({ label, used, quota }: { label: string; used: number; quota: number }) {
  const pct = quota > 0 ? (used / quota) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span>
          {formatBytes(used)} de {formatBytes(quota)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={clsx('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-brand')}
          style={{ width: `${Math.min(100, Math.max(pct, used > 0 ? 1 : 0))}%` }}
        />
      </div>
    </div>
  );
}

/** SUPER_ADMIN: cupos del social en GB (versión gratis 5 + 20). */
function QuotaEditor({ placeId, storage, onSaved }: { placeId: string; storage: PlaceMediaStorage; onSaved: () => void }) {
  const GB = 1024 ** 3;
  const [media, setMedia] = useState(String(Math.round((storage.quotaBytes / GB) * 10) / 10));
  const [vaultGb, setVaultGb] = useState(String(Math.round((storage.vaultQuotaBytes / GB) * 10) / 10));
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-xs"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          await placeMediaApi.setQuota(placeId, { mediaGb: Number(media), vaultGb: Number(vaultGb) });
          setMsg('Guardado ✓');
          onSaved();
        } catch (err) {
          setMsg(err instanceof ApiError ? err.message : 'No se pudo guardar.');
        }
      }}
    >
      <span className="w-full text-neutral-500">Cupos (solo tú los ves): versión gratis = 5 GB + 20 GB</span>
      <label className="flex items-center gap-1 text-neutral-400">
        Galería <Input type="number" min={0.1} step={0.1} value={media} onChange={(e) => setMedia(e.target.value)} className="w-20" /> GB
      </label>
      <label className="flex items-center gap-1 text-neutral-400">
        Bóveda <Input type="number" min={0.1} step={0.1} value={vaultGb} onChange={(e) => setVaultGb(e.target.value)} className="w-20" /> GB
      </label>
      <Button type="submit" variant="ghost">Guardar cupos</Button>
      {msg && <span className="text-neutral-400">{msg}</span>}
    </form>
  );
}

function Uploader({ placeId, storage, onDone }: { placeId: string; storage: PlaceMediaStorage; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [day, setDay] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const free = storage.quotaBytes - storage.usedBytes;

  async function run(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErrors([]);
    const errs: string[] = [];
    const list = Array.from(files);
    let ok = 0;
    for (const [i, f] of list.entries()) {
      const mime = mediaMimeType(f);
      if (!mime) {
        errs.push(`${f.name}: formato no permitido`);
        continue;
      }
      if (f.size > mediaMaxBytes(mime)) {
        errs.push(`${f.name}: supera ${formatBytes(mediaMaxBytes(mime))}`);
        continue;
      }
      try {
        setStatus(`Revisando ${i + 1} de ${list.length}…`);
        const hash = await fileHash(f).catch(() => undefined);
        await uploadPlaceMedia(placeId, { file: f, title: f.name.slice(0, 160), recordedOn: day || null, contentHash: hash }, (p) =>
          setStatus(`Subiendo ${i + 1} de ${list.length}: ${Math.round(p * 100)}%`),
        );
        ok++;
      } catch (e) {
        if (isDuplicateError(e)) errs.push(`${f.name}: ya está en el espacio del social`);
        else errs.push(`${f.name}: ${e instanceof ApiError || e instanceof Error ? e.message : 'no se pudo subir'}`);
      }
    }
    setStatus(ok ? `Listo: ${ok} ${ok === 1 ? 'archivo subido' : 'archivos subidos'}.` : null);
    setErrors(errs);
    setBusy(false);
    if (input.current) input.current.value = '';
    onDone();
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-neutral-700 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">Día del social (opcional)</span>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />
        </label>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void run(e.target.files)} />
        <Button type="button" disabled={busy || free <= 0} onClick={() => input.current?.click()}>
          {busy ? 'Subiendo…' : '+ Subir fotos y videos'}
        </Button>
      </div>
      <p className="text-xs text-neutral-500">
        Videos MP4, MOV o WEBM hasta 3 GB; fotos hasta 25 MB. Quedan libres {formatBytes(Math.max(0, free))}. No subas
        el mismo archivo dos veces: se detecta y se salta.
      </p>
      {status && <p className="text-sm text-neutral-300">{status}</p>}
      {errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-red-300">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Grid({
  items,
  onOpen,
  canManage,
  onMenu,
}: {
  items: PlaceMediaDto[];
  onOpen: (i: number) => void;
  canManage: boolean;
  onMenu: (m: PlaceMediaDto) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
      {items.map((m, i) => (
        <div key={m.id} className="group relative aspect-square overflow-hidden rounded bg-neutral-800">
          <button type="button" onClick={() => onOpen(i)} className="block h-full w-full" aria-label={`Ver ${m.title}`}>
            {m.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full items-center justify-center text-2xl">{m.kind === 'PHOTO' ? '🖼️' : '🎬'}</div>
            )}
            {m.kind === 'VIDEO' && (
              <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">
                ▶ {formatVideoDuration(m.durationMs)}
              </span>
            )}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => onMenu(m)}
              aria-label="Opciones"
              className="absolute right-1 top-1 rounded-full bg-black/70 px-2 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              ⋯
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Fotos y videos del social (versión gratis: 5 GB + 20 GB de bóveda). Lo ven los
 * miembros de la comunidad; sube y gestiona el administrador.
 */
export function PlaceMedia({ placeId, isMember }: { placeId: string; isMember: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState<number | null>(null);
  const [showVault, setShowVault] = useState(false);
  const [menu, setMenu] = useState<PlaceMediaDto | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: keyOf(placeId),
    queryFn: () => placeMediaApi.list(placeId),
    retry: false,
  });
  const vault = useQuery({
    queryKey: [...keyOf(placeId), 'vault'],
    queryFn: () => placeMediaApi.vault(placeId),
    enabled: showVault && Boolean(data?.canManage),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: keyOf(placeId) });

  // Sin acceso (403): no es miembro. La invitación a unirse está en la tarjeta de Comunidad.
  if (loadError instanceof ApiError && loadError.status === 403) {
    return (
      <Card className="text-sm text-neutral-400">
        📷 <span className="font-semibold text-neutral-200">Fotos y videos</span> · {isMember ? 'Sin acceso.' : 'Únete a la comunidad para verlos.'}
      </Card>
    );
  }
  if (isLoading || !data) return <Card><Spinner /></Card>;

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar.');
    }
  };

  const items = data.items;
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">📷 Fotos y videos</h2>
          <p className="text-xs text-neutral-500">
            {items.length} {items.length === 1 ? 'archivo' : 'archivos'} · solo los ven los miembros de la comunidad
          </p>
        </div>
        {data.canManage && (
          <Button type="button" variant="ghost" onClick={() => setShowVault((v) => !v)}>
            {showVault ? 'Ver galería' : '🗄️ Bóveda'}
          </Button>
        )}
      </div>

      {data.storage && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Meter label="Galería" used={data.storage.usedBytes} quota={data.storage.quotaBytes} />
          <Meter label="Bóveda (solo descarga)" used={data.storage.vaultUsedBytes} quota={data.storage.vaultQuotaBytes} />
        </div>
      )}

      {user?.role === 'SUPER_ADMIN' && data.storage && (
        <QuotaEditor placeId={placeId} storage={data.storage} onSaved={refresh} />
      )}

      {data.canManage && data.storage && !showVault && (
        <Uploader placeId={placeId} storage={data.storage} onDone={refresh} />
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      {showVault ? (
        vault.isLoading ? (
          <Spinner />
        ) : (vault.data ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500">La bóveda está vacía. Mueve ahí lo que quieras guardar sin ocupar la galería.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 text-sm">
            {vault.data!.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{m.title}</span>
                <span className="shrink-0 text-xs text-neutral-500">{formatBytes(m.sizeBytes)}</span>
                <button type="button" className="text-xs text-brand hover:underline" onClick={() => void act(() => downloadPlaceMedia(placeId, m.id))}>
                  Descargar
                </button>
                <button
                  type="button"
                  className="text-xs text-neutral-300 hover:underline"
                  onClick={() => void act(() => placeMediaApi.move(placeId, m.id, 'GALLERY'))}
                >
                  A la galería
                </button>
              </li>
            ))}
          </ul>
        )
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Todavía no hay fotos ni videos{data.canManage ? '. Sube los del último social.' : '.'}
        </p>
      ) : (
        <Grid items={items} onOpen={setOpen} canManage={data.canManage} onMenu={setMenu} />
      )}

      {menu && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setMenu(null)}>
          <div className="w-full max-w-xs overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="truncate border-b border-neutral-800 px-4 py-3 text-sm font-semibold">{menu.title}</div>
            {[
              { label: 'Descargar', fn: () => downloadPlaceMedia(placeId, menu.id) },
              { label: 'Mover a la bóveda', fn: () => placeMediaApi.move(placeId, menu.id, 'VAULT') },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-800"
                onClick={() => {
                  setMenu(null);
                  void act(o.fn);
                }}
              >
                {o.label}
              </button>
            ))}
            <button
              type="button"
              className="block w-full px-4 py-2.5 text-left text-sm text-red-300 hover:bg-neutral-800"
              onClick={() => {
                const m = menu;
                setMenu(null);
                setConfirm({
                  title: 'Borrar archivo',
                  message: <>¿Borrar <span className="font-semibold">{m.title}</span>? No se puede deshacer.</>,
                  confirmLabel: 'Borrar',
                  danger: true,
                  onConfirm: () => void act(() => placeMediaApi.remove(placeId, m.id)),
                });
              }}
            >
              Borrar
            </button>
          </div>
        </div>
      )}

      {open !== null && items[open] && (
        <AcademyVideoPlayer
          academyId={placeId}
          items={items.map(asPlayerItem)}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          urlFor={(id) => placeMediaApi.url(placeId, id)}
          onDownload={async (id) => downloadPlaceMedia(placeId, id)}
          allowReport={false}
        />
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Card>
  );
}
