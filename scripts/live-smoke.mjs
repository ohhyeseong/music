import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase, startApi, stopProcess } from './test-db.mjs';
let database, server, korean, foreign, session;
async function request(path, method = 'GET', body) {
  const response = await fetch(`http://localhost:4200/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  assert.ok(response.ok, `HTTP ${response.status}: ${data.code || 'unknown error'}`);
  return data;
}
before(async () => {
  database = await createTestDatabase();
  server = await startApi(
    { ...database.env, CATALOG_MODE: 'live', APPLE_COUNTRY: 'US' },
    4200,
    'live-smoke-api',
  );
});
after(async () => {
  if (server) await stopProcess(server);
  database?.cleanup();
});
test('live: Korean artist search returns real provider records and persists exact identity', async () => {
  const result = await request(`search/tracks?q=${encodeURIComponent('아이유')}`);
  assert.equal(result.mode, 'live');
  assert.ok(result.tracks.length > 0);
  assert.ok(result.tracks.every((t) => !t.isDemo));
  korean = result.tracks.find((t) => t.artist === 'IU');
  assert.ok(korean);
  const saved = await request(`tracks/${korean.id}`);
  assert.equal(saved.title, korean.title);
  assert.ok(saved.genres.every((g) => g.scope === 'album' && g.evidence === 'indicative'));
});
test('live: foreign song connects to recording-level MusicBrainz evidence', async () => {
  const result = await request(`search/tracks?q=${encodeURIComponent('Nujabes Aruarian Dance')}`);
  foreign = result.tracks.find((t) => t.title === 'Aruarian Dance' && t.artist === 'Nujabes');
  assert.ok(foreign);
  const enriched = await request(`tracks/${foreign.id}/enrich`, 'POST');
  assert.ok(
    enriched.track.genres.some(
      (g) =>
        g.scope === 'recording' &&
        g.evidence === 'confirmed' &&
        g.sourceUrl?.startsWith('https://musicbrainz.org/recording/'),
    ),
  );
  const recommendations = await request(`tracks/${foreign.id}/recommendations`);
  assert.ok(recommendations.items.every((r) => !r.track.isDemo && r.reasons.length > 0));
});
test('live: a real provider song can be saved and read through the authenticated API', async () => {
  session = await request('auth/register', 'POST', {
    email: 'live-smoke@example.test',
    password: 'Live-smoke-password-123',
    displayName: 'Live test',
  });
  const playlist = await request('playlists', 'POST', {
    name: '실제 곡 검증',
    trackIds: [korean.id, foreign.id],
  });
  assert.deepEqual(
    playlist.tracks.map((t) => t.id),
    [korean.id, foreign.id],
  );
  const saved = await request(`playlists/${playlist.id}`);
  assert.equal(saved.tracks.length, 2);
  assert.ok(saved.tracks.every((t) => !t.isDemo));
});
test('live: overlapping recording tags produce a nonempty real-song recommendation', async () => {
  const result = await request(`search/tracks?q=${encodeURIComponent('Bonobo Cirrus')}`);
  const source = result.tracks.find((t) => t.title === 'Cirrus' && t.artist === 'Bonobo');
  assert.ok(source);
  const enriched = await request(`tracks/${source.id}/enrich`, 'POST');
  assert.ok(
    enriched.track.genres.some((g) => g.scope === 'recording'),
    `Recording enrichment state: ${enriched.enrichment}`,
  );
  const recommendations = await request(`tracks/${source.id}/recommendations`);
  assert.ok(
    recommendations.items.length > 0,
    'Expected a real candidate sharing confirmed recording-level genre tags',
  );
  assert.ok(
    recommendations.items.every(
      (r) => !r.track.isDemo && r.sharedGenres.length > 0 && r.reasons.length > 0,
    ),
  );
});
