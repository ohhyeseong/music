import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'mysql2/promise';
import { verify } from 'argon2';
import { createTestDatabase, startApi, stopProcess } from './test-db.mjs';

let database, server, alice, bob, playlist, tracks;
const base = 'http://localhost:4100/v1';
async function request(
  path,
  { method = 'GET', body, session, cookie, origin = 'http://localhost:3000' } = {},
) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  if (session) headers.Authorization = `Bearer ${session.accessToken}`;
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${base}/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    headers: response.headers,
  };
}
before(async () => {
  database = await createTestDatabase();
  server = await startApi(database.env, 4100, 'integration');
});
after(async () => {
  if (server) await stopProcess(server);
  database?.cleanup();
});
test('MySQL readiness and explicit demo search', async () => {
  const ready = await request('health/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.data.catalogMode, 'demo');
  const r = await request('search/tracks');
  tracks = r.data.tracks;
  assert.equal(tracks.length, 16);
  assert.ok(tracks.every((t) => t.isDemo));
});
test('search filters Korean and English and returns empty results honestly', async () => {
  assert.equal((await request('search/tracks?q=Velvet')).data.tracks.length, 1);
  assert.equal(
    (await request(`search/tracks?q=${encodeURIComponent('새벽')}`)).data.tracks.length,
    1,
  );
  assert.equal((await request('search/tracks?q=nonexistent-xyz')).data.tracks.length, 0);
});
test('invalid input cannot reach database or provider', async () => {
  assert.equal((await request('tracks/not-a-uuid')).status, 400);
  assert.equal((await request('search/tracks?cursor=-1')).status, 400);
  assert.equal(
    (await request('search/tracks?q=' + encodeURIComponent('a'.repeat(121)))).status,
    400,
  );
});
test('recommendations have explainable overlap and exclude selected track', async () => {
  const r = await request(`tracks/${tracks[0].id}/recommendations`);
  assert.ok(r.data.items.length > 0);
  assert.ok(
    r.data.items.every((x) => x.track.id !== tracks[0].id && x.reasons.length > 0 && x.score > 0),
  );
  assert.equal((await request(`tracks/${tracks[0].id}/recommendations?mode=invalid`)).status, 400);
});
test('anonymous playlist access is denied', async () =>
  assert.equal((await request('playlists')).status, 401));
test('registration hashes passwords and uses an HttpOnly refresh cookie', async () => {
  const a = await request('auth/register', {
    method: 'POST',
    body: { email: 'ALICE@example.test', password: 'Secure-test-pass-123', displayName: 'Alice' },
  });
  assert.equal(a.status, 201);
  alice = { ...a.data, cookie: a.cookie };
  assert.equal(alice.user.email, 'alice@example.test');
  assert.ok(!('passwordHash' in a.data.user));
  assert.ok(a.headers.get('set-cookie').includes('HttpOnly'));
  assert.ok(!('refreshToken' in a.data));
  const b = await request('auth/register', {
    method: 'POST',
    body: { email: 'bob@example.test', password: 'Secure-test-pass-456', displayName: 'Bob' },
  });
  bob = { ...b.data, cookie: b.cookie };
  assert.equal(b.status, 201);
});
test('duplicate signup, wrong password and cross-origin auth are rejected', async () => {
  assert.equal(
    (
      await request('auth/register', {
        method: 'POST',
        body: {
          email: 'alice@example.test',
          password: 'Secure-test-pass-123',
          displayName: 'Again',
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('auth/login', {
        method: 'POST',
        body: { email: 'alice@example.test', password: 'wrong-password-12' },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('auth/refresh', {
        method: 'POST',
        cookie: alice.cookie,
        origin: 'https://evil.example',
      })
    ).status,
    403,
  );
});
test('create playlist atomically with initial tracks', async () => {
  const r = await request('playlists', {
    method: 'POST',
    session: alice,
    body: {
      name: '새벽의 재즈',
      description: '통합 테스트',
      trackIds: [tracks[0].id, tracks[1].id],
    },
  });
  assert.equal(r.status, 201);
  playlist = r.data;
  assert.equal(playlist.tracks.length, 2);
  assert.equal((await request('playlists', { session: alice })).data.length, 1);
});
test('another user cannot read, edit, add or delete this playlist', async () => {
  for (const options of [
    { method: 'GET' },
    { method: 'DELETE' },
    { method: 'PATCH', body: { name: 'Stolen', version: 0 } },
  ])
    assert.equal(
      (await request(`playlists/${playlist.id}`, { ...options, session: bob })).status,
      404,
    );
  assert.equal(
    (
      await request(`playlists/${playlist.id}/tracks`, {
        method: 'POST',
        session: bob,
        body: { trackId: tracks[2].id },
      })
    ).status,
    404,
  );
  assert.equal((await request('playlists', { session: bob })).data.length, 0);
});
test('duplicate add rolls back playlist version and ordering', async () => {
  const r = await request(`playlists/${playlist.id}/tracks`, {
    method: 'POST',
    session: alice,
    body: { trackId: tracks[0].id },
  });
  assert.equal(r.status, 409);
  const p = (await request(`playlists/${playlist.id}`, { session: alice })).data;
  assert.equal(p.version, playlist.version);
  assert.equal(p.tracks.length, 2);
});
test('invalid batch create is atomic and leaves no extra playlist', async () => {
  assert.equal(
    (
      await request('playlists', {
        method: 'POST',
        session: alice,
        body: { name: 'invalid', trackIds: [tracks[0].id, '99999999-0000-4000-8000-000000000000'] },
      })
    ).status,
    404,
  );
  assert.equal((await request('playlists', { session: alice })).data.length, 1);
});
test('add, reorder and version conflict preserve exact list order', async () => {
  playlist = (
    await request(`playlists/${playlist.id}/tracks`, {
      method: 'POST',
      session: alice,
      body: { trackId: tracks[2].id },
    })
  ).data;
  const ids = playlist.tracks.map((t) => t.id).reverse();
  const ordered = await request(`playlists/${playlist.id}/order`, {
    method: 'PUT',
    session: alice,
    body: { trackIds: ids, version: playlist.version },
  });
  assert.equal(ordered.status, 200);
  assert.deepEqual(
    ordered.data.tracks.map((t) => t.id),
    ids,
  );
  assert.equal(
    (
      await request(`playlists/${playlist.id}/order`, {
        method: 'PUT',
        session: alice,
        body: { trackIds: ids, version: playlist.version },
      })
    ).status,
    409,
  );
  playlist = ordered.data;
});
test('invalid reorder rolls back and cannot lose or duplicate tracks', async () => {
  const r = await request(`playlists/${playlist.id}/order`, {
    method: 'PUT',
    session: alice,
    body: { trackIds: [tracks[0].id, tracks[0].id, tracks[1].id], version: playlist.version },
  });
  assert.equal(r.status, 400);
  assert.equal(
    (await request(`playlists/${playlist.id}`, { session: alice })).data.version,
    playlist.version,
  );
});
test('concurrent edits accept exactly one version', async () => {
  const results = await Promise.all(
    ['A', 'B'].map((name) =>
      request(`playlists/${playlist.id}`, {
        method: 'PATCH',
        session: alice,
        body: { name, version: playlist.version },
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  playlist = results.find((r) => r.status === 200).data;
});
test('delete track closes ordering gaps and persists across API restart', async () => {
  const removed = playlist.tracks[1].id;
  const result = await request(`playlists/${playlist.id}/tracks/${removed}`, {
    method: 'DELETE',
    session: alice,
  });
  assert.equal(result.status, 200);
  playlist = result.data;
  assert.equal(playlist.tracks.length, 2);
  await stopProcess(server);
  server = await startApi(database.env, 4100, 'integration-restart');
  const read = await request(`playlists/${playlist.id}`, { session: alice });
  assert.deepEqual(
    read.data.tracks.map((t) => t.id),
    playlist.tracks.map((t) => t.id),
  );
});
test('refresh rotates the token and prevents replay', async () => {
  const previous = alice.cookie;
  const refreshed = await request('auth/refresh', { method: 'POST', cookie: previous });
  assert.equal(refreshed.status, 201);
  alice = { ...refreshed.data, cookie: refreshed.cookie };
  assert.notEqual(alice.cookie, previous);
  assert.equal((await request('auth/refresh', { method: 'POST', cookie: previous })).status, 401);
  assert.equal((await request('auth/me', { session: alice })).status, 200);
});
test('playlist deletion removes entries and logout invalidates access', async () => {
  assert.equal(
    (await request(`playlists/${playlist.id}`, { method: 'DELETE', session: alice })).status,
    200,
  );
  assert.equal((await request(`playlists/${playlist.id}`, { session: alice })).status, 404);
  assert.equal(
    (await request('auth/logout', { method: 'POST', cookie: alice.cookie })).status,
    201,
  );
  assert.equal((await request('auth/me', { session: alice })).status, 401);
});
test('database stores an Argon2id hash, never the submitted password', async () => {
  const connection = await createConnection(database.env.DATABASE_URL);
  try {
    const [rows] = await connection.execute('SELECT passwordHash FROM `User` WHERE email=?', [
      'alice@example.test',
    ]);
    assert.ok(rows[0].passwordHash.startsWith('$argon2id$'));
    assert.ok(await verify(rows[0].passwordHash, 'Secure-test-pass-123'));
  } finally {
    await connection.end();
  }
});
test('native sessions return no ambient cookie and cannot refresh through the web flow', async () => {
  const result = await request('auth/native/login', {
    method: 'POST',
    body: { email: 'bob@example.test', password: 'Secure-test-pass-456' },
  });
  assert.equal(result.status, 201);
  assert.equal(result.cookie, undefined);
  assert.ok(result.data.refreshToken);
  assert.equal(
    (
      await request('auth/refresh', {
        method: 'POST',
        cookie: `gyeol_refresh=${result.data.refreshToken}`,
      })
    ).status,
    401,
  );
  const rotated = await request('auth/native/refresh', {
    method: 'POST',
    body: { refreshToken: result.data.refreshToken },
  });
  assert.equal(rotated.status, 201);
  assert.notEqual(rotated.data.refreshToken, result.data.refreshToken);
  assert.equal(
    (
      await request('auth/native/refresh', {
        method: 'POST',
        body: { refreshToken: result.data.refreshToken },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('auth/native/logout', {
        method: 'POST',
        body: { refreshToken: rotated.data.refreshToken },
      })
    ).status,
    201,
  );
  assert.equal((await request('auth/me', { session: rotated.data })).status, 401);
});
