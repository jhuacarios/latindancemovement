'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ExcelImportResult } from '@baile-latino/types';
import { ApiError, downloadFile, uploadFile } from '@/lib/api';
import { Button, Card, Spinner } from '@/components/ui';

export default function CatalogPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ExcelImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    setUploading(true);
    try {
      const res = await uploadFile<ExcelImportResult>(
        '/music/tracks/import-excel',
        file,
      );
      setResult(res);
      void qc.invalidateQueries({ queryKey: ['tracks'] });
      void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo importar');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">📚 Catálogo</h1>
        <p className="text-sm text-neutral-400">
          Importa y exporta tu catálogo de canciones por Excel.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="font-semibold">1. Descarga la plantilla</div>
          <p className="mt-1 text-sm text-neutral-400">
            Excel con las columnas correctas y una fila de ejemplo.
          </p>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() =>
              downloadFile(
                '/music/tracks/template.xlsx',
                'plantilla-canciones.xlsx',
              )
            }
          >
            ⬇ Plantilla
          </Button>
        </Card>

        <Card>
          <div className="font-semibold">2. Sube tu Excel</div>
          <p className="mt-1 text-sm text-neutral-400">
            Carga masiva (crea o actualiza por link/fuente).
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
          <Button
            className="mt-3"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Importando…' : '⬆ Subir Excel'}
          </Button>
        </Card>

        <Card>
          <div className="font-semibold">3. Exporta el catálogo</div>
          <p className="mt-1 text-sm text-neutral-400">
            Descarga todas las canciones actuales en Excel.
          </p>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() =>
              downloadFile('/music/tracks/export.xlsx', 'canciones.xlsx')
            }
          >
            ⬇ Exportar
          </Button>
        </Card>
      </div>

      {uploading && (
        <Card>
          <Spinner label={`Procesando ${fileName ?? 'archivo'}…`} />
        </Card>
      )}

      {error && (
        <Card className="border-red-500/40">
          <p className="text-sm text-red-300">{error}</p>
        </Card>
      )}

      {result && (
        <Card>
          <div className="mb-3 flex flex-wrap gap-4 text-sm">
            <span className="text-neutral-400">
              Filas leídas: <b className="text-neutral-100">{result.totalRows}</b>
            </span>
            <span className="text-emerald-300">Creadas: {result.created}</span>
            <span className="text-sky-300">Actualizadas: {result.updated}</span>
            <span className="text-red-300">Errores: {result.errors.length}</span>
          </div>

          {result.errors.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-800 text-left text-neutral-400">
                  <tr>
                    <th className="px-3 py-2 w-20">Fila</th>
                    <th className="px-3 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-b border-neutral-800/60 last:border-0">
                      <td className="px-3 py-2 text-neutral-400">{e.row}</td>
                      <td className="px-3 py-2 text-red-300">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.errors.length === 0 && (
            <p className="text-sm text-emerald-300">
              ✓ Importación completada sin errores.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
