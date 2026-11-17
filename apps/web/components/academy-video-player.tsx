"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AcademyVideoDto } from "@baile-latino/types";
import { ApiError } from "@/lib/api";
import {
  academiesApi,
  compatLabel,
  formatVideoDuration,
  frameFromUrl,
  hasMp4,
  missingExtension,
  replaceThumbnail,
  type DownloadFormat,
} from "@/lib/academies";
import { textareaClass } from "./academy-form";
import { Button, Spinner, StyleBadge } from "./ui";

/**
 * Visor de la galería de una academia: reproduce el video o muestra la foto en
 * grande (URL firmada de 1 h), con ← → para pasar al anterior/siguiente y un
 * botón para reportar.
 */
export function AcademyVideoPlayer({
  academyId,
  items,
  index,
  onIndex,
  onClose,
  manages = false,
  onChanged,
  urlFor,
  onDownload,
  allowReport = true,
}: {
  academyId: string;
  items: AcademyVideoDto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Dueño o profesor: puede elegir el cuadro de la miniatura. */
  manages?: boolean;
  /** Se llamó cuando cambió algo (p. ej. la miniatura). */
  onChanged?: () => void;
  /** De dónde sacar la URL para ver (por defecto, la API de la academia con sesión). */
  urlFor?: (videoId: string) => Promise<{ url: string }>;
  /** Si viene, muestra el botón Descargar. */
  onDownload?: (videoId: string, format: DownloadFormat) => Promise<void>;
  allowReport?: boolean;
}) {
  const [downloading, setDownloading] = useState<DownloadFormat | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [thumbState, setThumbState] = useState<
    "idle" | "saving" | "done" | string
  >("idle");
  const item = items[index];
  const url = useQuery({
    queryKey: ["academies", "media-url", urlFor ? "shared" : "panel", item.id],
    queryFn: () =>
      urlFor ? urlFor(item.id) : academiesApi.videoUrl(academyId, item.id),
    staleTime: 50 * 60 * 1000, // la URL dura 1 h
    refetchOnWindowFocus: false,
  });
  const [playError, setPlayError] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [reportState, setReportState] = useState<
    "idle" | "sending" | "sent" | string
  >("idle");
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const isPhoto = item.kind === "PHOTO";

  // Al cambiar de archivo se limpia el estado del anterior.
  useEffect(() => {
    setPlayError(false);
    setThumbState("idle");
    setReporting(false);
    setReason("");
    setReportState("idle");
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onIndex, index, hasPrev, hasNext]);

  const sendReport = async () => {
    setReportState("sending");
    try {
      await academiesApi.reportVideo(academyId, item.id, reason.trim());
      setReportState("sent");
    } catch (e) {
      setReportState(
        e instanceof ApiError ? e.message : "No se pudo enviar el reporte.",
      );
    }
  };

  const useFrame = async () => {
    const t = videoRef.current?.currentTime ?? 0;
    if (!url.data) return;
    setThumbState("saving");
    try {
      const jpg = await frameFromUrl(url.data.url, t);
      if (!jpg) {
        setThumbState(
          "Tu navegador no pudo sacar ese cuadro (suele pasar con videos HDR/HEVC del iPhone en Chrome). Prueba otro momento, o desde Safari o el celular.",
        );
        return;
      }
      await replaceThumbnail(academyId, item.id, jpg);
      setThumbState("done");
      onChanged?.();
    } catch (e) {
      setThumbState(
        e instanceof ApiError ? e.message : "No se pudo guardar la miniatura.",
      );
    }
  };

  const navBtn =
    "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-xl text-white hover:bg-black/80";

  return (
    // Contenedor con scroll y, adentro, un bloque min-h-full centrado: si el contenido
    // es más alto que la pantalla (video vertical en el celular) se desplaza entero,
    // sin que la parte de arriba quede fuera de alcance.
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80"
      onClick={onClose}
    >
      {/* ✕ fija: siempre visible, aunque el contenido se desplace (respeta la muesca del iPhone). */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed right-3 z-[60] flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-xl text-white shadow-lg ring-1 ring-white/20 hover:bg-black/90"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        ✕
      </button>
      <div className="flex min-h-full items-center justify-center p-2 pt-16 sm:p-4 sm:pt-4">
        <div
          className="w-full max-w-4xl space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3 shadow-xl sm:p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 sm:pr-10">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">
                {item.title}
                <span className="font-normal text-neutral-500">
                  {missingExtension(item)}
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                {[
                  item.classTitle,
                  item.recordedOn,
                  formatVideoDuration(item.durationMs),
                  `subido por ${item.uploadedByName}`,
                  items.length > 1 ? `${index + 1} de ${items.length}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg bg-black">
            {hasPrev && (
              <button
                type="button"
                className={`${navBtn} left-2`}
                onClick={() => onIndex(index - 1)}
                aria-label="Anterior"
              >
                ‹
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                className={`${navBtn} right-2`}
                onClick={() => onIndex(index + 1)}
                aria-label="Siguiente"
              >
                ›
              </button>
            )}
            {url.isLoading && (
              <div className="flex aspect-video items-center justify-center">
                <Spinner
                  label={isPhoto ? "Cargando foto…" : "Cargando video…"}
                />
              </div>
            )}
            {url.isError && (
              <p className="p-6 text-sm text-red-300">
                No se pudo cargar el archivo.
              </p>
            )}
            {url.data &&
              (isPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url.data.url}
                  alt={item.title}
                  className="mx-auto max-h-[65dvh] w-auto max-w-full object-contain sm:max-h-[75vh]"
                />
              ) : (
                <video
                  ref={videoRef}
                  key={url.data.url}
                  src={url.data.url}
                  poster={item.thumbUrl ?? undefined}
                  controls
                  autoPlay
                  playsInline
                  controlsList="nodownload"
                  onError={() => setPlayError(true)}
                  className="mx-auto max-h-[60dvh] w-full sm:max-h-[70vh]"
                />
              ))}
          </div>
          {playError && (
            <p className="text-xs text-amber-300">
              Tu navegador no puede reproducir este video (suele pasar con
              videos HEVC del iPhone en Chrome/Windows). Prueba en Safari o en
              el celular.
            </p>
          )}

          {manages && !isPhoto && url.data && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Button
                size="sm"
                variant="ghost"
                onClick={useFrame}
                disabled={thumbState === "saving"}
              >
                {thumbState === "saving"
                  ? "Guardando…"
                  : "📸 Usar este cuadro como miniatura"}
              </Button>
              <span className="text-neutral-500">
                {thumbState === "done"
                  ? "✓ Miniatura actualizada."
                  : thumbState === "idle" || thumbState === "saving"
                    ? "Pausa el video en el momento que quieras como portada."
                    : ""}
              </span>
              {thumbState !== "idle" &&
                thumbState !== "saving" &&
                thumbState !== "done" && (
                  <span className="w-full text-amber-300">{thumbState}</span>
                )}
            </div>
          )}

          {(item.style || item.description) && (
            <div className="space-y-1">
              {item.style && <StyleBadge style={item.style} />}
              {item.description && (
                <p className="whitespace-pre-line text-sm text-neutral-300">
                  {item.description}
                </p>
              )}
            </div>
          )}

          {onDownload && (
            <div className="flex flex-wrap items-center gap-2">
              {(isPhoto
                ? (["original"] as const)
                : hasMp4(item)
                  ? (["mp4", "original"] as const)
                  : (["original"] as const)
              ).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={f === "mp4" ? undefined : "ghost"}
                  disabled={downloading !== null}
                  onClick={async () => {
                    setDownloading(f);
                    try {
                      await onDownload(item.id, f);
                    } finally {
                      setDownloading(null);
                    }
                  }}
                >
                  {downloading === f
                    ? "Preparando…"
                    : f === "mp4"
                      ? "⬇ Descargar MP4 (se ve en todos lados)"
                      : `⬇ ${isPhoto ? "Descargar foto" : "Original"}`}
                </Button>
              ))}
              {manages && compatLabel(item) && (
                <span className="text-xs text-neutral-500">
                  {compatLabel(item)}
                </span>
              )}
            </div>
          )}

          {allowReport && (
            <div className="border-t border-neutral-800 pt-3 text-xs">
              {reportState === "sent" ? (
                <p className="text-neutral-400">Gracias. Lo revisaremos.</p>
              ) : reporting ? (
                <div className="space-y-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    className={textareaClass}
                    placeholder="¿Por qué lo reportas? Ej.: aparezco sin haber dado permiso."
                  />
                  {reportState !== "idle" && reportState !== "sending" && (
                    <p className="text-red-300">{reportState}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={sendReport}
                      disabled={
                        reason.trim().length < 5 || reportState === "sending"
                      }
                    >
                      Enviar reporte
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReporting(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setReporting(true)}
                  className="text-neutral-500 hover:text-red-300"
                >
                  ⚑ Reportar {isPhoto ? "foto" : "video"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
