import { describe, expect, it } from 'vitest';
import { toTrack } from './catalog.js';

const row = {
  id: 'artwork-fixture',
  title: 'Cover fixture',
  albumTitle: 'Album',
  durationMs: 1000,
  isrc: null,
  artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.jpg',
  artworkSourceUrl: 'https://music.apple.com/us/album/a/123?i=1',
  externalUrl: 'https://music.apple.com/us/album/a/123?i=1',
  palette: 0,
  isDemo: false,
  metadataExpiresAt: new Date(Date.now() + 60000),
  createdAt: new Date(),
  updatedAt: new Date(),
  artists: [],
  genres: [],
  moods: [],
} satisfies Parameters<typeof toTrack>[0];

describe('stored artwork availability', () => {
  it('returns fresh artwork only with a trusted store source', () => {
    expect(toTrack(row).artworkUrl).toBe(row.artworkUrl);
    expect(toTrack({ ...row, artworkSourceUrl: null }).artworkUrl).toBeNull();
    expect(
      toTrack({ ...row, artworkUrl: 'https://untrusted.test/cover.jpg' }).artworkUrl,
    ).toBeNull();
  });
  it('withholds expired, undated and demo artwork', () => {
    expect(toTrack({ ...row, metadataExpiresAt: new Date(0) }).artworkUrl).toBeNull();
    expect(toTrack({ ...row, metadataExpiresAt: null }).artworkUrl).toBeNull();
    expect(toTrack({ ...row, isDemo: true }).artworkUrl).toBeNull();
  });
});
