import { ServiceUnavailableException } from '@nestjs/common';
import { EnvHttpProxyAgent, fetch } from 'undici';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Tag, Track } from '@gyeol/contracts';

const agent = new EnvHttpProxyAgent();
export const stableId = (value: string) => {
  const h = createHash('sha256').update(value).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const normalize = (s: string) =>
  s.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function safeLink(value: string | undefined, hosts: RegExp): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && hosts.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}
const song = z.object({
  trackId: z.number(),
  trackName: z.string(),
  artistId: z.number().optional(),
  artistName: z.string(),
  collectionName: z.string().optional(),
  trackTimeMillis: z.number().optional(),
  primaryGenreName: z.string().optional(),
  artworkUrl100: z.string().optional(),
  trackViewUrl: z.string().optional(),
});
const appleResponse = z.object({ resultCount: z.number(), results: z.array(z.unknown()) });
export type AppleTrack = Track & {
  providerTrackId: string;
  providerArtistId: string | null;
  country: string;
};
export function mapApple(data: unknown, country = 'US'): AppleTrack[] {
  const parsed = appleResponse.parse(data);
  return parsed.results.flatMap((raw) => {
    const valid = song.safeParse(raw);
    if (!valid.success) return [];
    const t = valid.data;
    const genre: Tag | undefined = t.primaryGenreName
      ? {
          slug: normalize(t.primaryGenreName).replaceAll(' ', '-'),
          name: t.primaryGenreName,
          source: 'Apple 검색 메타데이터',
          scope: 'album',
          evidence: 'indicative',
          sourceUrl: safeLink(t.trackViewUrl, /^(music|itunes)\.apple\.com$/),
        }
      : undefined;
    return [
      {
        id: stableId(`apple:${country}:${t.trackId}`),
        country,
        providerTrackId: String(t.trackId),
        providerArtistId: t.artistId ? String(t.artistId) : null,
        title: t.trackName,
        artist: t.artistName,
        album: t.collectionName || '',
        durationMs: t.trackTimeMillis || 0,
        // Apple's promotional artwork requires a compliant store-badge flow.
        // Use original GYEOL artwork until those display rights are configured.
        artworkUrl: null,
        externalUrl: safeLink(t.trackViewUrl, /^(music|itunes)\.apple\.com$/),
        palette: t.trackId % 16,
        isDemo: false,
        genres: genre ? [genre] : [],
        moods: [],
      },
    ];
  });
}
async function readJson(url: URL, retries = 0): Promise<unknown> {
  try {
    const result = await fetch(url, {
      dispatcher: agent,
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'GYEOL/0.1 (https://github.com/ohhyeseong/music)' },
    });
    if (retries > 0 && [429, 503].includes(result.status)) {
      const after = Math.min(5, Math.max(1.1, Number(result.headers.get('retry-after')) || 1.1));
      await result.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, after * 1000));
      return readJson(url, retries - 1);
    }
    if (!result.ok) throw new Error(`upstream ${result.status}`);
    return await result.json();
  } catch {
    throw new ServiceUnavailableException({
      code: 'PROVIDER_UNAVAILABLE',
      message: '음악 정보 제공처에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
}
let appleQueue: Promise<unknown> = Promise.resolve();
let appleLastRequest = 0;
let applePending = 0;
const appleCache = new Map<string, { expires: number; value: Promise<AppleTrack[]> }>();
export async function searchApple(query: string, offset: number) {
  const country = (process.env.APPLE_COUNTRY || 'US').toUpperCase();
  const cacheKey = `${country}:${normalize(query)}`;
  const cached = appleCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return (await cached.value).slice(offset, offset + 21);
  if (applePending >= 4)
    throw new ServiceUnavailableException({
      code: 'PROVIDER_BUSY',
      message: '음악 검색 요청이 많아요. 잠시 후 다시 시도해 주세요.',
    });
  applePending++;
  const url = new URL('https://itunes.apple.com/search');
  // Search API has a bounded limit; do not assume it supports an offset parameter.
  url.search = new URLSearchParams({
    term: query,
    entity: 'song',
    country,
    limit: '200',
  }).toString();
  const value = appleQueue
    .catch(() => {})
    .then(async () => {
      const wait = Math.max(0, 3100 - (Date.now() - appleLastRequest));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      appleLastRequest = Date.now();
      try {
        return mapApple(await readJson(url), country);
      } catch (error) {
        appleCache.delete(cacheKey);
        if (error instanceof ServiceUnavailableException) throw error;
        throw new ServiceUnavailableException({
          code: 'PROVIDER_INVALID_RESPONSE',
          message: '음악 정보 응답 형식을 확인할 수 없습니다.',
        });
      } finally {
        applePending--;
      }
    });
  appleQueue = value;
  if (appleCache.size >= 50) appleCache.delete(appleCache.keys().next().value!);
  appleCache.set(cacheKey, { expires: Date.now() + 60000, value });
  return (await value).slice(offset, offset + 21);
}

let lastRequest = 0;
let queue: Promise<unknown> = Promise.resolve();
async function musicbrainz(url: URL) {
  const next = queue
    .catch(() => {})
    .then(async () => {
      const wait = Math.max(0, 1100 - (Date.now() - lastRequest));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequest = Date.now();
      return readJson(url, 1);
    });
  queue = next;
  return next;
}
const recording = z.object({
  id: z.string().uuid(),
  title: z.string(),
  length: z.number().optional(),
  'artist-credit': z.array(z.object({ name: z.string() })).optional(),
});
export async function recordingGenres(track: Track): Promise<Tag[]> {
  if (!track.durationMs) return [];
  const escaped = (s: string) => s.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ');
  const search = new URL('https://musicbrainz.org/ws/2/recording/');
  search.search = new URLSearchParams({
    // Constrain upstream search too: a common title's first results can all be short edits.
    query: `recording:"${escaped(track.title)}" AND artist:"${escaped(track.artist)}" AND dur:[${Math.max(0, track.durationMs - 1999)} TO ${track.durationMs + 1999}]`,
    fmt: 'json',
    limit: '20',
  }).toString();
  const raw = z
    .object({ count: z.number(), recordings: z.array(z.unknown()) })
    .parse(await musicbrainz(search));
  // An unseen additional match must not turn an ambiguous recording into an exact match.
  if (raw.count > raw.recordings.length) return [];
  const matches = raw.recordings
    .flatMap((item) => {
      const r = recording.safeParse(item);
      return r.success ? [r.data] : [];
    })
    .filter(
      (r) =>
        normalize(r.title) === normalize(track.title) &&
        r['artist-credit']?.some((a) => normalize(a.name) === normalize(track.artist)) &&
        r.length &&
        track.durationMs &&
        Math.abs(r.length - track.durationMs) < 2000,
    );
  if (matches.length !== 1) return [];
  const id = matches[0].id;
  const url = new URL(`https://musicbrainz.org/ws/2/recording/${id}?inc=genres&fmt=json`);
  const data = z
    .object({ genres: z.array(z.object({ name: z.string(), count: z.number() })).optional() })
    .parse(await musicbrainz(url));
  return (data.genres || [])
    .filter((g) => g.count > 0)
    .map((g) => ({
      slug: normalize(g.name).replaceAll(' ', '-'),
      name: g.name,
      scope: 'recording',
      source: 'MusicBrainz 커뮤니티 장르',
      sourceUrl: `https://musicbrainz.org/recording/${id}`,
      evidence: 'confirmed',
    }));
}
