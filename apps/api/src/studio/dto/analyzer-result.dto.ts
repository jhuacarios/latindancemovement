import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsNumber,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  type InstrumentKey,
  SONG_MARKER_TYPES,
  SONG_SECTION_TYPES,
  type SongMarkerType,
  type SongSectionType,
} from '@baile-latino/types';

/** Respuesta del analizador Python (apps/analyzer/app/schemas.py). Se valida antes de guardarla. */

export class AnalyzerEnergyDto {
  @IsInt() @IsPositive() stepMs!: number;
  @IsArray() @IsNumber({}, { each: true }) values!: number[];
}

export class AnalyzerSectionDto {
  @IsIn(SONG_SECTION_TYPES) type!: SongSectionType;
  @IsInt() @Min(0) startMs!: number;
  @IsInt() @Min(0) endMs!: number;
}

export class AnalyzerMarkerDto {
  @IsIn(SONG_MARKER_TYPES) type!: SongMarkerType;
  @IsInt() @Min(0) timeMs!: number;
}

export class AnalyzerResultDto {
  @IsString() analyzerVersion!: string;
  @IsInt() @Min(0) durationMs!: number;
  @IsNumber() @IsPositive() bpm!: number;
  @IsArray() @IsInt({ each: true }) beatsMs!: number[];
  @IsArray() @IsInt({ each: true }) downbeatsMs!: number[];
  @IsInt() @Min(0) firstBeatOffsetMs!: number;

  @ValidateNested() @Type(() => AnalyzerEnergyDto) energy!: AnalyzerEnergyDto;

  @IsArray() @ValidateNested({ each: true }) @Type(() => AnalyzerSectionDto)
  sections!: AnalyzerSectionDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => AnalyzerMarkerDto)
  markers!: AnalyzerMarkerDto[];

  @IsArray() @IsInt({ each: true }) fingerprint!: number[];
}

/** Respuesta de /instruments. Las pistas se validan una por una en AnalyzerClient. */
export class AnalyzerInstrumentsDto {
  @IsString() analyzerVersion!: string;
  @IsInt() @Min(0) durationMs!: number;
  @IsInt() @IsPositive() stepMs!: number;
  @IsObject() tracks!: Record<InstrumentKey, number[]>;
}
