import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildTrackUrl } from '../track-url.util';
import { normalizeSearch } from '../search.util';
import type { TrackSource } from '@baile-latino/types';
import { QueryTracksDto } from './dto/query-tracks.dto';

@Injectable()
export class TracksExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Genera un .xlsx con el catálogo de canciones (respeta los filtros). */
  async toExcelBuffer(q: QueryTracksDto): Promise<Buffer> {
    const where: Prisma.TrackWhereInput = { scope: 'CATALOG' };
    if (q.style) where.style = q.style;
    if (q.substyle)
      where.substyle = { contains: q.substyle, mode: 'insensitive' };
    if (q.source) where.source = q.source;
    if (q.approvalStatus) where.approvalStatus = q.approvalStatus;
    if (q.isRelease !== undefined) where.isRelease = q.isRelease;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { artist: { contains: q.search, mode: 'insensitive' } },
        { searchText: { contains: normalizeSearch(q.search) } },
      ];
    }

    const tracks = await this.prisma.track.findMany({
      where,
      orderBy: [{ style: 'asc' }, { artist: 'asc' }, { title: 'asc' }],
    });

    const wb = new Workbook();
    wb.creator = 'Baile Latino Platform';
    const ws = wb.addWorksheet('Canciones');

    ws.columns = [
      { header: 'Título', key: 'title', width: 36 },
      { header: 'Artista', key: 'artist', width: 28 },
      { header: 'Estilo', key: 'style', width: 12 },
      { header: 'Sub-estilos', key: 'substyles', width: 28 },
      { header: 'Año', key: 'year', width: 8 },
      { header: 'Duración (s)', key: 'durationSec', width: 12 },
      { header: 'Fuente', key: 'source', width: 10 },
      { header: 'Link', key: 'url', width: 50 },
      { header: 'Estado', key: 'approvalStatus', width: 20 },
      { header: 'Novedad', key: 'isRelease', width: 10 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const t of tracks) {
      const url = buildTrackUrl(t.source as TrackSource, t.sourceId);
      const row = ws.addRow({
        title: t.title,
        artist: t.artist,
        style: t.style,
        substyles: t.substyle ?? '',
        year: t.year ?? '',
        durationSec: t.durationSec ?? '',
        source: t.source,
        url,
        approvalStatus: t.approvalStatus,
        isRelease: t.isRelease ? 'Sí' : 'No',
      });
      // Hipervínculo clickeable en la columna Link.
      row.getCell('url').value = { text: url, hyperlink: url };
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** Plantilla vacía con encabezados y una fila de ejemplo, para importar. */
  async toTemplateBuffer(): Promise<Buffer> {
    const wb = new Workbook();
    wb.creator = 'Baile Latino Platform';
    const ws = wb.addWorksheet('Canciones');

    ws.columns = [
      { header: 'Título', key: 'title', width: 36 },
      { header: 'Artista', key: 'artist', width: 28 },
      { header: 'Estilo', key: 'style', width: 12 },
      { header: 'Sub-estilos', key: 'substyles', width: 28 },
      { header: 'Año', key: 'year', width: 8 },
      { header: 'Link', key: 'link', width: 50 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    ws.addRow({
      title: 'Propuesta Indecente',
      artist: 'Romeo Santos',
      style: 'BACHATA',
      substyles: 'Sensual, Romántica',
      year: 2013,
      link: 'https://www.youtube.com/watch?v=e_Vym6fEPdo',
    });

    // Hoja de ayuda con los valores válidos.
    const help = wb.addWorksheet('Ayuda');
    help.addRow(['Columna', 'Obligatoria', 'Valores / formato']);
    help.getRow(1).font = { bold: true };
    help.addRows([
      ['Título', 'Sí', 'Texto'],
      ['Artista', 'Sí', 'Texto'],
      ['Estilo', 'Sí', 'BACHATA | SALSA'],
      ['Sub-estilos', 'No', 'Uno o varios separados por coma (ej: Sensual, Romántica). Deben existir en el vocabulario del estilo. Máx 4.'],
      ['Año', 'No', 'Número (ej: 2013)'],
      ['Link', 'Sí', 'URL de Spotify o YouTube'],
    ]);
    help.getColumn(1).width = 14;
    help.getColumn(2).width = 12;
    help.getColumn(3).width = 70;

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
