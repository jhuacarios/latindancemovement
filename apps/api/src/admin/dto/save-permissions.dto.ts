import { IsObject } from 'class-validator';
import type { PermissionsMatrix } from '@baile-latino/types';

export class SavePermissionsDto {
  @IsObject()
  matrix!: PermissionsMatrix;
}
