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

  // --- Login con Google -----------------------------------------------------
  /** Redirige al consentimiento de Google. */
  @Get('google')
  async google(@Res() reply: FastifyReply) {
    const url = await this.auth.buildGoogleAuthUrl();
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
    try {
      if (error) throw new Error(error);
      if (!code || !state) throw new Error('Faltan parámetros.');
      const oneTime = await this.auth.handleGoogleCallback(code, state);
      reply.header('location', `${web}/auth/google?code=${oneTime}`).code(302).send();
    } catch {
      reply.header('location', `${web}/auth/google?error=1`).code(302).send();
    }
  }

  /** Canjea el código de un solo uso por la sesión (user + tokens). */
  @Post('google/exchange')
  @HttpCode(200)
  googleExchange(@Body() dto: GoogleExchangeDto) {
    return this.auth.exchangeGoogleCode(dto.code);
  }
}
