import { BadRequestException, Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import {
  DANCE_STYLES,
  DANCE_SUBSTYLES,
  type DanceStyle,
  type DanceSubstyle,
  type ExcelImportResult,
} from '@baile-latino/types';
import { CreateTrackDto } from './dto/create-track.dto';
import { TracksService } from './tracks.service';

/** Encabezados aceptados por campo (normalizados: minúscula, sin acentos). */
const HEADER_ALIASES: Record<string, string[]> = {
  title: ['titulo', 'title', 'nombre', 'cancion', 'tema'],
  artist: ['artista', 'artist', 'interprete'],
  style: ['estilo', 'style', 'genero'],
  substyle: ['subestilo', 'sub estilo', 'substyle'],
  bpm: ['bpm', 'tempo'],
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

    const dtos: CreateTrackDto[] = [];
    const excelRows: number[] = [];
    const parseErrors: { row: number; reason: string }[] = [];
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
        parseErrors.push({ row: rowNumber, reason: 'Falta título o artista' });
        return;
      }
      if (!style) {
        parseErrors.push({
          row: rowNumber,
          reason: `Estilo inválido: "${rawStyle}" (usa BACHATA o SALSA)`,
        });
        return;
      }

      const dto: CreateTrackDto = {
        title,
        artist,
        style,
        substyle: this.parseSubstyle(get(cols.substyle)),
        bpm: this.parseNum(get(cols.bpm)),
        year: this.parseNum(get(cols.year)),
        durationSec: this.parseNum(get(cols.durationSec)),
        link: get(cols.link) || undefined,
        source: this.parseSource(get(cols.source)),
        sourceId: get(cols.sourceId) || undefined,
      };
      dtos.push(dto);
      excelRows.push(rowNumber);
    });

    const res = await this.tracks.importMany(dtos, userId);
    const importErrors = res.errors.map((e) => ({
      row: excelRows[e.index] ?? 0,
      reason: e.reason,
    }));

    return {
      totalRows,
      created: res.created,
      updated: res.updated,
      errors: [...parseErrors, ...importErrors].sort((a, b) => a.row - b.row),
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

  private parseSubstyle(raw: string): DanceSubstyle | undefined {
    if (!raw) return undefined;
    const n = normalize(raw).toUpperCase().replace(/[\s-]+/g, '_');
    return (DANCE_SUBSTYLES as readonly string[]).includes(n)
      ? (n as DanceSubstyle)
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
