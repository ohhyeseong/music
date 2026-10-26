import { describe, it, expect } from 'vitest';
import { mapApple, safeLink, stableId, normalize } from './providers.js';
describe('provider boundaries', () => {
  it('keeps identities separate across provider markets', () => {
    const data = { resultCount: 1, results: [{ trackId: 1, trackName: 'A', artistName: 'B' }] };
    expect(mapApple(data, 'US')[0].id).not.toBe(mapApple(data, 'KR')[0].id);
    expect(mapApple(data)[0].country).toBe('US');
  });
  it('keeps provider genre indicative, with no invented mood', () => {
    const [t] = mapApple({
      resultCount: 1,
      results: [{ trackId: 1, trackName: 'A', artistName: 'B', primaryGenreName: 'Jazz' }],
    });
    expect(t.genres[0].evidence).toBe('indicative');
    expect(t.genres[0].scope).toBe('album');
    expect(t.moods).toEqual([]);
    expect(t.isDemo).toBe(false);
  });
  it('rejects arbitrary URLs and malformed provider records', () => {
    expect(
      safeLink('https://music.apple.com.evil.test/a', /^(music|itunes)\.apple\.com$/),
    ).toBeNull();
    expect(safeLink('javascript:alert(1)', /.*/)).toBeNull();
    expect(mapApple({ resultCount: 1, results: [{ trackId: 'bad' }] })).toEqual([]);
    expect(() => mapApple({ error: 'down' })).toThrow();
  });
  it('pairs original provider artwork with its store link', () => {
    const record = {
      trackId: 1,
      trackName: 'A',
      artistName: 'B',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.jpg',
      trackViewUrl: 'https://music.apple.com/us/album/a/123?i=1',
    };
    const [track] = mapApple({ resultCount: 1, results: [record] });
    expect(track.artworkUrl).toBe(record.artworkUrl100);
    expect(new URL(track.externalUrl!).searchParams.get('app')).toBe('itunes');
    for (const url of [
      'http://is1-ssl.mzstatic.com/a.jpg',
      'https://mzstatic.com.evil.test/a.jpg',
      'https://other.test/a.jpg',
    ]) {
      expect(
        mapApple({ resultCount: 1, results: [{ ...record, artworkUrl100: url }] })[0].artworkUrl,
      ).toBeNull();
    }
    expect(
      mapApple({ resultCount: 1, results: [{ ...record, trackViewUrl: undefined }] })[0].artworkUrl,
    ).toBeNull();
  });
  it('normalizes unicode without merging distinct genres and uses stable ids', () => {
    expect(normalize('  ＪＡＺＺ  ')).toBe('jazz');
    expect(stableId('a')).toBe(stableId('a'));
    expect(stableId('a')).not.toBe(stableId('b'));
  });
});
