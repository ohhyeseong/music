import type { Mode, Recommendation, Tag, Track } from '@gyeol/contracts';
const supported = (tags: Tag[]) =>
  new Map(
    tags
      .filter((t) => t.evidence === 'confirmed' && ['recording', 'curated'].includes(t.scope))
      .map((t) => [t.slug, t.name]),
  );
export function overlap(a: Tag[], b: Tag[]) {
  const left = supported(a),
    right = supported(b);
  const common = [...left.keys()].filter((k) => right.has(k));
  const union = new Set([...left.keys(), ...right.keys()]);
  return {
    score: union.size ? common.length / union.size : 0,
    names: common.map((k) => left.get(k)!),
  };
}
export function recommend(
  source: Track,
  candidates: Track[],
  mode: Mode = 'balanced',
  limit = 12,
): Recommendation[] {
  const seen = new Set<string>();
  const ranked = candidates
    .filter((t) => t.id !== source.id && !seen.has(t.id) && (seen.add(t.id), true))
    .map((track) => {
      const g = overlap(source.genres, track.genres),
        m = overlap(source.moods, track.moods);
      const score =
        mode === 'genre' ? g.score : mode === 'mood' ? m.score : g.score * 0.65 + m.score * 0.35;
      return {
        track,
        score,
        sharedGenres: g.names,
        sharedMoods: m.names,
        reasons: [
          ...(g.names.length ? [`${g.names.join(' · ')} 장르가 겹쳐요`] : []),
          ...(m.names.length ? [`${m.names.join(' · ')} 분위기가 비슷해요`] : []),
        ],
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.track.id.localeCompare(b.track.id));
  const counts = new Map<string, number>();
  return ranked
    .filter((r) => {
      const count = counts.get(r.track.artist) || 0;
      if (count >= 2) return false;
      counts.set(r.track.artist, count + 1);
      return true;
    })
    .slice(0, Math.max(0, Math.min(limit, 30)));
}
