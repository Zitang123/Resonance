import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const built = await build({
  stdin: {
    contents: `
import * as account from './app/api/account/route.ts';
import * as collection from './app/api/account/collection/route.ts';
export default { fetch(request) { const route = new URL(request.url).pathname.endsWith('/collection') ? collection : account; return route[request.method](request); } };`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  external: ['node:*', 'cloudflare:*'],
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    compatibilityDate: '2026-09-07',
    compatibilityFlags: ['nodejs_compat'],
    script: built.outputFiles[0].text,
    d1Databases: { DB: 'account-tests' },
    r2Buckets: { ROOM_IMAGES: 'private-images' },
  }),
);
const empty = () => ({
  version: 1,
  items: [],
  capsules: [],
  moments: [],
  preferences: { lowerEffects: false },
});
const record = (id, note = '') => ({
  id,
  title: 'Synthetic song',
  artist: 'Synthetic artist',
  type: 'track',
  links: [],
  savedAt: '2026-09-08T12:00:00.000Z',
  recommendedBy: '',
  note,
  tags: [],
  status: 'saved',
});
const request = async (owner, path = '', data, extra = {}) => {
  const response = await mf.dispatchFetch(
    `https://room.test/api/account${path}`,
    {
      method: data === undefined ? 'GET' : path ? 'PUT' : 'POST',
      headers: {
        ...(owner
          ? { 'oai-authenticated-user-id': owner, 'x-resonance-account': owner }
          : {}),
        origin: 'https://room.test',
        'content-type': 'application/json',
        ...extra,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    },
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, body: await response.json() };
};
try {
  const db = await mf.getD1Database('DB');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of readFileSync(`drizzle/${file}`, 'utf8')
      .split('--> statement-breakpoint')
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  assert.equal((await request(null)).body.account, null);
  assert.equal((await request(null, '/collection')).status, 401);
  const alice = (await request('alice', '', { action: 'open' })).body;
  const bob = (await request('bob', '', { action: 'open' })).body;
  assert.notEqual(alice.revision, bob.revision);
  const state = empty();
  state.items = [record('first')];
  state.capsules = [
    {
      id: 'photo',
      title: 'My private image',
      description: 'Private writing',
      theme: 'copper',
      itemIds: ['first'],
      createdAt: '2026-09-08T12:00:00.000Z',
      image:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2i8AAAAASUVORK5CYII=',
    },
  ];
  assert.equal(
    (
      await request(
        'alice',
        '/collection',
        { revision: alice.revision, state },
        { origin: 'https://attacker.test' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        'bob',
        '/collection',
        { revision: bob.revision, state },
        { 'x-resonance-account': 'alice' },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request('alice', '/collection', {
        revision: alice.revision,
        state,
        owner: 'bob',
      })
    ).status,
    400,
  );
  const saved = await request('alice', '/collection', {
    revision: alice.revision,
    state,
  });
  assert.equal(saved.status, 200);
  assert.deepEqual((await request('alice', '/collection')).body.state, state);
  assert.deepEqual((await request('bob', '/collection')).body.state, empty());
  assert.equal(
    (
      await request('bob', '/collection', {
        revision: saved.body.revision,
        state,
      })
    ).status,
    409,
  );
  const disk = await db
    .prepare("SELECT data FROM room_chunks WHERE user_id='alice'")
    .first();
  assert.ok(!disk.data.includes('data:image'));
  const objects = await (await mf.getR2Bucket('ROOM_IMAGES')).list();
  assert.equal(objects.objects.length, 1);
  assert.equal(
    (await request('alice', '/collection', { revision: alice.revision, state }))
      .status,
    409,
  );
  const left = { ...state, items: [record('first', 'left')] },
    right = { ...state, items: [record('first', 'right')] };
  const raced = await Promise.all([
    request('alice', '/collection', {
      revision: saved.body.revision,
      state: left,
    }),
    request('alice', '/collection', {
      revision: saved.body.revision,
      state: right,
    }),
  ]);
  assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409]);
  const winning = raced.find((r) => r.status === 200).body;
  assert.deepEqual(
    (await request('alice', '/collection')).body.state,
    winning.state,
  );
  // Above the D1 row limit, with non-ASCII text crossing partition boundaries.
  const large = empty();
  large.items = Array.from({ length: 600 }, (_, i) =>
    record(`large-${i}`, '🎵'.repeat(2100)),
  );
  const largeSave = await request('bob', '/collection', {
    revision: bob.revision,
    state: large,
  });
  assert.equal(
    largeSave.status,
    200,
    JSON.stringify(largeSave.body).slice(0, 300),
  );
  assert.deepEqual((await request('bob', '/collection')).body.state, large);
  const largest = await db
    .prepare(
      "SELECT MAX(length(CAST(data AS BLOB))) bytes,COUNT(*) n FROM room_chunks WHERE user_id='bob'",
    )
    .first();
  assert.ok(largest.n > 1 && largest.bytes < 2_000_000);
  await db
    .prepare(
      "INSERT INTO connections VALUES ('alice','discord','discord-alice','Alice',NULL,1)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO oauth_states VALUES ('pending','alice','discord','v',9999999999999,1)",
    )
    .run();
  await db
    .prepare("INSERT INTO sync_jobs(user_id,cutoff) VALUES ('alice',1)")
    .run();
  assert.equal(
    (
      await request('alice', '', {
        action: 'delete',
        confirmation: 'DELETE',
        revision: alice.revision,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('alice', '', {
        action: 'delete',
        confirmation: 'DELETE',
        revision: winning.revision,
      })
    ).status,
    200,
  );
  for (const table of [
    'rooms',
    'room_chunks',
    'connections',
    'oauth_states',
    'sync_jobs',
    'listens',
    'archive_owners',
  ])
    assert.equal(
      (
        await db
          .prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id='alice'`)
          .first()
      ).n,
      0,
    );
  assert.equal(
    (
      await request('alice', '/collection', {
        revision: winning.revision,
        state,
      })
    ).status,
    409,
  );
  assert.deepEqual((await request('bob', '/collection')).body.state, large);
  const reopened = await request('alice', '', { action: 'open' });
  assert.notEqual(reopened.body.revision, winning.revision);
  assert.equal(
    (
      await request('alice', '/collection', {
        revision: winning.revision,
        state,
      })
    ).status,
    409,
  );
  assert.deepEqual((await request('alice', '/collection')).body.state, empty());
  assert.equal(
    (await (await mf.getR2Bucket('ROOM_IMAGES')).list()).objects.length,
    0,
  );
  process.stdout.write(
    'Account Worker checks passed: private reads/images, ownership, CSRF, stale/replayed/concurrent saves, large Unicode collections, deletion and late writes.\n',
  );
} finally {
  await mf.dispose();
}
