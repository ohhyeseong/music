import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from './db.js';
import { trackInclude, toTrack } from './catalog/catalog.js';
const include = {
  tracks: { include: { track: { include: trackInclude } }, orderBy: { position: 'asc' as const } },
};
type Row = Prisma.PlaylistGetPayload<{ include: typeof include }>;
const dto = (row: Row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  version: row.version,
  updatedAt: row.updatedAt.toISOString(),
  tracks: row.tracks.map((r) => toTrack(r.track)),
});
@Injectable()
export class Playlists {
  constructor(@Inject(Database) private readonly db: Database) {}
  async list(userId: string) {
    return (
      await this.db.playlist.findMany({
        where: { userId },
        include,
        orderBy: { updatedAt: 'desc' },
        take: 100,
      })
    ).map(dto);
  }
  async get(userId: string, id: string) {
    const p = await this.db.playlist.findFirst({ where: { id, userId }, include });
    if (!p) throw new NotFoundException('플레이리스트를 찾을 수 없습니다.');
    return dto(p);
  }
  async create(userId: string, name: string, description: string, trackIds: string[] = []) {
    if (new Set(trackIds).size !== trackIds.length)
      throw new BadRequestException('곡이 중복되었습니다.');
    return this.db.$transaction(async (tx) => {
      const count = await tx.track.count({
        where: { id: { in: trackIds }, isDemo: process.env.CATALOG_MODE !== 'live' },
      });
      if (count !== trackIds.length) throw new NotFoundException('곡을 찾을 수 없습니다.');
      return dto(
        await tx.playlist.create({
          data: {
            userId,
            name,
            description,
            tracks: { create: trackIds.map((trackId, position) => ({ trackId, position })) },
          },
          include,
        }),
      );
    });
  }
  private async mutate(
    userId: string,
    id: string,
    fn: (tx: Prisma.TransactionClient, p: Row) => Promise<void>,
    version?: number,
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.playlist.findFirst({ where: { id, userId }, include });
        if (!row) throw new NotFoundException('플레이리스트를 찾을 수 없습니다.');
        if (version !== undefined && version !== row.version)
          throw new ConflictException('목록이 변경되었습니다. 새로 불러온 뒤 다시 시도해 주세요.');
        const updated = await tx.playlist.updateMany({
          where: { id, userId, version: row.version },
          data: { version: { increment: 1 }, updatedAt: new Date() },
        });
        if (updated.count !== 1)
          throw new ConflictException('다른 편집이 먼저 반영되었습니다. 다시 불러와 주세요.');
        await fn(tx, row);
        const result = await tx.playlist.findUnique({ where: { id }, include });
        return result ? dto(result) : { deleted: true };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException('중복 곡이거나 동시에 수정된 목록입니다. 다시 확인해 주세요.');
      throw error;
    }
  }
  update(userId: string, id: string, name: string, description: string, version: number) {
    return this.mutate(
      userId,
      id,
      async (tx) => {
        await tx.playlist.update({ where: { id }, data: { name, description } });
      },
      version,
    );
  }
  remove(userId: string, id: string) {
    return this.mutate(userId, id, async (tx) => {
      await tx.playlist.delete({ where: { id } });
    });
  }
  add(userId: string, id: string, trackId: string) {
    return this.mutate(userId, id, async (tx, p) => {
      const track = await tx.track.findFirst({
        where: { id: trackId, isDemo: process.env.CATALOG_MODE !== 'live' },
      });
      if (!track) throw new NotFoundException('곡을 찾을 수 없습니다.');
      if (p.tracks.length >= 200)
        throw new BadRequestException('플레이리스트에는 최대 200곡을 담을 수 있습니다.');
      await tx.playlistTrack.create({
        data: { playlistId: id, trackId, position: p.tracks.length },
      });
    });
  }
  deleteTrack(userId: string, id: string, trackId: string) {
    return this.mutate(userId, id, async (tx, p) => {
      if (!p.tracks.some((t) => t.trackId === trackId))
        throw new NotFoundException('목록에 없는 곡입니다.');
      await tx.playlistTrack.delete({ where: { playlistId_trackId: { playlistId: id, trackId } } });
      await this.reposition(
        tx,
        id,
        p.tracks.filter((t) => t.trackId !== trackId).map((t) => t.trackId),
      );
    });
  }
  order(userId: string, id: string, trackIds: string[], version: number) {
    return this.mutate(
      userId,
      id,
      async (tx, p) => {
        const current = new Set(p.tracks.map((t) => t.trackId));
        if (
          trackIds.length !== current.size ||
          new Set(trackIds).size !== current.size ||
          trackIds.some((t) => !current.has(t))
        )
          throw new BadRequestException('현재 목록의 모든 곡을 중복 없이 보내 주세요.');
        await this.reposition(tx, id, trackIds);
      },
      version,
    );
  }
  private async reposition(tx: Prisma.TransactionClient, id: string, ids: string[]) {
    await tx.playlistTrack.updateMany({
      where: { playlistId: id },
      data: { position: { increment: 1000 } },
    });
    for (const [position, trackId] of ids.entries())
      await tx.playlistTrack.update({
        where: { playlistId_trackId: { playlistId: id, trackId } },
        data: { position },
      });
  }
}
