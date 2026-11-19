'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { placeLabel, regionName, type AcademyClassDto, type AcademyDto, type AcademyVideoDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  LEVEL_LABEL,
  WEEKDAYS,
  WEEK_ORDER,
  academiesApi,
  academyFormFrom,
  academyLogoUrl,
  classTimeRange,
  formatBytes,
  formatVideoDuration,
  missingExtension,
  MEMBER_ROLE_LABEL,
  canDeleteMedia,
  canWrite,
  planDate,
  planDaysLeft,
  GALLERY_SORTS,
  loadGallerySort,
  saveGallerySort,
  sortGallery,
  type GallerySort,
  compatLabel,
  validateAcademy,
  type AcademyFormValues,
} from '@/lib/academies';
import { AcademyLogo } from '@/components/academy-card';
import { AcademyForm } from '@/components/academy-form';
import { LogoPicker } from '@/components/academy-logo-picker';
import { AcademyClassModal } from '@/components/academy-class-modal';
import { AcademyVideoUpload } from '@/components/academy-video-upload';
import { AcademyVideoPlayer } from '@/components/academy-video-player';
import { AcademyVault, StorageBar, downloadMedia } from '@/components/academy-vault';
import { AcademyShareModal } from '@/components/academy-share-modal';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { InstagramLink } from '@/components/instagram-link';
import { Button, Card, Input, Select, Spinner, StyleBadge } from '@/components/ui';
import { clsx } from '@/components/clsx';

type Tab = 'clases' | 'videos' | 'vault' | 'admin';

export default function AcademyPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('clases');
  const q = useQuery({ queryKey: ['academies', 'detail', id], queryFn: () => academiesApi.get(id) });
  const a = q.data;
  const manages = Boolean(a && (a.myRole || user?.role === 'SUPER_ADMIN'));
  const refresh = () => qc.invalidateQueries({ queryKey: ['academies'] });

  if (q.isLoading) return <Spinner label="Cargando academia…" />;
  if (q.isError || !a) {
    return (
      <Card className="text-sm text-red-300">
        {q.error instanceof ApiError ? q.error.message : 'Academia no encontrada.'}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/academies" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Academias
        </Link>
        <div className="mt-2 flex flex-wrap items-start gap-4">
          <AcademyLogo a={a} className="h-20 w-20" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{a.name}</h1>
            <p className="text-sm text-neutral-400">
              {[a.address, placeLabel(a.city, a.commune), regionName(a.region)].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {a.styles.map((s) => (
                <StyleBadge key={s} style={s} />
              ))}
              {a.instagramHandle && <InstagramLink handle={a.instagramHandle} />}
            </div>
          </div>
          {manages && a.storage && (
            <div className="w-full space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 sm:w-72">
              <PlanStatus a={a} />
              <StorageBar label="Galería" used={a.storage.usedBytes} quota={a.storage.quotaBytes} />
              <StorageBar label="🗄️ Bóveda" used={a.storage.vaultUsedBytes} quota={a.storage.vaultQuotaBytes} />
            </div>
          )}
        </div>
        {manages && <StorageAlerts a={a} />}
        {a.description && <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-neutral-300">{a.description}</p>}
      </div>

      <div className="flex gap-1 border-b border-neutral-800">
        {(
          [
            ['clases', `Clases (${a.classCount})`],
            ['videos', `Fotos y videos (${a.videoCount})`],
            ...(manages ? [['vault', '🗄️ Bóveda'], ['admin', 'Administrar']] : []),
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={clsx(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition',
              tab === k ? 'border-brand text-brand' : 'border-transparent text-neutral-400 hover:text-neutral-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'clases' && <ClassesTab a={a} manages={manages} onChanged={refresh} />}
      {tab === 'videos' && <VideosTab a={a} manages={manages} onChanged={refresh} />}
      {tab === 'vault' && manages && <AcademyVault a={a} onChanged={refresh} />}
      {tab === 'admin' && manages && <AdminTab a={a} onChanged={refresh} />}
    </div>
  );
}

// --- Plan Director ----------------------------------------------------------------

function PlanStatus({ a }: { a: AcademyDto }) {
  if (!a.plan) return null;
  if (!a.plan.active) {
    return <div className="text-xs font-medium text-amber-300">Plan Director: sin plan vigente (solo lectura)</div>;
  }
  const days = a.plan.expiresAt ? planDaysLeft(a.plan.expiresAt) : null;
  return (
    <div className={clsx('text-xs', days !== null && days <= 7 ? 'text-amber-300' : 'text-neutral-400')}>
      ⭐ Plan Director vigente hasta el {a.plan.expiresAt ? planDate(a.plan.expiresAt) : '—'}
      {days !== null && days <= 7 && ` (quedan ${days} ${days === 1 ? 'día' : 'días'})`}
    </div>
  );
}

/** Avisos para quienes administran: plan vencido y galería casi llena (80 %) o llena. */
function StorageAlerts({ a }: { a: AcademyDto }) {
  const msgs: string[] = [];
  if (a.plan && !a.plan.active) {
    msgs.push(
      a.myRole === 'TEACHER'
        ? 'La academia no tiene el Plan Director vigente: todo se sigue viendo y descargando, pero no se puede subir ni mover archivos. Pídele al director que lo renueve.'
        : 'Tu academia no tiene el Plan Director vigente: todo se sigue viendo y descargando, pero no se puede subir ni mover archivos. Escríbenos para activarlo o renovarlo.',
    );
  } else if (a.storage) {
    const pct = a.storage.usedBytes / Math.max(1, a.storage.quotaBytes);
    if (pct >= 1) msgs.push('La galería está llena: mueve archivos a la bóveda o elimina algunos para seguir subiendo.');
    else if (pct >= 0.8)
      msgs.push(`La galería va en ${Math.floor(pct * 100)} %: puedes mover a la bóveda lo que ya no necesites mostrar.`);
  }
  if (msgs.length === 0) return null;
  return (
    <div className="mt-3 space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
      {msgs.map((m) => (
        <p key={m}>⚠️ {m}</p>
      ))}
    </div>
  );
}

// --- Clases -----------------------------------------------------------------------

function ClassesTab({ a, manages, onChanged }: { a: AcademyDto; manages: boolean; onChanged: () => void }) {
  const [modal, setModal] = useState<AcademyClassDto | 'new' | null>(null);
  const [sharing, setSharing] = useState<AcademyClassDto | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const byDay = WEEK_ORDER.map((d) => ({ day: d, classes: a.classes.filter((c) => c.weekday === d) })).filter(
    (x) => x.classes.length > 0,
  );

  const remove = (c: AcademyClassDto) =>
    setConfirm({
      title: 'Eliminar clase',
      message: `¿Eliminar "${c.title}"? Sus videos quedan como contenido general.`,
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: async () => {
        await academiesApi.removeClass(a.id, c.id);
        onChanged();
      },
    });

  return (
    <div className="space-y-4">
      {manages && (
        <Button onClick={() => setModal('new')} size="sm">
          + Agregar clase
        </Button>
      )}
      {byDay.length === 0 && <Card className="text-sm text-neutral-400">Esta academia todavía no publica su horario.</Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {byDay.map(({ day, classes }) => (
          <Card key={day} className="space-y-3">
            <h3 className="font-semibold">{WEEKDAYS[day]}</h3>
            {classes.map((c) => (
              <div key={c.id} className={clsx('space-y-0.5 border-t border-neutral-800 pt-3 first:border-0 first:pt-0', !c.active && 'opacity-50')}>
                <div className="text-sm font-medium text-brand">{classTimeRange(c)}</div>
                <div className="font-medium">
                  {c.title}
                  {!c.active && <span className="ml-2 text-[10px] text-neutral-400">(no se muestra)</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
                  {c.style && <StyleBadge style={c.style} />}
                  <span>{LEVEL_LABEL[c.level]}</span>
                  {c.teacherName && <span>· {c.teacherName}</span>}
                  {c.place && <span>· {c.place}</span>}
                </div>
                {c.priceInfo && <div className="text-xs text-neutral-300">{c.priceInfo}</div>}
                {c.description && <div className="text-xs text-neutral-500">{c.description}</div>}
                {manages && (
                  <div className="flex gap-3 pt-1 text-xs">
                    <button type="button" onClick={() => setSharing(c)} className="text-brand hover:underline">
                      🔗 Compartir videos
                    </button>
                    <button type="button" onClick={() => setModal(c)} className="text-neutral-400 hover:text-neutral-200">
                      Editar
                    </button>
                    <button type="button" onClick={() => remove(c)} className="text-red-400/80 hover:text-red-300">
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </Card>
        ))}
      </div>
      {modal && (
        <AcademyClassModal
          academyId={a.id}
          editing={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            onChanged();
          }}
        />
      )}
      {sharing && <AcademyShareModal academyId={a.id} cls={sharing} onClose={() => setSharing(null)} />}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

// --- Videos -----------------------------------------------------------------------

function VideosTab({ a, manages, onChanged }: { a: AcademyDto; manages: boolean; onChanged: () => void }) {
  const { user } = useAuth();
  const writable = canWrite(a);
  const [classId, setClassId] = useState('');
  const [sort, setSort] = useState<GallerySort>('class-date');
  // El orden elegido se recuerda en este navegador (se lee después de montar).
  useEffect(() => setSort(loadGallerySort()), []);
  const [playing, setPlaying] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  const videos = useQuery({
    queryKey: ['academies', 'videos', a.id, classId],
    queryFn: () => academiesApi.videos(a.id, classId || undefined),
  });
  const free = a.storage ? a.storage.quotaBytes - a.storage.usedBytes : null;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const items = useMemo(() => sortGallery(videos.data ?? [], sort), [videos.data, sort]);
  const selectedBytes = (videos.data ?? []).filter((v) => selected.has(v.id)).reduce((s, v) => s + v.sizeBytes, 0);

  const toVault = async () => {
    setMoving(true);
    setMoveMsg(null);
    try {
      const r = await academiesApi.toVault(a.id, [...selected]);
      setSelected(new Set());
      setMoveMsg(`${r.moved} ${r.moved === 1 ? 'archivo movido' : 'archivos movidos'} a la bóveda.`);
      onChanged();
    } catch (e) {
      setMoveMsg(e instanceof ApiError ? e.message : 'No se pudo mover a la bóveda.');
    } finally {
      setMoving(false);
    }
  };

  const remove = (v: AcademyVideoDto) =>
    setConfirm({
      title: v.kind === 'PHOTO' ? 'Eliminar foto' : 'Eliminar video',
      message: `¿Eliminar "${v.title}"? Se borra el archivo y no se puede recuperar.`,
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: async () => {
        await academiesApi.removeVideo(a.id, v.id);
        onChanged();
      },
    });

  return (
    <div className="space-y-4">
      {manages && writable && (
        <AcademyVideoUpload academyId={a.id} classes={a.classes} freeBytes={free} onUploaded={onChanged} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {a.classes.length > 0 && (
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Todas las clases</option>
            {a.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({WEEKDAYS[c.weekday]} {c.startTime})
              </option>
            ))}
          </Select>
        )}
        <label className="flex items-center gap-2 text-sm text-neutral-400">
          Ordenar por
          <Select
            value={sort}
            onChange={(e) => {
              const v = e.target.value as GallerySort;
              setSort(v);
              saveGallerySort(v);
              setPlaying(null);
            }}
          >
            {GALLERY_SORTS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {manages && writable && selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-neutral-900 p-3 text-sm shadow-lg">
          <span>
            {selected.size} {selected.size === 1 ? 'seleccionado' : 'seleccionados'} ({formatBytes(selectedBytes)})
          </span>
          <Button size="sm" onClick={toVault} disabled={moving}>
            {moving ? 'Moviendo…' : '🗄️ Mover a la bóveda'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={moving}>
            Cancelar
          </Button>
          <span className="text-xs text-neutral-500">Libera espacio de la galería; se podrán descargar o devolver.</span>
        </div>
      )}
      {moveMsg && <p className="text-sm text-neutral-300">{moveMsg}</p>}

      {videos.isLoading && <Spinner label="Cargando galería…" />}
      {videos.data && videos.data.length === 0 && (
        <Card className="text-sm text-neutral-400">
          {classId ? 'Esta clase no tiene fotos ni videos todavía.' : 'Todavía no hay fotos ni videos.'}
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((v, i) => (
          <div
            key={v.id}
            className={clsx(
              'relative overflow-hidden rounded-xl border bg-neutral-900/60',
              selected.has(v.id) ? 'border-brand' : 'border-neutral-800',
            )}
          >
            {manages && writable && (
              <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center rounded bg-black/60 p-1.5">
                <input
                  type="checkbox"
                  checked={selected.has(v.id)}
                  onChange={() => toggle(v.id)}
                  className="h-4 w-4 accent-brand"
                  aria-label={`Seleccionar ${v.title}`}
                />
              </label>
            )}
            <button type="button" onClick={() => setPlaying(i)} className="group relative block aspect-video w-full bg-neutral-800">
              {v.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full items-center justify-center text-3xl">{v.kind === 'PHOTO' ? '🖼️' : '🎬'}</span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-4xl text-white/0 transition group-hover:bg-black/40 group-hover:text-white/90">
                {v.kind === 'PHOTO' ? '⤢' : '▶'}
              </span>
              {v.kind === 'VIDEO' && v.durationMs === null && (
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-white">▶ video</span>
              )}
              {v.durationMs !== null && (
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-white">
                  {formatVideoDuration(v.durationMs)}
                </span>
              )}
            </button>
            <div className="space-y-0.5 p-3">
              <div className="line-clamp-2 break-all text-sm font-medium">
                {v.title}
                <span className="text-neutral-500">{missingExtension(v)}</span>
              </div>
              <div className="text-xs text-neutral-400">
                {[v.classTitle ?? 'Contenido general', v.recordedOn].filter(Boolean).join(' · ')}
              </div>
              {manages && compatLabel(v) && <div className="text-[11px] text-neutral-500">{compatLabel(v)}</div>}
              {manages && (
                <div className="flex flex-wrap gap-3 pt-1 text-xs">
                  <span className="text-neutral-500">{formatBytes(v.sizeBytes)}</span>
                  <button
                    type="button"
                    onClick={() => void downloadMedia(a.id, v.id)}
                    className="text-neutral-400 hover:text-neutral-200"
                  >
                    Descargar
                  </button>
                  {v.kind === 'VIDEO' && v.compat.status === 'DONE' && (
                    <button
                      type="button"
                      onClick={() => void downloadMedia(a.id, v.id, 'mp4')}
                      className="text-brand hover:underline"
                    >
                      MP4
                    </button>
                  )}
                  {canDeleteMedia(a, v, user) && (
                    <button type="button" onClick={() => remove(v)} className="text-red-400/80 hover:text-red-300">
                      Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {playing !== null && items[playing] && (
        <AcademyVideoPlayer
          academyId={a.id}
          items={items}
          index={playing}
          onIndex={setPlaying}
          onClose={() => setPlaying(null)}
          manages={manages}
          onChanged={onChanged}
          onDownload={manages ? (vid, format) => downloadMedia(a.id, vid, format) : undefined}
        />
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

// --- Administrar ------------------------------------------------------------------

function AdminTab({ a, onChanged }: { a: AcademyDto; onChanged: () => void }) {
  const router = useRouter();
  // Acá solo llegan quienes administran: sin rol en la academia = SUPER_ADMIN, que cuenta como director.
  const isOwner = a.myRole !== 'TEACHER';
  const [values, setValues] = useState<AcademyFormValues>(academyFormFrom(a));
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const save = async () => {
    const err = validateAcademy(values);
    if (err) return setError(err);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await academiesApi.update(a.id, values);
      if (logo) await academiesApi.setLogo(a.id, logo);
      setLogo(null);
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const addMember = async () => {
    setMemberError(null);
    try {
      await academiesApi.addMember(a.id, email.trim());
      setEmail('');
      onChanged();
    } catch (e) {
      setMemberError(e instanceof ApiError ? e.message : 'No se pudo agregar.');
    }
  };

  const used = a.storage?.usedBytes ?? 0;
  const quota = a.storage?.quotaBytes ?? 1;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <h2 className="mb-4 font-semibold">Perfil</h2>
        <AcademyForm
          values={values}
          onChange={(v) => {
            setValues(v);
            setSaved(false);
          }}
          onSubmit={save}
          submitLabel={saved ? '✓ Guardado' : 'Guardar cambios'}
          busy={busy}
          error={error}
          logoSlot={
            <div className="space-y-1">
              <LogoPicker file={logo} onChange={setLogo} currentUrl={academyLogoUrl(a)} />
              {a.hasLogo && !logo && (
                <button
                  type="button"
                  className="text-xs text-neutral-400 hover:text-neutral-200"
                  onClick={async () => {
                    await academiesApi.clearLogo(a.id);
                    onChanged();
                  }}
                >
                  Quitar logo
                </button>
              )}
            </div>
          }
        />
      </Card>

      <div className="space-y-4">
        <Card className="space-y-3">
          <h2 className="font-semibold">Profesores</h2>
          <p className="text-xs text-neutral-400">
            Pueden editar el perfil, el horario y subir videos, y eliminar lo que subieron ellos. Solo el director agrega o quita profesores y elimina lo de otros.
          </p>
          <ul className="space-y-2">
            {a.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{m.name}</div>
                  <div className="truncate text-xs text-neutral-500">{m.email}</div>
                </div>
                {m.role === 'OWNER' ? (
                  <span className="text-xs text-brand">{MEMBER_ROLE_LABEL.OWNER}</span>
                ) : (
                  isOwner && (
                    <button
                      type="button"
                      className="text-xs text-red-400/80 hover:text-red-300"
                      onClick={() =>
                        setConfirm({
                          title: 'Quitar profesor',
                          message: `¿Quitar a ${m.name}? Ya no podrá administrar la academia.`,
                          confirmLabel: 'Quitar',
                          danger: true,
                          onConfirm: async () => {
                            await academiesApi.removeMember(a.id, m.userId);
                            onChanged();
                          },
                        })
                      }
                    >
                      Quitar
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
          {isOwner && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void addMember();
              }}
            >
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@del-profesor.cl" />
              <Button type="submit" size="sm" disabled={!email.includes('@')}>
                Agregar
              </Button>
            </form>
          )}
          {memberError && <p className="text-xs text-red-300">{memberError}</p>}
        </Card>

        {a.storage && (
          <Card className="space-y-2">
            <h2 className="font-semibold">Espacio</h2>
            <PlanStatus a={a} />
            <p className="text-xs text-neutral-500">
              El Plan Director de la academia incluye {formatBytes(a.storage.quotaBytes)} de galería y{' '}
              {formatBytes(a.storage.vaultQuotaBytes)} de bóveda.
            </p>
            <StorageBar label="Galería (fotos y videos)" used={used} quota={quota} />
            <StorageBar label="Bóveda" used={a.storage.vaultUsedBytes} quota={a.storage.vaultQuotaBytes} />
          </Card>
        )}

        {isOwner && (
          <Card className="space-y-2">
            <h2 className="font-semibold text-red-300">Eliminar academia</h2>
            <p className="text-xs text-neutral-400">Se borran el perfil, el horario y todos los videos. No se puede deshacer.</p>
            <Button
              size="sm"
              variant="danger"
              onClick={() =>
                setConfirm({
                  title: 'Eliminar academia',
                  message: `¿Eliminar "${a.name}" con todas sus clases y videos?`,
                  confirmLabel: 'Eliminar todo',
                  danger: true,
                  onConfirm: async () => {
                    await academiesApi.remove(a.id);
                    onChanged();
                    router.push('/academies/mine');
                  },
                })
              }
            >
              Eliminar academia
            </Button>
          </Card>
        )}
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
