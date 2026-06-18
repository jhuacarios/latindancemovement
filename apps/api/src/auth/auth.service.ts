import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type {
  AuthTokens,
  DanceStyle,
  JwtPayload,
  PublicUser,
  UserRole,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  city: string | null;
  instagramHandle: string | null;
  styles: string;
  createdAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('El email ya está registrado');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        role: dto.role ?? 'BAILARIN',
        city: dto.city ?? null,
        instagramHandle: dto.instagramHandle ?? null,
        styles: (dto.styles ?? []).join(','),
      },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role as UserRole);
    return { user: this.toPublicUser(user), tokens };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    const tokens = await this.issueTokens(user.id, user.email, user.role as UserRole);
    return { user: this.toPublicUser(user), tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Sesión no válida');
    }
    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) throw new UnauthorizedException('Refresh token no reconocido');

    return this.issueTokens(user.id, user.email, user.role as UserRole);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.toPublicUser(user);
  }

  private async issueTokens(
    id: string,
    email: string,
    role: UserRole,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: id, email, role };

    // @nestjs/jwt 11 tipa expiresIn como number | StringValue; los valores vienen
    // de env (string), así que casteamos al tipo que espera la opción.
    const accessExpires = (process.env.JWT_ACCESS_EXPIRES_IN ??
      '15m') as JwtSignOptions['expiresIn'];
    const refreshExpires = (process.env.JWT_REFRESH_EXPIRES_IN ??
      '7d') as JwtSignOptions['expiresIn'];

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET ?? 'dev-secret',
      expiresIn: accessExpires,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
      expiresIn: refreshExpires,
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken };
  }

  private toPublicUser(user: UserRecord): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      city: user.city,
      instagramHandle: user.instagramHandle,
      styles: user.styles
        ? (user.styles.split(',').filter(Boolean) as DanceStyle[])
        : [],
      createdAt: user.createdAt.toISOString(),
    };
  }
}
