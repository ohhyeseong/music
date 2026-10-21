import { describe, it, expect } from 'vitest';
import { demoTracks } from './demo.js';
import { overlap, recommend } from './recommend.js';
describe('tag recommendations', () => {
  it('uses the documented fixed weighted Jaccard score', () => {
    const [source, candidate] = demoTracks;
    expect(recommend(source, [candidate])[0].score).toBeCloseTo(0.65 / 3 + 0.35);
  });
  it('excludes source, duplicates and unsupported candidates', () => {
    const source = demoTracks[0];
    const unsupported = { ...demoTracks[1], genres: [], moods: [] };
    expect(recommend(source, [source, unsupported])).toEqual([]);
    expect(recommend(source, [demoTracks[1], demoTracks[1]])).toHaveLength(1);
  });
  it('does not treat artist-level tags as confirmed track evidence', () => {
    const tags = demoTracks[0].genres.map((t) => ({ ...t, scope: 'artist' as const }));
    expect(overlap(tags, tags).score).toBe(0);
  });
  it('does not conflate new jazz and nu jazz', () => {
    const a = demoTracks[0].genres.slice(0, 1);
    expect(overlap(a, [{ ...a[0], slug: 'new-jazz' }]).score).toBe(0);
  });
  it('does not inflate absent mood data and preserves stable ranking', () => {
    const source = { ...demoTracks[0], moods: [] };
    const candidate = { ...demoTracks[1], genres: source.genres, moods: [] };
    expect(recommend(source, [candidate])[0].score).toBe(0.65);
    expect(recommend(demoTracks[0], [...demoTracks].reverse())).toEqual(
      recommend(demoTracks[0], demoTracks),
    );
  });
  it('supports mood-only mode and caps each artist', () => {
    const result = recommend(demoTracks[0], demoTracks, 'mood');
    expect(result.every((x) => x.sharedMoods.length > 0)).toBe(true);
    expect(result.filter((x) => x.track.artist === '모노레인').length).toBeLessThanOrEqual(2);
    expect(recommend(demoTracks[0], demoTracks, 'balanced', 1)).toHaveLength(1);
  });
});
