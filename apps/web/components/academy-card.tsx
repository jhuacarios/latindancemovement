'use client';

import Link from 'next/link';
import { regionName, type AcademySummaryDto } from '@baile-latino/types';
import { academyLogoUrl } from '@/lib/academies';
import { StyleBadge } from './ui';
import { InstagramLink } from './instagram-link';

export function AcademyLogo({ a, className = 'h-16 w-16' }: { a: Pick<AcademySummaryDto, 'id' | 'hasLogo'>; className?: string }) {
  const img = academyLogoUrl(a);
  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-xl bg-neutral-800`}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl">🎓</div>
      )}
    </div>
  );
}

export function AcademyCard({ a }: { a: AcademySummaryDto }) {
  return (
    <div className="relative flex gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 transition hover:border-neutral-600">
      <AcademyLogo a={a} />
      <div className="min-w-0 flex-1">
        <Link href={`/academies/${a.id}`} className="font-semibold after:absolute after:inset-0">
          {a.name}
        </Link>
        <div className="text-sm text-neutral-400">{[a.city, regionName(a.region)].filter(Boolean).join(' · ')}</div>
        <div className="mt-1 text-xs text-neutral-500">
          {a.classCount} {a.classCount === 1 ? 'clase' : 'clases'} · {a.videoCount}{' '}
          {a.videoCount === 1 ? 'foto o video' : 'fotos y videos'}
          {a.myRole && <span className="ml-2 text-brand">{a.myRole === 'OWNER' ? 'Eres el dueño' : 'Eres profesor'}</span>}
        </div>
        <div className="relative mt-1.5 flex flex-wrap items-center gap-1.5">
          {a.styles.map((s) => (
            <StyleBadge key={s} style={s} />
          ))}
          {a.instagramHandle && <InstagramLink handle={a.instagramHandle} />}
        </div>
      </div>
    </div>
  );
}
