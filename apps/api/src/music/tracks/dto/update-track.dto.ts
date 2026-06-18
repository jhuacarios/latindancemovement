import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateTrackDto } from './create-track.dto';

/** Todos los campos opcionales, salvo que no se permite re-resolver por link. */
export class UpdateTrackDto extends PartialType(
  OmitType(CreateTrackDto, ['link'] as const),
) {}
