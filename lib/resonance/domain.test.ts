import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  EMPTY_STATE,
  STORAGE_KEYS,
  sampleState,
  safeProviderLink,
  findDuplicates,
  mergeItem,
  selectTonight,
  searchItems,
  stats,
  validateBackup,
  serializeBackup,
  readStorage,
  writeStorage,
  normalizeListens,
  mergeListens,
  localDay,
} from './domain.ts';
import type { MusicItem, State, StorageLike } from './types.ts';

function item(patch: Partial<MusicItem> = {}): MusicItem {
  return {
    id: 'one',
    title: 'Déjà Vu',
    artist: 'Beyoncé',
    type: 'track',
    links: [],
    savedAt: '2026-09-01T12:00:00.000Z',
    recommendedBy: '',
    note: '',
    tags: [],
    status: 'saved',
    ...patch,
  };
}
function state(patch: Partial<State> = {}): State {
  return { ...structuredClone(EMPTY_STATE), ...patch };
}
class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

void test('provider links are identified, tracking removed, and dangerous links rejected', () => {
  assert.deepEqual(
    safeProviderLink(
      'https://open.spotify.com/track/0123456789ABCDEFGHIJKL?si=secret&utm_source=x#part',
    ),
    {
      provider: 'Spotify',
      url: 'https://open.spotify.com/track/0123456789ABCDEFGHIJKL',
    },
  );
  assert.equal(
    safeProviderLink(
      'https://music.apple.com/gb/album/in-rainbows/1109714933?i=1109715132&app=music',
    ).url,
    'https://music.apple.com/gb/album/in-rainbows/1109714933?i=1109715132',
  );
  assert.equal(
    safeProviderLink(
      'https://www.youtube.com/watch?v=abcd_123456&t=20&list=tracking',
    ).provider,
    'YouTube',
  );
  assert.equal(
    safeProviderLink('https://youtu.be/abcd_123456').provider,
    'YouTube',
  );
  assert.equal(
    safeProviderLink('https://music.apple.com/gb/song/1109715132').provider,
    'Apple Music',
  );
  assert.equal(
    safeProviderLink('https://artist.bandcamp.com/album/a-record').provider,
    'Bandcamp',
  );
  for (const link of [
    'javascript:alert(1)',
    'data:text/html,test',
    'http://youtu.be/test',
    'https://youtube.com.evil.test/watch?v=x',
    'https://youtube.com/redirect?q=https://evil.test',
    'https://open.spotify.com@evil.test/track/0123456789ABCDEFGHIJKL',
    'https://user:pass@youtu.be/a',
    'https://evilbandcamp.com/album/a',
    'https://open.spotify.com:8888/track/a',
    '//youtu.be/test',
    'https://open.spotify.com/track/abc',
    'https://open.spotify.com/album/0123456789ABCDEFGHIJKLM',
    'https://youtu.be/short',
    'https://youtube.com/watch?v=abcd_123456&v=other_12345',
    'https://music.apple.com/gb/album/anything',
    'https://music.apple.com/gb/album/title/not-a-number',
    'https://music.apple.com/gb/song/123?i=broken',
  ])
    assert.throws(
      () => safeProviderLink(link),
      (error) => error instanceof Error,
      link,
    );
});

void test('duplicates handle Unicode accents and common remaster labels, with type boundaries', () => {
  const items = [
    item(),
    item({ id: 'album', type: 'album' }),
    item({ id: 'live', title: 'Déjà Vu (Live)' }),
  ];
  assert.deepEqual(
    findDuplicates(items, {
      title: 'de\u0301ja\u0300   vu — 2011 Remaster',
      artist: 'BEYONCE',
      type: 'track',
    }).map((i) => i.id),
    ['one'],
  );
  assert.deepEqual(
    findDuplicates(items, {
      title: 'Deja Vu',
      artist: 'Beyonce',
      type: 'album',
    }).map((i) => i.id),
    ['album'],
  );
  assert.deepEqual(
    findDuplicates(items, {
      title: 'Other song',
      artist: 'Beyonce',
      type: 'track',
    }),
    [],
  );
  assert.equal(
    findDuplicates(
      [
        item({
          links: [
            {
              provider: 'Spotify',
              url: 'https://open.spotify.com/track/0123456789ABCDEFGHIJKL?si=one',
            },
          ],
        }),
      ],
      {
        title: 'Alt title',
        artist: 'Alt',
        type: 'track',
        links: [
          {
            provider: 'Spotify',
            url: 'https://open.spotify.com/track/0123456789ABCDEFGHIJKL?si=two',
          },
        ],
      },
    ).length,
    1,
  );
});

void test('merge keeps original identity, earliest save and trial, notes and unique tags/links', () => {
  const existing = item({
    note: 'First note',
    recommendedBy: 'Maya',
    tags: ['Café'],
    status: 'keep',
    triedAt: '2026-09-03T12:00:00Z',
    links: [
      {
        provider: 'Spotify',
        url: 'https://open.spotify.com/track/0123456789ABCDEFGHIJKL?si=one',
      },
    ],
  });
  const result = mergeItem(existing, {
    id: 'replacement',
    note: 'Second note',
    recommendedBy: 'Alex',
    tags: ['cafe', 'quiet'],
    status: 'saved',
    savedAt: '2026-09-01T13:00:00+02:00',
    triedAt: '2026-09-05T12:00:00Z',
    links: [
      {
        provider: 'Spotify',
        url: 'https://open.spotify.com/track/0123456789ABCDEFGHIJKL?si=two',
      },
    ],
  });
  assert.equal(result.id, 'one');
  assert.equal(result.savedAt, '2026-09-01T13:00:00+02:00');
  assert.equal(result.triedAt, existing.triedAt);
  assert.equal(result.status, 'keep');
  assert.equal(result.note, 'First note\n\nSecond note');
  assert.equal(result.recommendedBy, 'Maya\n\nAlex');
  assert.deepEqual(result.tags, ['cafe', 'quiet']);
  assert.equal(result.links.length, 1);
  assert.equal(existing.note, 'First note');
});

void test('duplicate detection never merges implicitly, and live versions remain distinct', () => {
  const original = item({ id: 'studio', title: 'Déjà Vu' });
  const live = item({ id: 'live', title: 'Déjà Vu (Live)' });
  const candidate = item({
    id: 'new',
    title: 'Deja Vu',
    note: 'Another recommendation',
  });
  const items = [original, live];
  const before = structuredClone(items);
  assert.deepEqual(
    findDuplicates(items, candidate).map((value) => value.id),
    ['studio'],
  );
  assert.deepEqual(
    findDuplicates(items, live).map((value) => value.id),
    ['live'],
  );
  assert.deepEqual(items, before);
  assert.equal(items.length, 2);
  const separatelySaved = [...items, candidate];
  assert.equal(
    validateBackup(serializeBackup(state({ items: separatelySaved }))).items
      .length,
    3,
  );
  const explicitlyMerged = mergeItem(original, candidate);
  assert.equal(explicitlyMerged.id, 'studio');
  assert.equal(explicitlyMerged.note, candidate.note);
  assert.deepEqual(items, before);
});

void test('duplicate merge preserves reminders and verified metadata until explicitly replaced', () => {
  const original = item({
    revisitDate: '2026-09-10',
    triedAt: '2026-09-03T12:00:00Z',
    metadata: { source: 'musicbrainz', id: 'verified-recording' },
  });
  for (const patch of [
    {
      revisitDate: undefined,
      metadata: undefined,
      triedAt: undefined,
      title: undefined,
    },
    { revisitDate: '', metadata: { source: 'manual' as const } },
    { metadata: { source: 'musicbrainz' as const } },
  ]) {
    const merged = mergeItem(original, patch);
    assert.equal(merged.revisitDate, original.revisitDate);
    assert.equal(merged.triedAt, original.triedAt);
    assert.equal(merged.title, original.title);
    assert.deepEqual(merged.metadata, original.metadata);
  }
  const replaced = mergeItem(original, {
    revisitDate: '2026-10-01',
    metadata: { source: 'musicbrainz', id: 'another-explicit-match' },
  });
  assert.equal(replaced.revisitDate, '2026-10-01');
  assert.deepEqual(replaced.metadata, {
    source: 'musicbrainz',
    id: 'another-explicit-match',
  });
  assert.equal(original.revisitDate, '2026-09-10');
});

void test('Tonight is deterministic, obeys exclusions, pins, mood tags and status modes', () => {
  const collection = sampleState('2026-09-07T12:00:00Z');
  const options = { mode: 'mix' as const, date: '2026-09-07', limit: 5 };
  assert.deepEqual(
    selectTonight(collection, options),
    selectTonight(collection, options),
  );
  const picks = selectTonight(collection, {
    ...options,
    excludedIds: ['sample-1'],
    pinnedIds: ['sample-8'],
  });
  assert.equal(picks[0].item.id, 'sample-8');
  assert.ok(!picks.some((pick) => pick.item.id === 'sample-1'));
  assert.ok(picks.every((pick) => pick.reason.length > 10));
  assert.equal(new Set(picks.map((pick) => pick.item.id)).size, picks.length);
  assert.ok(
    selectTonight(collection, { mode: 'familiar', date: '2026-09-07' }).every(
      (pick) => ['tried', 'keep'].includes(pick.item.status),
    ),
  );
  assert.ok(
    selectTonight(collection, {
      mode: 'unexplored',
      tag: 'FOCUS',
      date: '2026-09-07',
    }).every(
      (pick) =>
        pick.item.status === 'saved' && pick.item.tags.includes('focus'),
    ),
  );
  assert.deepEqual(selectTonight(state(), options), []);
});

void test('mixed Tonight includes both familiar and waiting music without reminders', () => {
  const collection = state({
    items: Array.from({ length: 20 }, (_, i) =>
      item({ id: `${i}`, status: i < 10 ? 'saved' : 'keep' }),
    ),
  });
  const picks = selectTonight(collection, {
    mode: 'mix',
    date: '2026-09-07',
    limit: 4,
  });
  assert.deepEqual(
    picks.map((pick) => pick.item.status),
    ['saved', 'keep', 'saved', 'keep'],
  );
});

void test('Tonight surfaces oldest untried recommendations before newer saves', () => {
  const collection = state({
    items: [
      item({
        id: 'newest',
        savedAt: '2026-09-07T12:00:00Z',
        recommendedBy: 'Maya',
      }),
      item({
        id: 'oldest',
        savedAt: '2026-07-01T12:00:00Z',
        recommendedBy: 'Alex',
      }),
      item({ id: 'middle', savedAt: '2026-08-01T12:00:00Z' }),
    ],
  });
  for (const date of ['2026-09-07', '2026-09-08']) {
    const picks = selectTonight(collection, { mode: 'unexplored', date });
    assert.deepEqual(
      picks.map((pick) => pick.item.id),
      ['oldest', 'middle', 'newest'],
    );
    assert.equal(picks[0].reason, 'Waiting since 2026-07-01 · from Alex');
  }
  assert.equal(
    selectTonight(collection, {
      mode: 'unexplored',
      date: '2026-09-07',
      pinnedIds: ['newest'],
    })[0].item.id,
    'newest',
  );
  collection.items[0].revisitDate = '2026-09-07';
  assert.equal(
    selectTonight(collection, { mode: 'unexplored', date: '2026-09-07' })[0]
      .item.id,
    'newest',
  );
});

void test('familiar Tonight uses latest manual session/revisit instead of lifetime count', () => {
  const collection = state({
    items: [
      item({ id: 'recent', status: 'keep' }),
      item({ id: 'older', status: 'keep' }),
    ],
    moments: [
      {
        id: 'r',
        itemId: 'recent',
        date: '2026-09-06T12:00:00Z',
        kind: 'session',
        source: 'manual',
        note: '',
      },
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `o${i}`,
        itemId: 'older',
        date: `2026-08-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
        kind: 'revisit' as const,
        source: 'manual' as const,
        note: '',
      })),
      {
        id: 'memory',
        itemId: 'older',
        date: '2026-09-07T12:00:00Z',
        kind: 'memory',
        source: 'manual',
        note: 'A thought, not a recorded listen',
      },
      {
        id: 'import',
        itemId: 'older',
        date: '2026-09-07T13:00:00Z',
        kind: 'imported',
        source: 'listenbrainz',
        externalId: 'external',
        title: 'Déjà Vu',
        artist: 'Beyoncé',
        note: '',
      },
      {
        id: 'unlinked',
        date: '2026-09-07T14:00:00Z',
        kind: 'session',
        source: 'manual',
        title: 'Déjà Vu',
        artist: 'Beyoncé',
        note: '',
      },
    ],
  });
  const picks = selectTonight(collection, {
    mode: 'familiar',
    date: '2026-09-07',
  });
  assert.deepEqual(
    picks.map((pick) => pick.item.id),
    ['older', 'recent'],
  );
  assert.equal(picks[0].reason, 'Keeper · last logged 2026-08-20');
  collection.moments.push({
    id: 'new-revisit',
    itemId: 'older',
    date: '2026-09-07T15:00:00Z',
    kind: 'revisit',
    source: 'manual',
    note: '',
  });
  assert.deepEqual(
    selectTonight(collection, { mode: 'familiar', date: '2026-09-07' }).map(
      (pick) => pick.item.id,
    ),
    ['recent', 'older'],
  );
  collection.items.push(item({ id: 'unlogged', status: 'keep' }));
  const noLog = selectTonight(collection, {
    mode: 'familiar',
    date: '2026-09-07',
  })[0];
  assert.equal(noLog.item.id, 'unlogged');
  assert.match(noLog.reason, /no session or revisit logged yet/);
});

void test('date ranges use local calendar days, include end of day, and count recorded actions', () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'Europe/London';
  try {
    assert.equal(localDay('2026-09-06T23:30:00Z'), '2026-09-07');
    const collection = state({
      items: [
        item({
          savedAt: '2026-09-06T23:30:00Z',
          status: 'keep',
          triedAt: '2026-09-08T13:00:00Z',
        }),
        item({ id: 'unknown', status: 'tried' }),
      ],
      moments: [
        {
          id: 'a',
          date: '2026-09-07T22:59:59Z',
          note: '',
          kind: 'session',
          source: 'manual',
        },
        {
          id: 'b',
          date: '2026-09-07T23:00:00Z',
          note: '',
          kind: 'revisit',
          source: 'manual',
        },
        {
          id: 'c',
          date: '2026-09-06T23:00:00Z',
          note: '',
          kind: 'memory',
          source: 'manual',
        },
      ],
    });
    assert.deepEqual(stats(collection, '2026-09-07', '2026-09-07'), {
      saved: 1,
      tried: 0,
      sessions: 1,
      revisits: 0,
      imported: 0,
      memories: 1,
    });
    assert.equal(stats(collection, '2026-09-08', '2026-09-08').tried, 1);
    assert.equal(stats(collection).tried, 2);
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
});

void test('backup round-trip retains all supported records and preferences without shared mutation', () => {
  const original = sampleState('2026-09-07T12:00:00Z');
  original.preferences.lowerEffects = true;
  const restored = validateBackup(serializeBackup(original));
  assert.deepEqual(restored, original);
  restored.items[0].note = 'changed';
  assert.notEqual(restored.items[0].note, original.items[0].note);
});

void test('backup canonicalizes offset timestamps so string sorting follows actual time', () => {
  const original = state({
    items: [
      item({
        id: 'earlier',
        savedAt: '2026-09-07T12:00:00+02:00',
        triedAt: '2026-09-08T12:00:00+02:00',
        revisitDate: '2026-09-10',
      }),
      item({ id: 'later', savedAt: '2026-09-07T11:00:00Z' }),
    ],
    capsules: [
      {
        id: 'capsule',
        title: 'Evening',
        description: '',
        theme: 'copper',
        itemIds: [],
        createdAt: '2026-09-07T12:00:00+02:00',
      },
    ],
    moments: [
      {
        id: 'moment',
        date: '2026-09-07T12:00:00+02:00',
        note: '',
        kind: 'session',
        source: 'manual',
      },
    ],
    historyCoverage: {
      source: 'listenbrainz',
      user: 'alice',
      from: '2026-09-01T02:00:00+02:00',
      to: '2026-09-07T02:00:00+02:00',
      importedAt: '2026-09-07T12:00:00+02:00',
    },
  });
  const restored = validateBackup(JSON.stringify(original));
  assert.equal(restored.items[0].savedAt, '2026-09-07T10:00:00.000Z');
  assert.equal(restored.items[0].triedAt, '2026-09-08T10:00:00.000Z');
  assert.equal(restored.items[0].revisitDate, '2026-09-10');
  assert.equal(restored.capsules[0].createdAt, '2026-09-07T10:00:00.000Z');
  assert.equal(restored.moments[0].date, '2026-09-07T10:00:00.000Z');
  assert.equal(restored.historyCoverage?.from, '2026-09-01T00:00:00.000Z');
  assert.deepEqual(
    [...restored.items]
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .map((item) => item.id),
    ['later', 'earlier'],
  );
});

void test('backup enforces imported provenance and unique external IDs', () => {
  const imported = normalizeListens(
    [
      {
        listened_at: 1788784200,
        track_metadata: { track_name: 'Title', artist_name: 'Artist' },
      },
    ],
    'alice',
  )[0];
  const importState = state({ moments: [imported] });
  assert.equal(validateBackup(JSON.stringify(importState)).moments.length, 1);
  for (const moment of [
    { ...imported, kind: 'session' as const },
    { ...imported, source: 'manual' as const },
    { ...imported, externalId: undefined },
    {
      id: 'bad',
      date: '2026-09-07T12:00:00Z',
      note: '',
      kind: 'session' as const,
      source: 'listenbrainz' as const,
    },
  ])
    assert.throws(
      () => validateBackup(JSON.stringify(state({ moments: [moment] }))),
      /imported|Imported/,
    );
  assert.throws(
    () =>
      validateBackup(
        JSON.stringify(
          state({ moments: [imported, { ...imported, id: 'different-id' }] }),
        ),
      ),
    /duplicate external IDs/,
  );
});

void test('backup rejects malformed, future version, unsafe, invalid nested and dangling data', () => {
  assert.throws(() => validateBackup('{broken'), /valid JSON/);
  assert.throws(
    () => validateBackup(JSON.stringify({ ...EMPTY_STATE, version: 99 })),
    /version/,
  );
  const mutations: [(data: State) => void, RegExp][] = [
    [
      (data) => {
        data.items[0].title = '';
      },
      /Title/,
    ],
    [
      (data) => {
        data.items[0].tags = [123 as unknown as string];
      },
      /Tag/,
    ],
    [
      (data) => {
        data.items[0].revisitDate = '2026-02-30';
      },
      /calendar date/,
    ],
    [
      (data) => {
        data.items[0].savedAt = '2026-02-30T12:00:00Z';
      },
      /calendar date/,
    ],
    [
      (data) => {
        data.items[0].triedAt = 'tomorrow';
      },
      /date and time/,
    ],
    [
      (data) => {
        data.items[0].links = [
          { provider: 'Spotify', url: 'javascript:alert(1)' },
        ];
      },
      /HTTPS/,
    ],
    [
      (data) => {
        data.items[0].links = [
          { provider: 'Spotify', url: 'https://youtu.be/abcd_123456' },
        ];
      },
      /provider/,
    ],
    [
      (data) => {
        data.items.push(data.items[0]);
      },
      /duplicate IDs/,
    ],
    [
      (data) => {
        data.capsules[0].itemIds.push('missing');
      },
      /missing/,
    ],
    [
      (data) => {
        data.moments[0].itemId = 'missing';
      },
      /missing/,
    ],
    [
      (data) => {
        data.capsules[0].image = 'data:image/svg+xml;base64,AAA=';
      },
      /image/,
    ],
    [
      (data) => {
        data.preferences.lowerEffects = 'yes' as unknown as boolean;
      },
      /preference/,
    ],
  ];
  for (const [mutate, message] of mutations) {
    const data = sampleState('2026-09-07T12:00:00Z');
    mutate(data);
    assert.throws(() => validateBackup(JSON.stringify(data)), message);
  }
  assert.throws(
    () => validateBackup(' '.repeat(16 * 1024 * 1024 + 1)),
    /too large/,
  );
});

void test('personal/sample storage is isolated and restored correctly', () => {
  const storage = new MemoryStorage();
  assert.equal(readStorage('personal', storage).state.items.length, 0);
  assert.equal(readStorage('sample', storage).state.items.length, 12);
  writeStorage('personal', state({ items: [item()] }), storage);
  writeStorage('sample', sampleState(), storage);
  assert.equal(readStorage('personal', storage).state.items.length, 1);
  assert.equal(readStorage('sample', storage).state.items.length, 12);
  assert.equal(storage.data.size, 2);
});

void test('corrupted storage is reported and is never overwritten implicitly', () => {
  const storage = new MemoryStorage();
  storage.data.set(STORAGE_KEYS.personal, '{broken');
  assert.match(readStorage('personal', storage).error || '', /untouched/);
  assert.throws(() => writeStorage('personal', state(), storage), /preserved/);
  assert.equal(storage.getItem(STORAGE_KEYS.personal), '{broken');
});

void test('storage denial and quota errors surface to the caller', () => {
  const blocked: StorageLike = {
    getItem() {
      throw new Error('Access denied');
    },
    setItem() {
      throw new Error('Access denied');
    },
  };
  assert.match(readStorage('personal', blocked).error || '', /Access denied/);
  assert.throws(
    () => writeStorage('personal', state(), blocked),
    /Access denied/,
  );
  const full: StorageLike = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error('Quota exceeded');
    },
  };
  assert.throws(
    () => writeStorage('personal', state(), full),
    /could not be saved.*Quota/,
  );
});

void test('ListenBrainz records normalize, ignore bad input and deduplicate repeat imports per user', () => {
  const listen = {
    listened_at: 1788784200,
    track_metadata: {
      track_name: 'Déjà Vu',
      artist_name: 'Beyoncé',
      additional_info: { private: 'discard' },
    },
  };
  const moments = normalizeListens(
    [listen, listen, {}, null, { ...listen, listened_at: Infinity }],
    'alice',
  );
  assert.equal(moments.length, 1);
  assert.equal(moments[0].source, 'listenbrainz');
  assert.equal(moments[0].note, '');
  assert.deepEqual(normalizeListens([listen], 'alice'), moments);
  assert.notEqual(
    normalizeListens([listen], 'bob')[0].externalId,
    moments[0].externalId,
  );
  assert.notEqual(
    normalizeListens([listen], 'alice-a')[0].externalId,
    normalizeListens([listen], 'alice_a')[0].externalId,
  );
  const coverage = {
    source: 'listenbrainz' as const,
    user: 'alice',
    from: '2026-09-01T00:00:00Z',
    to: '2026-09-07T23:59:59Z',
    importedAt: '2026-09-07T12:00:00Z',
  };
  const imported = mergeListens(state(), moments, coverage);
  const repeated = mergeListens(imported, moments, {
    ...coverage,
    from: '2026-08-01T00:00:00Z',
  });
  assert.equal(repeated.moments.length, 1);
  assert.equal(repeated.historyCoverage?.from, '2026-08-01T00:00:00.000Z');
  assert.equal(stats(repeated).imported, 1);
  assert.deepEqual(validateBackup(serializeBackup(repeated)), repeated);
  assert.equal(imported.historyCoverage?.from, '2026-09-01T00:00:00.000Z');
});

void test('5000 saved items search and Tonight stay bounded and interactive', () => {
  const collection = state({
    items: Array.from({ length: 5000 }, (_, i) =>
      item({
        id: `item-${i}`,
        title: i % 7 === 0 ? `Café nights ${i}` : `Record ${i}`,
        artist: `Artist ${i % 37}`,
        status: i % 3 === 0 ? 'keep' : 'saved',
        tags: ['evening'],
      }),
    ),
  });
  const start = performance.now();
  const found = searchItems(collection.items, 'CAFE evening');
  const picks = selectTonight(collection, {
    mode: 'mix',
    date: '2026-09-07',
    limit: 7,
  });
  const elapsed = performance.now() - start;
  assert.equal(found.length, 715);
  assert.equal(picks.length, 7);
  assert.ok(
    elapsed < 1500,
    `5000-record search and selection took ${elapsed.toFixed(1)} ms`,
  );
});
