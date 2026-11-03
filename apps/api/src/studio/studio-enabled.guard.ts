import { CanActivate, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { STUDIO_CONFIG, type StudioConfig } from './studio.config';

/** Corta con 503 si el módulo Estudio no está configurado (ver studio.config.ts). */
@Injectable()
export class StudioEnabledGuard implements CanActivate {
  constructor(@Inject(STUDIO_CONFIG) private readonly config: StudioConfig | null) {}

  canActivate(): boolean {
    if (!this.config) {
      throw new ServiceUnavailableException('El Estudio todavía no está disponible en este entorno.');
    }
    return true;
  }
}
