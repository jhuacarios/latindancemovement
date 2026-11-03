'use client';

import { useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { STUDIO_MAX_UPLOAD_MB, audioMimeType, uploadAudio } from '@/lib/studio';
import { Button, Card } from './ui';

/**
 * Subida de un audio al Estudio. El archivo va directo al storage privado; antes
 * el usuario declara tener derecho a usarlo para su práctica personal.
 */
export function StudioUpload({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!audioMimeType(f)) return setError('Formato no permitido. Usa MP3, M4A, WAV o FLAC.');
    if (f.size > STUDIO_MAX_UPLOAD_MB * 1024 * 1024) {
      return setError(`El archivo no puede superar ${STUDIO_MAX_UPLOAD_MB} MB.`);
    }
    setFile(f);
  }

  async function submit() {
    if (!file || !rights) return;
    setError(null);
    setProgress(0);
    try {
      await uploadAudio(file, rights, setProgress);
      setFile(null);
      setRights(false);
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo subir el archivo.');
    } finally {
      setProgress(null);
    }
  }

  const uploading = progress !== null;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Subir una canción</h2>
        <p className="text-sm text-neutral-400">
          MP3, M4A, WAV o FLAC, hasta {STUDIO_MAX_UPLOAD_MB} MB y 10 minutos. Tu audio es privado:
          solo tú lo puedes escuchar.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.m4a,.wav,.flac,audio/*"
        disabled={uploading}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neutral-100 hover:file:bg-neutral-700"
      />

      <label className="flex cursor-pointer items-start gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={rights}
          disabled={uploading}
          onChange={(e) => setRights(e.target.checked)}
          className="mt-0.5 accent-brand"
        />
        <span>
          Declaro que tengo derecho a usar este archivo para mi práctica personal. No se comparte
          con otros usuarios.
        </span>
      </label>

      {uploading && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-clave transition-[width]"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-neutral-400">Subiendo… {Math.round((progress ?? 0) * 100)}%</p>
        </div>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      <Button onClick={submit} disabled={!file || !rights || uploading}>
        {uploading ? 'Subiendo…' : 'Subir y analizar'}
      </Button>
    </Card>
  );
}
