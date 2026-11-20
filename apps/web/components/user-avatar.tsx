'use client';

import { useRef, useState } from 'react';
import { avatarPath, publicName, type PublicUser } from '@baile-latino/types';
import { api, API_BASE, ApiError, uploadForm } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { clsx } from '@/components/clsx';

/** Foto de perfil, o la inicial sobre el color de la marca si no tiene. */
export function UserAvatar({
  user,
  className,
}: {
  user: Pick<PublicUser, 'id' | 'avatarAt' | 'name' | 'displayName'>;
  /** Tamaño y tipografía, ej. "h-14 w-14 text-xl". */
  className?: string;
}) {
  const path = avatarPath(user);
  const initial = publicName(user).trim().charAt(0).toUpperCase() || '👤';
  return path ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`${API_BASE}${path}`} alt="" className={clsx('rounded-full bg-neutral-800 object-cover', className)} />
  ) : (
    <div className={clsx('flex items-center justify-center rounded-full bg-brand font-bold text-white', className)}>
      {initial}
    </div>
  );
}

/** Recorta al centro en cuadrado y achica a 512 px (JPG): pesa poco y se ve nítida. */
function squareJpeg(file: File, size = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.min(size, side);
      canvas
        .getContext('2d')
        ?.drawImage(
          img,
          (img.naturalWidth - side) / 2,
          (img.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.88);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('img'));
    };
    img.src = url;
  });
}

/** Avatar del perfil propio con botones para cambiar o quitar la foto. */
export function AvatarEditor() {
  const { user, updateUser } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  const change = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', await squareJpeg(f), 'avatar.jpg');
      updateUser(await uploadForm<PublicUser>('/auth/me/avatar', fd, 'PUT'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo usar esa imagen.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      updateUser(await api<PublicUser>('/auth/me/avatar', { method: 'DELETE' }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo quitar la foto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        title="Cambiar foto de perfil"
        className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <UserAvatar user={user} className="h-16 w-16 text-2xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
          {busy ? '…' : 'Cambiar'}
        </span>
      </button>
      {user.avatarAt && !busy && (
        <button type="button" onClick={remove} className="text-[11px] text-neutral-500 hover:text-red-300">
          Quitar
        </button>
      )}
      {error && <div className="max-w-40 text-center text-[11px] text-red-300">{error}</div>}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void change(e.target.files?.[0])}
      />
    </div>
  );
}
