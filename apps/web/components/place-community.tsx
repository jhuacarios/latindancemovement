'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommunityChannelDto, CommunityDto } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { chatKeys } from '@/lib/chat';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';

const key = (placeId: string) => ['place-community', placeId] as const;

/**
 * Comunidad del social (como las comunidades de WhatsApp): botón "Unirme",
 * canal General para todos y canales extra que crea el administrador; cada
 * miembro elige a cuáles entrar. Los mensajes se ven en el chat (/chat/:id).
 */
export function PlaceCommunity({ placeId }: { placeId: string }) {
  const qc = useQueryClient();
  const base = `/community/places/${placeId}/community`;
  const { data, isLoading } = useQuery({
    queryKey: key(placeId),
    queryFn: () => api<CommunityDto>(base),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CommunityChannelDto | null>(null);

  const run = async (path: string, method: 'POST' | 'PATCH' | 'DELETE' = 'POST', body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const d = await api<CommunityDto>(`${base}${path}`, { method, body });
      qc.setQueryData(key(placeId), d);
      void qc.invalidateQueries({ queryKey: chatKeys.conversations });
      void qc.invalidateQueries({ queryKey: chatKeys.unread });
      // Unirse o salir cambia el acceso a las fotos y videos del social.
      void qc.invalidateQueries({ queryKey: ['place-media', placeId] });
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !data) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  const members = `${data.memberCount} ${data.memberCount === 1 ? 'miembro' : 'miembros'}`;

  if (!data.isMember) {
    return (
      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">💬 Comunidad</h2>
          <p className="text-xs text-neutral-500">
            {members}. Únete para conversar en el canal General y entrar a los demás canales.
          </p>
        </div>
        <Button type="button" disabled={busy} onClick={() => void run('/join')}>
          {busy ? 'Uniéndote…' : 'Unirme a la comunidad'}
        </Button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">💬 Comunidad</h2>
          <p className="text-xs text-neutral-500">{members}</p>
        </div>
        {data.canManage && !creating && (
          <Button type="button" variant="ghost" onClick={() => setCreating(true)}>
            + Crear canal
          </Button>
        )}
      </div>

      {creating && (
        <ChannelForm
          submitLabel="Crear canal"
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => {
            if (await run('/channels', 'POST', v)) setCreating(false);
          }}
        />
      )}

      <ul className="divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800">
        {data.channels.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-sm font-semibold text-amber-300">
              #
            </div>
            <div className="min-w-0 flex-1">
              {c.joined ? (
                <Link href={`/chat/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
              ) : (
                <span className="font-medium text-neutral-300">{c.name}</span>
              )}
              <div className="truncate text-xs text-neutral-500">
                {c.description ? `${c.description} · ` : ''}
                {c.memberCount} {c.memberCount === 1 ? 'miembro' : 'miembros'}
              </div>
            </div>
            {c.unreadCount > 0 && (
              <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {c.unreadCount}
              </span>
            )}
            {c.joined ? (
              <Link
                href={`/chat/${c.id}`}
                className="shrink-0 rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:border-neutral-500"
              >
                Abrir
              </Link>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(`/channels/${c.id}/join`)}
                className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
              >
                Unirme
              </button>
            )}
            {!c.isGeneral && (c.joined || data.canManage) && (
              <ChannelMenu
                canManage={data.canManage}
                joined={c.joined}
                onLeave={() => void run(`/channels/${c.id}/leave`)}
                onEdit={() => setEditing(c)}
                onDelete={() =>
                  setConfirm({
                    title: 'Borrar canal',
                    message: (
                      <>
                        ¿Borrar <span className="font-semibold">#{c.name}</span> con todos sus
                        mensajes? No se puede deshacer.
                      </>
                    ),
                    confirmLabel: 'Borrar',
                    danger: true,
                    onConfirm: () => void run(`/channels/${c.id}`, 'DELETE'),
                  })
                }
              />
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <ChannelForm
          initial={editing}
          submitLabel="Guardar"
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={async (v) => {
            if (await run(`/channels/${editing.id}`, 'PATCH', v)) setEditing(null);
          }}
        />
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() =>
          setConfirm({
            title: 'Salir de la comunidad',
            message: 'Saldrás del General y de todos sus canales. Puedes volver a unirte cuando quieras.',
            confirmLabel: 'Salir',
            danger: true,
            onConfirm: () => void run('/leave'),
          })
        }
        className="text-xs text-neutral-500 hover:text-red-300"
      >
        Salir de la comunidad
      </button>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Card>
  );
}

function ChannelMenu({
  canManage,
  joined,
  onLeave,
  onEdit,
  onDelete,
}: {
  canManage: boolean;
  joined: boolean;
  onLeave: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const item = 'block w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-800';
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Opciones del canal"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg px-1.5 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {joined && (
            <button type="button" className={item} onClick={() => { setOpen(false); onLeave(); }}>
              Salir del canal
            </button>
          )}
          {canManage && (
            <>
              <button type="button" className={item} onClick={() => { setOpen(false); onEdit(); }}>
                Editar
              </button>
              <button
                type="button"
                className={`${item} text-red-300`}
                onClick={() => { setOpen(false); onDelete(); }}
              >
                Borrar canal
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChannelForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: CommunityChannelDto;
  submitLabel: string;
  busy: boolean;
  onSubmit: (v: { name: string; description: string | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  return (
    <form
      className="space-y-2 rounded-lg border border-neutral-800 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name: name.trim(), description: description.trim() || null });
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del canal (ej. Clases, Caravanas, Fotos)"
        maxLength={40}
        disabled={initial?.isGeneral}
        required
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="De qué se habla (opcional)"
        maxLength={200}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || name.trim().length < 2}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
