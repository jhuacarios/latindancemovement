'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

/** Elegir el logo (JPG/PNG/WEBP, máx. 5 MB) con vista previa. */
export function LogoPicker({
  file,
  onChange,
  currentUrl,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  /** Logo actual (al editar). */
  currentUrl?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type)) return setError('Usa una imagen JPG, PNG o WEBP.');
    if (f.size > MAX_BYTES) return setError('El logo no puede superar 5 MB.');
    onChange(f);
  };

  const shown = preview ?? currentUrl ?? null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-400">Logo (opcional)</span>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 overflow-hidden rounded-xl bg-neutral-800">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl">🎓</div>
          )}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => input.current?.click()}>
          {shown ? 'Cambiar logo' : 'Elegir logo'}
        </Button>
        {file && (
          <button type="button" className="text-xs text-neutral-400 hover:text-neutral-200" onClick={() => onChange(null)}>
            Quitar
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
