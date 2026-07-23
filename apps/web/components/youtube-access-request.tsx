'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { YoutubeAccessRequest } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Input } from '@/components/ui';

/**
 * Bloque para pedir acceso a YouTube cuando el usuario todavía no está
 * habilitado. Registra su Gmail como solicitud; el admin lo agrega a mano como
 * test user en Google y marca la solicitud. Muestra el estado según avance.
 */
export function YoutubeAccessRequestCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const req = useQuery({
    queryKey: ['youtube-access-request'],
    queryFn: () =>
      api<YoutubeAccessRequest | null>('/music/youtube/access-request'),
  });

  const submit = useMutation({
    mutationFn: (value: string) =>
      api<YoutubeAccessRequest>('/music/youtube/access-request', {
        method: 'POST',
        body: { email: value },
      }),
    onSuccess: (data) => {
      qc.setQueryData(['youtube-access-request'], data);
      setErr(null);
      setTouched(false);
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo enviar.'),
  });

  if (req.isLoading) return null;

  const current = req.data;
  // Valor del input: lo que escribió, o el correo ya solicitado, o su login.
  const value = touched ? email : current?.email ?? user?.email ?? '';

  // Ya aprobado: se muestra arriba el botón de conectar; acá solo un aviso.
  if (current?.status === 'ADDED') {
    return (
      <Card className="border-emerald-600/40 bg-emerald-500/10 text-sm text-emerald-200">
        ✅ Tu acceso a YouTube fue habilitado ({current.email}). Ya puedes
        conectar tu cuenta con el botón de arriba.
      </Card>
    );
  }

  const pending = current?.status === 'PENDING';

  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-medium">
          {pending
            ? '⏳ Tu solicitud está en revisión'
            : '¿Aún no tienes acceso? Solicítalo'}
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          {pending
            ? `Pediste acceso con ${current?.email}. Cuando te habiliten, aquí aparecerá el botón para conectar. Si te equivocaste de correo, cámbialo y vuelve a enviar.`
            : 'Ingresa el correo de Google con el que vas a conectar tu YouTube (puede ser distinto al de tu cuenta). Un administrador lo habilita y luego podrás conectarte.'}
        </p>
        {current?.status === 'REJECTED' && (
          <p className="mt-1 text-xs text-red-300">
            Tu solicitud anterior fue rechazada
            {current.note ? `: ${current.note}` : '.'} Puedes volver a pedirla.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          placeholder="tucorreo@gmail.com"
          value={value}
          onChange={(e) => {
            setTouched(true);
            setEmail(e.target.value);
          }}
        />
        <Button
          className="shrink-0"
          disabled={submit.isPending || !value.trim()}
          onClick={() => submit.mutate(value.trim())}
        >
          {submit.isPending
            ? 'Enviando…'
            : pending
              ? 'Actualizar solicitud'
              : 'Solicitar acceso'}
        </Button>
      </div>

      {err && <p className="text-xs text-red-300">{err}</p>}
    </Card>
  );
}
