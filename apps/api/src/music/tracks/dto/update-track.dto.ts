import { PartialType } from '@nestjs/mapped-types';
import { CreateTrackDto } from './create-track.dto';

/** Todos los campos opcionales. Si viene `link`, se re-resuelve source/sourceId. */
export class UpdateTrackDto extends PartialType(CreateTrackDto) {}
