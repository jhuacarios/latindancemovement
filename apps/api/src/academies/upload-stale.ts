/**
 * Una subida que quedó en UPLOADING más de esto se considera abandonada: no cuenta
 * en el cupo y se borra en la limpieza periódica. (Holgado: un video de 3 GB con
 * conexión lenta puede tardar horas.)
 */
export const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export function staleUploadCutoff(): Date {
  return new Date(Date.now() - STALE_UPLOAD_MS);
}

/** Filtro Prisma: lo que ocupa cupo (listo, o subiéndose hace menos de 24 h). */
export function countsForQuota() {
  return {
    OR: [{ status: 'READY' }, { status: 'UPLOADING', createdAt: { gte: staleUploadCutoff() } }],
  };
}
