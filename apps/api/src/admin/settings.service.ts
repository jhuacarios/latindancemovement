import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SINGLETON = 'singleton';

export interface SiteSettingsInfo {
  siteName: string | null;
  hasLogo: boolean;
  logoMime: string | null;
  logoUpdatedAt: string | null;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async get() {
    // Tolerante a que la tabla aún no exista (deploy de código antes que la
    // migración): devuelve null en vez de tirar 500.
    try {
      return await this.prisma.siteSetting.findUnique({
        where: { id: SINGLETON },
      });
    } catch {
      return null;
    }
  }

  async info(): Promise<SiteSettingsInfo> {
    const s = await this.get();
    return {
      siteName: s?.siteName ?? null,
      hasLogo: Boolean(s?.logoData),
      logoMime: s?.logoMime ?? null,
      logoUpdatedAt: s?.updatedAt?.toISOString() ?? null,
    };
  }

  async getLogo(): Promise<{ buffer: Buffer; mime: string } | null> {
    const s = await this.get();
    if (!s?.logoData || !s.logoMime) return null;
    return { buffer: Buffer.from(s.logoData, 'base64'), mime: s.logoMime };
  }

  async setLogo(buffer: Buffer, mime: string): Promise<SiteSettingsInfo> {
    const logoData = buffer.toString('base64');
    await this.prisma.siteSetting.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, logoData, logoMime: mime },
      update: { logoData, logoMime: mime },
    });
    return this.info();
  }

  async clearLogo(): Promise<SiteSettingsInfo> {
    await this.prisma.siteSetting.updateMany({
      where: { id: SINGLETON },
      data: { logoData: null, logoMime: null },
    });
    return this.info();
  }
}
