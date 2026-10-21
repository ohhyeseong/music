import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import * as argon from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import { Database } from './db.js';

export type AuthedRequest = Request & { user: { id: string; sessionId: string } };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const publicUser = (u: { id: string; email: string; displayName: string }) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
});
@Injectable()
export class Auth {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}
  async register(email: string, password: string, displayName: string, clientType = 'web') {
    try {
      const user = await this.db.user.create({
        data: {
          email,
          passwordHash: await argon.hash(password, { type: argon.argon2id }),
          displayName,
        },
      });
      return this.issue(user, clientType);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('이미 사용 중인 이메일입니다.');
      throw error;
    }
  }
  async login(email: string, password: string, clientType = 'web') {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || !(await argon.verify(user.passwordHash, password)))
      throw new UnauthorizedException('이메일 또는 비밀번호를 확인해 주세요.');
    return this.issue(user, clientType);
  }
  private async issue(
    user: { id: string; email: string; displayName: string },
    clientType: string,
  ) {
    const refreshToken = randomBytes(48).toString('base64url');
    const session = await this.db.authSession.create({
      data: {
        userId: user.id,
        clientType,
        refreshTokenHash: hash(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    return {
      user: publicUser(user),
      accessToken: await this.jwt.signAsync({ sub: user.id, sid: session.id }),
      refreshToken,
    };
  }
  async refresh(token: string | undefined, clientType = 'web') {
    if (!token || token.length > 200) throw new UnauthorizedException('로그인이 필요합니다.');
    return this.db.$transaction(async (tx) => {
      const session = await tx.authSession.findUnique({
        where: { refreshTokenHash: hash(token) },
        include: { user: true },
      });
      if (
        !session ||
        session.clientType !== clientType ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      )
        throw new UnauthorizedException('세션이 만료되었습니다.');
      const refreshToken = randomBytes(48).toString('base64url');
      const changed = await tx.authSession.updateMany({
        where: { id: session.id, refreshTokenHash: hash(token), revokedAt: null },
        data: { refreshTokenHash: hash(refreshToken) },
      });
      if (changed.count !== 1) throw new UnauthorizedException('이미 사용된 세션입니다.');
      return {
        user: publicUser(session.user),
        accessToken: await this.jwt.signAsync({ sub: session.userId, sid: session.id }),
        refreshToken,
      };
    });
  }
  async logout(token: string | undefined) {
    if (token && token.length <= 200)
      await this.db.authSession.updateMany({
        where: { refreshTokenHash: hash(token) },
        data: { revokedAt: new Date() },
      });
  }
  async me(id: string) {
    const u = await this.db.user.findUnique({ where: { id } });
    if (!u) throw new UnauthorizedException();
    return publicUser(u);
  }
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization || '');
    if (!match) throw new UnauthorizedException('로그인이 필요합니다.');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(match[1]);
      const session = await this.db.authSession.findFirst({
        where: {
          id: payload.sid,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!session) throw new Error('expired');
      request.user = { id: payload.sub, sessionId: payload.sid };
      return true;
    } catch {
      throw new UnauthorizedException('로그인 세션을 확인해 주세요.');
    }
  }
}
