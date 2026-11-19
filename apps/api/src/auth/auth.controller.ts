import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { GoogleExchangeDto } from './dto/google-exchange.dto';
import { StylePreferenceDto } from './dto/style-preference.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  /** Guarda la preferencia de baile (modal de bienvenida y perfil). */
  @Patch('me/style-preference')
  @UseGuards(JwtAuthGuard)
  setStylePreference(
    @CurrentUser() user: AuthUser,
    @Body() dto: StylePreferenceDto,
  ) {
    return this.auth.setStylePreference(user.id, dto.stylePreference);
  }

  /** Edita el perfil propio (apellido, RUT). */
  @Patch('me/profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  // --- Login con Google -----------------------------------------------------
  /**
   * Redirige al consentimiento de Google. `?app=<url>` = login desde la app móvil:
   * al terminar vuelve a esa URL (solo prefijos permitidos) en vez de a la web.
   */
  @Get('google')
  async google(@Query('app') app: string | undefined, @Res() reply: FastifyReply) {
    const url = await this.auth.buildGoogleAuthUrl(app || undefined);
    reply.header('location', url).code(302).send();
  }

  /** Callback de Google: vincula/crea y vuelve al front con un código de un solo uso. */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() reply: FastifyReply,
  ) {
    // WEB_URL puede traer varias URLs separadas por coma (CORS); para redirigir
    // usamos solo la primera (la principal).
    const web = (process.env.WEB_URL ?? 'http://localhost:3001')
      .split(',')[0]
      .trim();
    // Si el login empezó en la app móvil, se vuelve a la app (no a la web).
    const app = await this.auth.returnToForState(state);
    const back = (q: string) =>
      app ? `${app}${app.includes('?') ? '&' : '?'}${q}` : `${web}/auth/google?${q}`;
    try {
      if (error) throw new Error(error);
      if (!code || !state) throw new Error('Faltan parámetros.');
      const oneTime = await this.auth.handleGoogleCallback(code, state);
      reply.header('location', back(`code=${oneTime}`)).code(302).send();
    } catch {
      reply.header('location', back('error=1')).code(302).send();
    }
  }

  /** Canjea el código de un solo uso por la sesión (user + tokens). */
  @Post('google/exchange')
  @HttpCode(200)
  googleExchange(@Body() dto: GoogleExchangeDto) {
    return this.auth.exchangeGoogleCode(dto.code);
  }
}
