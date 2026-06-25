import { BadRequestException, Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import {
  DANCE_STYLES,
  type DanceStyle,
  type ExcelImportResult,
} from '@baile-latino/types';
import { CreateTrackDto } from './dto/create-track.dto';
import { TracksService } from './tracks.service';

/** Encabezados aceptados por campo (normalizados: minúscula, sin acentos). */
const HEADER_ALIASES: Record<string, string[]> = {
  title: ['titulo', 'title', 'nombre', 'cancion', 'tema'],
  artist: ['artista', 'artist', 'interprete'],
  style: ['estilo', 'style', 'genero'],
  substyles: ['subestilos', 'sub estilos', 'sub-estilos', 'subestilo', 'tags', 'etiquetas'],
  year: ['ano', 'year', 'anio'],
  link: ['link', 'url', 'enlace'],
  source: ['fuente', 'source'],
  sourceId: ['sourceid', 'source id', 'id'],
  durationSec: ['duracion', 'duration', 'duracion (s)', 'durationsec', 'segundos'],
};

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos/diacríticos
    .trim()
    .toLowerCase();
}

interface ParsedRow {
  dto: CreateTrackDto;
  excelRow: number;
}

@Injectable()
export class TracksImportExcelService {
  constructor(private readonly tracks: TracksService) {}

  async importBuffer(buffer: Buffer, userId: string): Promise<ExcelImportResult> {
    const wb = new Workbook();
    try {
      // exceljs tipa Buffer (no genérico); @types/node 24 usa Buffer<ArrayBufferLike>.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('El archivo no es un Excel válido (.xlsx).');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El Excel no tiene hojas.');

    const cols = this.detectColumns(ws.getRow(1).values as unknown[]);
    if (cols.title === undefined || cols.artist === undefined || cols.style === undefined) {
      throw new BadRequestException(
        'Faltan columnas obligatorias: Título, Artista y Estilo.',
      );
    }

    const rows: ParsedRow[] = [];
    const errors: { row: number; reason: string }[] = [];
    let totalRows = 0;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // encabezado
      const get = (c: number | undefined) =>
        c === undefined ? '' : String(row.getCell(c).text ?? '').trim();

      const title = get(cols.title);
      const artist = get(cols.artist);
      const rawStyle = get(cols.style);
      if (!title && !artist && !rawStyle) return; // fila vacía
      totalRows++;

      const style = this.parseStyle(rawStyle);
      if (!title || !artist) {
        errors.push({ row: rowNumber, reason: 'Falta título o artista' });
        return;
      }
      if (!style) {
        errors.push({
          row: rowNumber,
          reason: `Estilo inválido: "${rawStyle}" (usa BACHATA o SALSA)`,
        });
        return;
      }

      rows.push({
        dto: {
          title,
          artist,
          style,
          substyles: get(cols.substyles)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          year: this.parseNum(get(cols.year)),
          durationSec: this.parseNum(get(cols.durationSec)),
          link: get(cols.link) || undefined,
          source: this.parseSource(get(cols.source)),
          sourceId: get(cols.sourceId) || undefined,
        },
        excelRow: rowNumber,
      });
    });

    let created = 0;
    let updated = 0;
    for (const r of rows) {
      try {
        const res = await this.tracks.upsertCatalog(r.dto, userId);
        if (res.created) created++;
        else updated++;
      } catch (e) {
        errors.push({
          row: r.excelRow,
          reason: e instanceof Error ? e.message : 'error desconocido',
        });
      }
    }

    return {
      totalRows,
      created,
      updated,
      errors: errors.sort((a, b) => a.row - b.row),
    };
  }

  private detectColumns(headerValues: unknown[]): Record<string, number | undefined> {
    const map: Record<string, number | undefined> = {};
    headerValues.forEach((val, idx) => {
      if (val == null) return;
      const norm = normalize(String(val));
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.includes(norm) && map[field] === undefined) {
          map[field] = idx;
        }
      }
    });
    return map;
  }

  private parseStyle(raw: string): DanceStyle | undefined {
    const n = normalize(raw).toUpperCase();
    return (DANCE_STYLES as readonly string[]).includes(n)
      ? (n as DanceStyle)
      : undefined;
  }

  private parseSource(raw: string): 'SPOTIFY' | 'YOUTUBE' | undefined {
    const n = normalize(raw).toUpperCase();
    return n === 'SPOTIFY' || n === 'YOUTUBE' ? n : undefined;
  }

  private parseNum(raw: string): number | undefined {
    if (!raw) return undefined;
    const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : undefined;
  }
}
