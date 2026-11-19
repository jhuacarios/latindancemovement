'use client';

import { useState } from 'react';
import { API_BASE } from '@/lib/api';
import { clsx } from '@/components/clsx';

/** Avatar del chat de una clase: el logo de la academia (si tiene) con 🎓 de respaldo. */
export function ClassAvatar({ academyId, size = 'md' }: { academyId: string; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false);
  const box = size === 'sm' ? 'h-9 w-9' : 'h-10 w-10';
  return (
    <div className={clsx(box, 'relative shrink-0')}>
      {failed ? (
        <div className="flex h-full w-full items-center justify-center rounded-xl bg-sky-500/15 text-lg">🎓</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${API_BASE}/academies/${academyId}/logo`}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full rounded-xl object-cover"
          loading="lazy"
        />
      )}
      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-md border border-neutral-900 bg-sky-400 text-[9px] leading-none">
        🎓
      </span>
    </div>
  );
}
