'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE, ApiError, uploadFile } from '@/lib/api';
import { Button, Card, Spinner } from '@/components/ui';

interface SiteSettings {
  siteName: string | null;
  hasLogo: boolean;
  logoMime: string | null;
  logoUpdatedAt: string | null;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
const MAX_BYTES = 2 * 1024 * 1024;

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const { data, isLoading } = useQuery({
    queryKey: ['site-settings'],
    queryFn: () => api<SiteSettings>('/settings/site'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['site-settings'] });
  };

  function pickFile(f: File | null) {
    setMsg(null);
    if (!f) {
      setFile(null);
      setLocalPreview(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setMsg({ type: 'err', text: 'El logo no puede superar 2 MB.' });
      return;
    }
    setFile(f);
    setLocalPreview(URL.createObjectURL(f));
  }

  const upload = useMutation({
    mutationFn: (f: File) => uploadFile<SiteSettings>('/settings/site/logo', f),
    onSuccess: () => {
      setFile(null);
      setLocalPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      setMsg({ type: 'ok', text: 'Logo actualizado. Recarga para verlo en el menú.' });
      invalidate();
    },
    onError: (e) =>
      setMsg({
        type: 'err',
        text: e instanceof ApiError ? e.message : 'No se pudo subir el logo.',
      }),
  });

  const remove = useMutation({
    mutationFn: () => api('/settings/site/logo', { method: 'DELETE' }),
    onSuccess: () => {
      setMsg({ type: 'ok', text: 'Logo eliminado.' });
      invalidate();
    },
    onError: (e) =>
      setMsg({
        type: 'err',
        text: e instanceof ApiError ? e.message : 'No se pudo eliminar.',
      }),
  });

  // URL del logo actual (cache-bust con la fecha de actualización).
  const currentLogoUrl =
    data?.hasLogo &&
    `${API_BASE}/settings/site/logo?v=${encodeURIComponent(data.logoUpdatedAt ?? '')}`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em]">
          Configuración del sitio
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Identidad de marca de la plataforma. Por ahora: el logo.
        </p>
      </div>

      {msg && (
        <div
          className={
            msg.type === 'ok'
              ? 'rounded-lg border border-clave/30 bg-clave/10 px-3 py-2 text-sm text-clave'
              : 'rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300'
          }
        >
          {msg.text}
        </div>
      )}

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Logo</h2>
          <p className="text-sm text-neutral-400">
            PNG con transparencia recomendado. También JPG, WEBP o SVG. Máx 2 MB.
          </p>
        </div>

        {isLoading ? (
          <Spinner />
        ) : (
          <div className="flex flex-wrap items-start gap-6">
            {/* Logo actual */}
            <div className="space-y-2">
              <span className="block text-xs text-neutral-500">Actual</span>
              <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-neutral-800 bg-selva p-3">
                {currentLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentLogoUrl}
                    alt="Logo actual"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-neutral-600">Sin logo</span>
                )}
              </div>
            </div>

            {/* Vista previa de la selección */}
            {localPreview && (
              <div className="space-y-2">
                <span className="block text-xs text-neutral-500">
                  Vista previa
                </span>
                <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-clave/40 bg-selva p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={localPreview}
                    alt="Vista previa"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="block max-w-xs text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-neutral-200 hover:file:bg-neutral-700"
          />
          <Button
            onClick={() => file && upload.mutate(file)}
            disabled={!file || upload.isPending}
          >
            {upload.isPending ? 'Subiendo…' : 'Subir logo'}
          </Button>
          {data?.hasLogo && (
            <Button
              variant="ghost"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              Eliminar
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
