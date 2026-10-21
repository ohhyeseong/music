import 'reflect-metadata';
import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  ForbiddenException,
  Get,
  HttpException,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Auth, AccessGuard, AuthedRequest } from './auth.js';
import { Catalog } from './catalog/catalog.js';
import { Database } from './db.js';
import { Playlists } from './playlists.js';

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'INVALID_INPUT',
      message: result.error.issues.map((i) => i.message).join(' / '),
    });
  return result.data;
}
const idSchema = z.string().uuid('ID 형식을 확인해 주세요.');
const id = (s: string) => parse(idSchema, s);
const credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('이메일 형식을 확인해 주세요.')),
  password: z.string().min(10, '비밀번호는 10자 이상 입력해 주세요.').max(128),
});
const playlistInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
});

@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const raw = error instanceof HttpException ? error.getResponse() : null;
    const detail =
      raw && typeof raw === 'object'
        ? (raw as { message?: string | string[]; code?: string })
        : null;
    const message =
      detail?.message || (typeof raw === 'string' ? raw : '요청을 처리하지 못했습니다.');
    response.status(status).json({
      code:
        detail?.code ||
        (
          {
            400: 'INVALID_INPUT',
            401: 'UNAUTHORIZED',
            403: 'FORBIDDEN',
            404: 'NOT_FOUND',
            409: 'CONFLICT',
            429: 'RATE_LIMITED',
            503: 'UNAVAILABLE',
          } as Record<number, string>
        )[status] ||
        'INTERNAL_ERROR',
      message: Array.isArray(message) ? message.join(' / ') : message,
      requestId: randomUUID(),
    });
  }
}
@Controller('v1')
class PublicController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Catalog) private readonly catalog: Catalog,
  ) {}
  @Get('health/live') live() {
    return { status: 'ok' };
  }
  @Get('health/ready') async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ok', catalogMode: this.catalog.mode };
    } catch {
      throw new ServiceUnavailableException('DB 연결을 확인해 주세요.');
    }
  }
  @Get('search/tracks') search(@Query() input: unknown) {
    const q = parse(
      z.object({
        q: z.string().trim().max(120).default(''),
        cursor: z.coerce.number().int().min(0).max(10000).default(0),
      }),
      input,
    );
    return this.catalog.search(q.q, q.cursor);
  }
  @Get('tracks/:id') track(@Param('id') value: string) {
    return this.catalog.get(id(value));
  }
  @Post('tracks/:id/enrich') enrich(@Param('id') value: string) {
    return this.catalog.enrich(id(value));
  }
  @Get('tracks/:id/recommendations') recommendations(
    @Param('id') value: string,
    @Query('mode') mode: unknown,
  ) {
    return this.catalog.recommendations(
      id(value),
      parse(z.enum(['balanced', 'genre', 'mood']).default('balanced'), mode),
    );
  }
}
@Controller('v1/auth')
class AuthController {
  constructor(@Inject(Auth) private readonly auth: Auth) {}
  private checkOrigin(req: Request) {
    if (req.headers.origin !== process.env.WEB_ORIGIN)
      throw new ForbiddenException('허용되지 않은 요청 출처입니다.');
  }
  private send(
    response: Response,
    result: { user: unknown; accessToken: string; refreshToken: string },
  ) {
    response.cookie('gyeol_refresh', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 30 * 86400000,
    });
    return { user: result.user, accessToken: result.accessToken };
  }
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.checkOrigin(req);
    const input = parse(
      credentials.extend({ displayName: z.string().trim().min(1).max(40) }),
      body,
    );
    return this.send(
      response,
      await this.auth.register(input.email, input.password, input.displayName),
    );
  }
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.checkOrigin(req);
    const input = parse(credentials, body);
    return this.send(response, await this.auth.login(input.email, input.password));
  }
  @Post('refresh') async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.checkOrigin(req);
    return this.send(response, await this.auth.refresh(req.cookies?.gyeol_refresh));
  }
  @Post('logout') async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.checkOrigin(req);
    await this.auth.logout(req.cookies?.gyeol_refresh);
    response.clearCookie('gyeol_refresh', {
      path: '/v1/auth',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
    return { ok: true };
  }
  @Get('me') @UseGuards(AccessGuard) me(@Req() req: AuthedRequest) {
    return this.auth.me(req.user.id);
  }
  @Post('native/register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  nativeRegister(@Body() body: unknown) {
    const p = parse(credentials.extend({ displayName: z.string().trim().min(1).max(40) }), body);
    return this.auth.register(p.email, p.password, p.displayName, 'native');
  }
  @Post('native/login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  nativeLogin(@Body() body: unknown) {
    const p = parse(credentials, body);
    return this.auth.login(p.email, p.password, 'native');
  }
  @Post('native/refresh') nativeRefresh(@Body() body: unknown) {
    const p = parse(z.object({ refreshToken: z.string().min(1).max(200) }), body);
    return this.auth.refresh(p.refreshToken, 'native');
  }
  @Post('native/logout') async nativeLogout(@Body() body: unknown) {
    const p = parse(z.object({ refreshToken: z.string().min(1).max(200) }), body);
    await this.auth.logout(p.refreshToken);
    return { ok: true };
  }
}
@Controller('v1/playlists')
@UseGuards(AccessGuard)
class PlaylistController {
  constructor(@Inject(Playlists) private readonly playlists: Playlists) {}
  @Get() list(@Req() req: AuthedRequest) {
    return this.playlists.list(req.user.id);
  }
  @Post() create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const p = parse(
      playlistInput.extend({ trackIds: z.array(idSchema).max(30).default([]) }),
      body,
    );
    return this.playlists.create(req.user.id, p.name, p.description, p.trackIds);
  }
  @Get(':id') get(@Req() req: AuthedRequest, @Param('id') value: string) {
    return this.playlists.get(req.user.id, id(value));
  }
  @Patch(':id') update(
    @Req() req: AuthedRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const p = parse(playlistInput.extend({ version: z.number().int().min(0) }), body);
    return this.playlists.update(req.user.id, id(value), p.name, p.description, p.version);
  }
  @Delete(':id') remove(@Req() req: AuthedRequest, @Param('id') value: string) {
    return this.playlists.remove(req.user.id, id(value));
  }
  @Post(':id/tracks') add(
    @Req() req: AuthedRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const p = parse(z.object({ trackId: idSchema }), body);
    return this.playlists.add(req.user.id, id(value), p.trackId);
  }
  @Delete(':id/tracks/:trackId') deleteTrack(
    @Req() req: AuthedRequest,
    @Param('id') value: string,
    @Param('trackId') trackId: string,
  ) {
    return this.playlists.deleteTrack(req.user.id, id(value), id(trackId));
  }
  @Put(':id/order') order(
    @Req() req: AuthedRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const p = parse(
      z.object({ trackIds: z.array(idSchema).max(200), version: z.number().int().min(0) }),
      body,
    );
    return this.playlists.order(req.user.id, id(value), p.trackIds, p.version);
  }
}
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m', issuer: 'gyeol', audience: 'gyeol-client' },
      verifyOptions: { issuer: 'gyeol', audience: 'gyeol-client' },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
  ],
  controllers: [PublicController, AuthController, PlaylistController],
  providers: [
    Database,
    Catalog,
    Auth,
    AccessGuard,
    Playlists,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: Errors },
  ],
})
export class AppModule {}
