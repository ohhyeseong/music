export type Evidence = 'confirmed' | 'indicative' | 'unknown';
export type Mode = 'balanced' | 'genre' | 'mood';
export type CatalogMode = 'demo' | 'live';
export interface Tag {
  slug: string;
  name: string;
  scope: 'recording' | 'album' | 'artist' | 'curated';
  source: string;
  sourceUrl: string | null;
  evidence: Evidence;
}
export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  artworkUrl: string | null;
  externalUrl: string | null;
  palette: number;
  genres: Tag[];
  moods: Tag[];
  isDemo: boolean;
}
export interface Recommendation {
  track: Track;
  score: number;
  reasons: string[];
  sharedGenres: string[];
  sharedMoods: string[];
}
export interface Playlist {
  id: string;
  name: string;
  description: string;
  version: number;
  updatedAt: string;
  tracks: Track[];
}
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
}
export interface SearchResult {
  tracks: Track[];
  mode: CatalogMode;
  hasMore: boolean;
  nextCursor: string | null;
}
export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}
