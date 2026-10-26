import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Tag, Track, Mode, SearchResult } from '@gyeol/contracts';
import { Database } from '../db.js';
import { recommend } from './recommend.js';
import {
  normalize,
  recordingGenres,
  searchApple,
  stableId,
  appleArtworkUrl,
  appleStoreUrl,
  type AppleTrack,
} from './providers.js';

export const trackInclude = {
  artists: { include: { artist: true }, orderBy: { creditOrder: 'asc' as const } },
  genres: { include: { genre: true } },
  moods: { include: { mood: true } },
};
type Row = Prisma.TrackGetPayload<{ include: typeof trackInclude }>;
export function toTrack(t: Row): Track {
  const now = Date.now();
  return {
    id: t.id,
    title: t.title,
    artist: t.artists.map((x) => x.artist.name).join(', '),
    album: t.albumTitle,
    durationMs: t.durationMs,
    artworkUrl:
      !t.isDemo &&
      t.metadataExpiresAt &&
      t.metadataExpiresAt.getTime() > now &&
      appleStoreUrl(t.artworkSourceUrl || undefined)
        ? appleArtworkUrl(t.artworkUrl || undefined)
        : null,
    externalUrl: appleStoreUrl(t.externalUrl || undefined),
    palette: t.palette,
    isDemo: t.isDemo,
    genres: t.genres
      .filter((g) => !g.expiresAt || g.expiresAt.getTime() > now)
      .map((g) => ({
        slug: g.genre.slug,
        name: g.genre.nameKo,
        scope: g.sourceScope as Tag['scope'],
        source: g.provider === 'demo' ? 'GYEOL 가상 샘플 카탈로그' : g.provider,
        sourceUrl: g.sourceUrl,
        evidence: g.evidenceLevel as Tag['evidence'],
      })),
    moods: t.moods
      .filter((g) => !g.expiresAt || g.expiresAt.getTime() > now)
      .map((g) => ({
        slug: g.mood.slug,
        name: g.mood.nameKo,
        scope: g.sourceScope as Tag['scope'],
        source: g.provider === 'demo' ? 'GYEOL 가상 샘플 카탈로그' : g.provider,
        sourceUrl: g.sourceUrl,
        evidence: g.evidenceLevel as Tag['evidence'],
      })),
  };
}
@Injectable()
export class Catalog {
  constructor(@Inject(Database) private readonly db: Database) {}
  get mode() {
    return process.env.CATALOG_MODE === 'live' ? ('live' as const) : ('demo' as const);
  }
  async all() {
    return (
      await this.db.track.findMany({
        where: { isDemo: this.mode === 'demo' },
        include: trackInclude,
        orderBy: { id: 'asc' },
        take: 500,
      })
    ).map(toTrack);
  }
  async search(q: string, offset = 0): Promise<SearchResult> {
    let tracks: Track[];
    if (this.mode === 'demo') {
      const term = normalize(q);
      tracks = (await this.all()).filter(
        (t) =>
          !term ||
          normalize(
            [
              t.title,
              t.artist,
              t.album,
              ...t.genres.map((g) => g.name),
              ...t.moods.map((m) => m.name),
            ].join(' '),
          ).includes(term),
      );
      const page = tracks.slice(offset, offset + 20);
      return {
        tracks: page,
        mode: this.mode,
        hasMore: tracks.length > offset + 20,
        nextCursor: tracks.length > offset + 20 ? String(offset + 20) : null,
      };
    }
    if (!q.trim()) {
      const existing = await this.all();
      return {
        tracks: existing.slice(offset, offset + 20),
        mode: this.mode,
        hasMore: existing.length > offset + 20,
        nextCursor: existing.length > offset + 20 ? String(offset + 20) : null,
      };
    }
    const external = await searchApple(q, offset);
    tracks = external;
    // Sequential writes avoid competing taxonomy upserts on the same unique genre.
    for (const track of external.slice(0, 20)) await this.saveExternal(track);
    return {
      tracks: tracks.slice(0, 20),
      mode: this.mode,
      hasMore: tracks.length > 20,
      nextCursor: tracks.length > 20 ? String(offset + 20) : null,
    };
  }
  async saveExternal(t: AppleTrack) {
    await this.db.$transaction(async (tx) => {
      const artistId = stableId(`apple-artist:${t.providerArtistId || t.id}`);
      await tx.artist.upsert({
        where: { id: artistId },
        create: { id: artistId, name: t.artist },
        update: {},
      });
      await tx.track.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          title: t.title,
          albumTitle: t.album,
          durationMs: t.durationMs,
          artworkUrl: t.artworkUrl,
          artworkSourceUrl: t.externalUrl,
          externalUrl: t.externalUrl,
          isDemo: false,
          palette: t.palette,
          metadataExpiresAt: new Date(Date.now() + 86400000),
          artists: { create: { artistId } },
        },
        update: {
          title: t.title,
          artworkUrl: t.artworkUrl,
          artworkSourceUrl: t.externalUrl,
          externalUrl: t.externalUrl,
          metadataExpiresAt: new Date(Date.now() + 86400000),
        },
      });
      const sourceKey = {
        provider: 'apple',
        externalTrackId: t.providerTrackId,
        countryCode: t.country,
      };
      await tx.trackSource.upsert({
        where: { provider_externalTrackId_countryCode: sourceKey },
        create: {
          ...sourceKey,
          trackId: t.id,
          sourceUrl: t.externalUrl,
          expiresAt: new Date(Date.now() + 86400000),
        },
        update: { fetchedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) },
      });
      for (const tag of t.genres) await this.saveGenre(tx, t.id, tag);
    });
  }
  private async saveGenre(tx: Prisma.TransactionClient, trackId: string, tag: Tag) {
    const genre = await tx.genre.upsert({
      where: { slug: tag.slug },
      create: { slug: tag.slug, nameKo: tag.name, nameEn: tag.name },
      update: {},
    });
    const key = {
      trackId,
      genreId: genre.id,
      provider: tag.source,
      sourceScope: tag.scope,
      sourceEntityId: tag.sourceUrl || trackId,
    };
    // sourceEntityId must fit its bounded identifier column, not store an arbitrary URL.
    key.sourceEntityId = stableId(key.sourceEntityId);
    await tx.trackGenre.upsert({
      where: { trackId_genreId_provider_sourceScope_sourceEntityId: key },
      create: {
        ...key,
        sourceUrl: tag.sourceUrl,
        evidenceLevel: tag.evidence,
        expiresAt: new Date(Date.now() + 86400000),
      },
      update: { evidenceLevel: tag.evidence, expiresAt: new Date(Date.now() + 86400000) },
    });
  }
  async get(id: string) {
    const row = await this.db.track.findFirst({
      where: { id, isDemo: this.mode === 'demo' },
      include: trackInclude,
    });
    if (!row) throw new NotFoundException('곡을 찾을 수 없습니다.');
    return toTrack(row);
  }
  async enrich(id: string) {
    const t = await this.get(id);
    if (t.isDemo || t.genres.some((g) => g.scope === 'recording'))
      return { track: t, enrichment: 'not_needed' };
    let tags: Tag[];
    try {
      tags = await recordingGenres(t);
    } catch {
      return { track: t, enrichment: 'provider_unavailable' };
    }
    // A storage failure is an application error, not an upstream outage.
    await this.db.$transaction(async (tx) => {
      for (const tag of tags) await this.saveGenre(tx, id, tag);
    });
    return { track: await this.get(id), enrichment: tags.length ? 'updated' : 'no_exact_match' };
  }
  async recommendations(id: string, mode: Mode) {
    return {
      items: recommend(await this.get(id), await this.all(), mode),
      mode,
      catalogMode: this.mode,
    };
  }
}
