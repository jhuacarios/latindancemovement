import { Injectable } from '@nestjs/common';
import type { PermissionsMatrix } from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';

const KEY = 'role_module_permissions';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PermissionsMatrix> {
    const row = await this.prisma.setting.findUnique({ where: { key: KEY } });
    if (!row) return {};
    try {
      return JSON.parse(row.value) as PermissionsMatrix;
    } catch {
      return {};
    }
  }

  async set(matrix: PermissionsMatrix): Promise<PermissionsMatrix> {
    const value = JSON.stringify(matrix ?? {});
    await this.prisma.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value },
      update: { value },
    });
    return matrix ?? {};
  }
}
