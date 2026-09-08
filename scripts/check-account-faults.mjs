import assert from 'node:assert/strict';
import {
  backend,
  load,
  domain,
  history,
  budget,
} from './account-test-harness.mjs';

const picture =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2i8AAAAASUVORK5CYII=';
const state = {
  ...structuredClone(domain.EMPTY_STATE),
  capsules: [
    {
      id: 'photo',
      title: 'Photo',
      description: 'Private',
      theme: 'copper',
      itemIds: [],
      createdAt: '2026-09-08T12:00:00Z',
      image: picture,
    },
  ],
};
const createRoom = (t) =>
  t.sql
    .prepare('INSERT INTO rooms(user_id,revision,updated_at) VALUES (?,?,?)')
    .run('alice', 'before', 1);

{
  const t = backend();
  try {
    createRoom(t);
    t.flags.failAck = true;
    const result = await t.collection.saveCollection('alice', 'before', state);
    const saved = t.sql.prepare('SELECT * FROM rooms').get();
    assert.equal(saved.revision, result.revision);
    assert.equal(t.images.has(saved.image_key), true);
    await t.collection.cleanupImages();
    assert.equal(t.images.has(saved.image_key), true);
    console.log(
      'PASS committed save survives lost acknowledgement and cleanup',
    );
  } finally {
    t.sql.close();
  }
}
{
  const t = backend();
  try {
    t.sql
      .prepare(
        'INSERT INTO rooms(user_id,revision,image_key,updated_at) VALUES (?,?,?,?)',
      )
      .run('alice', 'before', 'rooms/photo.json', 1);
    t.images.set('rooms/photo.json', '{}');
    t.flags.failDelete = true;
    await t.collection.deleteAccount('alice', 'before');
    assert.equal(t.sql.prepare('SELECT COUNT(*) n FROM rooms').get().n, 0);
    assert.equal(
      t.sql.prepare('SELECT COUNT(*) n FROM room_image_cleanup').get().n,
      1,
    );
    assert.equal(t.images.size, 1);
    t.flags.failDelete = false;
    await t.collection.cleanupImages();
    assert.equal(t.images.size, 0);
    assert.equal(
      t.sql.prepare('SELECT COUNT(*) n FROM room_image_cleanup').get().n,
      0,
    );
    console.log(
      'PASS deletion retains cleanup through R2 failure and retries successfully',
    );
  } finally {
    t.sql.close();
  }
}
for (const recreate of [false, true]) {
  const t = backend();
  try {
    createRoom(t);
    const archive = load('lib/karina/archive.ts', {
      '../account/collection': t.collection,
      './server': t.server,
      './history': history,
      './storage-budget': budget,
    });
    t.flags.beforeBatch = () => {
      t.sql.prepare('DELETE FROM rooms WHERE user_id=?').run('alice');
      if (recreate)
        t.sql
          .prepare(
            'INSERT INTO rooms(user_id,revision,updated_at) VALUES (?,?,?)',
          )
          .run('alice', 'after', 2);
      t.flags.beforeBatch = null;
    };
    const inserted = await archive.saveRecords('alice', [
      {
        id: 'listenbrainz:' + 'a'.repeat(64),
        source: 'listenbrainz',
        playedAt: '2026-09-01T00:00:00.000Z',
        title: 'Track',
        artist: 'Artist',
        album: '',
        durationMs: null,
      },
    ]);
    assert.equal(inserted, 0);
    assert.equal(t.sql.prepare('SELECT COUNT(*) n FROM listens').get().n, 0);
    console.log(
      'PASS late import blocked after deletion' +
        (recreate ? ' and recreation' : ''),
    );
  } finally {
    t.sql.close();
  }
}
for (const recreate of [false, true]) {
  const t = backend();
  try {
    createRoom(t);
    const oauth = load('app/api/karina/oauth/[provider]/route.ts', {
      '@/lib/account/collection': t.collection,
      '@/lib/karina/server': t.server,
      '@/lib/karina/crypto': {
        hashState: (value) => value,
        randomToken: () => 'x'.repeat(48),
      },
      '@/lib/karina/providers': {
        makeAuthorization: () => 'https://provider.test/authorize',
      },
      '@/lib/karina/accounts': {
        providerConfig: () => ({}),
        seal: () => 'encrypted-verifier',
      },
    });
    t.flags.beforeBatch = () => {
      t.sql.prepare('DELETE FROM rooms WHERE user_id=?').run('alice');
      if (recreate)
        t.sql
          .prepare(
            'INSERT INTO rooms(user_id,revision,updated_at) VALUES (?,?,?)',
          )
          .run('alice', 'after', 2);
      t.flags.beforeBatch = null;
    };
    const response = await oauth.GET(
      new Request('https://room.test/api/karina/oauth/discord', {
        headers: { 'oai-authenticated-user-id': 'alice' },
      }),
      { params: Promise.resolve({ provider: 'discord' }) },
    );
    assert.equal(response.status, 409);
    assert.equal(
      t.sql.prepare('SELECT COUNT(*) n FROM oauth_states').get().n,
      0,
    );
    console.log(
      'PASS late OAuth initiation blocked after deletion' +
        (recreate ? ' and recreation' : ''),
    );
  } finally {
    t.sql.close();
  }
}
