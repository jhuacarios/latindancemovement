import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
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

    // Cuentas solo-Google no tienen contraseña: no se puede entrar con password.
    const ok = user.passwordHash
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : false;
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

  // --- Login con Google -----------------------------------------------------
  get googleConfigured(): boolean {
    return Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
  }

  private googleRedirectUri(): string {
    return (
      process.env.GOOGLE_LOGIN_REDIRECT_URI ??
      'http://localhost:3000/api/v1/auth/google/callback'
    );
  }

  /** URL de consentimiento de Google (con state anti-CSRF). */
  async buildGoogleAuthUrl(): Promise<string> {
    if (!this.googleConfigured) {
      throw new BadRequestException(
        'Falta configurar GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET.',
      );
    }
    const state = randomBytes(16).toString('hex');
    await this.prisma.setting.upsert({
      where: { key: `gauth_state:${state}` },
      create: { key: `gauth_state:${state}`, value: String(Date.now()) },
      update: { value: String(Date.now()) },
    });
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
      redirect_uri: this.googleRedirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Procesa el callback de Google: valida el state, obtiene el perfil, resuelve
   * (vincula/crea) el usuario y devuelve un código de un solo uso para que el
   * frontend canjee la sesión (así no viajan tokens en la URL).
   */
  async handleGoogleCallback(code: string, state: string): Promise<string> {
    const stateRow = await this.prisma.setting.findUnique({
      where: { key: `gauth_state:${state}` },
    });
    if (!stateRow) throw new BadRequestException('State inválido o expirado.');
    await this.prisma.setting
      .delete({ where: { key: `gauth_state:${state}` } })
      .catch(() => undefined);
    if (Date.now() - Number(stateRow.value) > 10 * 60_000) {
      throw new BadRequestException('State expirado.');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET as string,
        redirect_uri: this.googleRedirectUri(),
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new BadRequestException('Google rechazó el intercambio del código.');
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw new BadRequestException('Google no devolvió un token de acceso.');
    }

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!infoRes.ok) {
      throw new BadRequestException('No se pudo leer el perfil de Google.');
    }
    const info = (await infoRes.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!info.email || info.email_verified === false) {
      throw new BadRequestException(
        'Tu cuenta de Google no tiene un email verificado.',
      );
    }

    const email = info.email.toLowerCase();
    const name = info.name?.trim() || email.split('@')[0];
    const userId = await this.resolveGoogleUser(info.sub, email, name);

    const oneTime = randomBytes(24).toString('hex');
    await this.prisma.setting.upsert({
      where: { key: `glogin:${oneTime}` },
      create: { key: `glogin:${oneTime}`, value: JSON.stringify({ userId, ts: Date.now() }) },
      update: { value: JSON.stringify({ userId, ts: Date.now() }) },
    });
    return oneTime;
  }

  /** Vincula a una cuenta existente o crea una nueva, con precaución anti-secuestro. */
  private async resolveGoogleUser(
    googleId: string,
    email: string,
    name: string,
  ): Promise<string> {
    // 1) Ya vinculado por googleId.
    const byGoogle = await this.prisma.user.findUnique({ where: { googleId } });
    if (byGoogle) return byGoogle.id;

    // 2) Existe por email -> vincular.
    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      const data: Prisma.UserUpdateInput = { googleId, emailVerified: true };
      // PRECAUCIÓN anti-secuestro: como NO verificamos emails al registrarse, la
      // contraseña de una cuenta no verificada pudo ponerla un impostor que
      // registró este email antes. Google acaba de probar que quien entra es el
      // dueño real, así que tomamos control: anulamos esa contraseña no confiable
      // e invalidamos sesiones previas (refresh tokens) del posible impostor.
      if (!byEmail.emailVerified) {
        data.passwordHash = null;
        data.refreshTokenHash = null;
      }
      await this.prisma.user.update({ where: { id: byEmail.id }, data });
      return byEmail.id;
    }

    // 3) No existe -> cuenta nueva solo-Google (sin contraseña, email verificado).
    const created = await this.prisma.user.create({
      data: { email, name, googleId, emailVerified: true, role: 'BAILARIN', styles: '' },
    });
    return created.id;
  }

  /** Canjea el código de un solo uso por la sesión (user + tokens). */
  async exchangeGoogleCode(
    code: string,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const row = await this.prisma.setting.findUnique({
      where: { key: `glogin:${code}` },
    });
    if (!row) throw new UnauthorizedException('Código inválido o ya usado.');
    await this.prisma.setting
      .delete({ where: { key: `glogin:${code}` } })
      .catch(() => undefined);

    const { userId, ts } = JSON.parse(row.value) as { userId: string; ts: number };
    if (Date.now() - ts > 2 * 60_000) {
      throw new UnauthorizedException('Código expirado.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const tokens = await this.issueTokens(user.id, user.email, user.role as UserRole);
    return { user: this.toPublicUser(user), tokens };
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
