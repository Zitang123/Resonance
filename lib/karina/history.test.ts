import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  normalizeHistory,
  validateRecords,
  calculateSignals,
} from './history.ts';
import type { ListenRecord, HistorySource } from './types.ts';

const lastfm = (
  uts: number | string,
  title = 'One',
  artist = 'Artist A',
  album = 'Album A',
) => ({
  name: title,
  artist: { '#text': artist },
  album: { '#text': album },
  date: { uts: String(uts) },
});
const lb = (
  time: number,
  title = 'One',
  artist = 'Artist A',
  album = 'Album A',
) => ({
  listened_at: time,
  track_metadata: {
    track_name: title,
    artist_name: artist,
    release_name: album,
    additional_info: { duration_ms: 222000, ip: 'private' },
  },
});
const spotify = (
  ts: string,
  title = 'One',
  artist = 'Artist A',
  ms = 180000,
  album = 'Album A',
) => ({
  ts,
  ms_played: ms,
  master_metadata_track_name: title,
  master_metadata_album_artist_name: artist,
  master_metadata_album_album_name: album,
  ip_addr_decrypted: 'private',
  platform: 'private',
  conn_country: 'private',
});
const record = (
  n: number,
  patch: Partial<ListenRecord> = {},
): ListenRecord => ({
  id: `lastfm:${n.toString(16).padStart(64, '0')}`,
  source: 'lastfm',
  playedAt: '2026-09-07T12:00:00.000Z',
  title: 'One',
  artist: 'Artist A',
  album: 'Album A',
  durationMs: null,
  ...patch,
});

void test('Last.fm ignores now playing and undated rows, deduplicates exact events and preserves separate times', async () => {
  const input = {
    recenttracks: {
      track: [
        lastfm(1788782400),
        lastfm(1788782400),
        lastfm(1788782401),
        { ...lastfm(1788782402), '@attr': { nowplaying: 'true' } },
        { name: 'Undated', artist: { '#text': 'Artist' } },
      ],
    },
  };
  const normalized = await normalizeHistory(input, 'lastfm');
  assert.equal(normalized.records.length, 2);
  assert.equal(normalized.skipped, 3);
  assert.notEqual(normalized.records[0].id, normalized.records[1].id);
  assert.equal(normalized.records[0].durationMs, null);
  assert.deepEqual(await normalizeHistory(input, 'lastfm'), normalized);
  assert.deepEqual(validateRecords(normalized.records), normalized.records);
});

void test('ListenBrainz extracts payload listens and discards catalogue duration and private extras', async () => {
  const output = await normalizeHistory(
    {
      payload: {
        listens: [
          lb(1788782400),
          lb(1788782400),
          { ...lb(1788782401), listened_at: -1 },
        ],
      },
    },
    'listenbrainz',
  );
  assert.equal(output.records.length, 1);
  assert.equal(output.skipped, 2);
  assert.deepEqual(
    Object.keys(output.records[0]).sort(),
    [
      'id',
      'source',
      'playedAt',
      'title',
      'artist',
      'album',
      'durationMs',
    ].sort(),
  );
  assert.equal(output.records[0].durationMs, null);
  assert.ok(!JSON.stringify(output).includes('private'));
  assert.deepEqual(await normalizeHistory([lb(1788782400)], 'listenbrainz'), {
    ...output,
    skipped: 0,
  });
});

void test('Spotify extended keeps actual milliseconds, canonical timestamps and no location/device fields', async () => {
  const output = await normalizeHistory(
    [
      spotify('2026-09-07T12:00:00+02:00'),
      spotify('2026-09-07T10:00:00Z'),
      spotify('2026-09-07T10:01:00Z', 'Two', 'Artist B', 0),
    ],
    'spotify-export',
  );
  assert.equal(output.records.length, 2);
  assert.equal(output.skipped, 1);
  assert.equal(output.records[0].playedAt, '2026-09-07T10:00:00.000Z');
  assert.equal(output.records[0].durationMs, 180000);
  assert.equal(output.records[1].durationMs, 0);
  assert.ok(!JSON.stringify(output.records).includes('private'));
});

void test('ordinary Spotify records require explicit timezones and report ambiguous dates', async () => {
  const output = await normalizeHistory(
    [
      {
        endTime: '2026-09-07 12:00',
        msPlayed: 30000,
        trackName: 'One',
        artistName: 'Artist',
      },
      {
        endTime: '2026-09-07 12:00+01:00',
        msPlayed: 30000,
        trackName: 'One',
        artistName: 'Artist',
      },
      {
        endTime: '2026-09-07T11:01:00Z',
        msPlayed: 40000,
        trackName: 'Two',
        artistName: 'Artist',
      },
    ],
    'spotify-export',
  );
  assert.equal(output.skipped, 1);
  assert.equal(output.records.length, 2);
  assert.match(output.warnings[0], /without an explicit timezone/);
  assert.equal(output.records[0].playedAt, '2026-09-07T11:00:00.000Z');
  assert.equal(output.records[0].album, '');
});

void test('identity uses Unicode-normalized exact content and source without fuzzy merging', async () => {
  const a = await normalizeHistory(
    [
      lastfm(1788782400, 'Cafe\u0301'),
      lastfm(1788782400, 'Café'),
      lastfm(1788782400, 'Café (Live)'),
      lastfm(1788782400, 'CAFÉ'),
    ],
    'lastfm',
  );
  assert.equal(a.records.length, 3);
  assert.equal(a.skipped, 1);
  const b = await normalizeHistory([lb(1788782400, 'Café')], 'listenbrainz');
  assert.ok(a.records.every((item) => item.id !== b.records[0].id));
  const changed = await normalizeHistory(
    [
      spotify('2026-09-07T10:00:00Z', 'One', 'Artist A', 1000),
      spotify('2026-09-07T10:00:00Z', 'One', 'Artist A', 2000),
      spotify('2026-09-07T10:00:00Z', 'One', 'Artist A', 1000, 'Other album'),
    ],
    'spotify-export',
  );
  assert.equal(changed.records.length, 3);
});

void test('normalizers reject oversized containers and skip malformed values and calendar dates', async () => {
  await assert.rejects(normalizeHistory({}, 'spotify-export'), /history list/);
  await assert.rejects(normalizeHistory(Array(250001), 'lastfm'), /250,000/);
  const rows = [
    spotify('2026-02-30T10:00:00Z'),
    spotify('2026-09-07T24:00:00Z'),
    spotify('2026-09-07T10:00:00Z', 'One', 'Artist', -1),
    spotify('2026-09-07T10:00:00Z', 'One', 'Artist', 86400001),
    spotify('2026-09-07T10:00:00Z', 'x'.repeat(501)),
    spotify('2026-09-07T10:00:00Z', '\u0000bad'),
    { ...spotify('2026-09-07T10:00:00Z'), master_metadata_track_name: null },
  ];
  const result = await normalizeHistory(rows, 'spotify-export');
  assert.equal(result.records.length, 0);
  assert.equal(result.skipped, rows.length);
  assert.equal(
    (
      await normalizeHistory(
        [lb(Infinity), lb(1.5), lb(253402300800)],
        'listenbrainz',
      )
    ).records.length,
    0,
  );
});

void test('API batch validation is bounded, validates identity/source/date/duration and strips extra fields', () => {
  const input = {
    ...record(1),
    ip: 'private',
    playedAt: '2026-09-07T13:00:00+01:00',
  };
  assert.deepEqual(validateRecords([input]), [record(1)]);
  for (const bad of [
    { ...record(1), id: 'bad' },
    { ...record(1), source: 'unknown' },
    { ...record(1), source: 'listenbrainz' },
    { ...record(1), durationMs: -1 },
    { ...record(1), durationMs: 1000 },
    { ...record(1), playedAt: '2026-02-30T12:00:00Z' },
    { ...record(1), title: '' },
    { ...record(1), album: [] },
    { ...record(1), album: null },
    { ...record(1), durationMs: undefined },
  ]) {
    assert.throws(() => validateRecords([bad]));
  }
  const missing = { ...record(1) } as Partial<ListenRecord>;
  delete missing.durationMs;
  assert.throws(
    () => validateRecords([missing]),
    /specify album and durationMs/,
  );
  assert.throws(() => validateRecords([record(1), record(1)]), /duplicate/);
  assert.throws(() => validateRecords(Array(1001).fill(record(1))), /1,000/);
  assert.equal(
    validateRecords(Array.from({ length: 1000 }, (_, i) => record(i))).length,
    1000,
  );
});

void test('known fixture produces exact counts, diversity, repeats, rankings and observed coverage', () => {
  const records = [
    record(1, { playedAt: '2026-09-07T10:00:00.000Z' }),
    record(2, { playedAt: '2026-09-07T11:00:00.000Z' }),
    record(3, {
      title: 'Two',
      artist: 'Artist B',
      album: 'Album B',
      playedAt: '2026-09-08T10:00:00.000Z',
    }),
    record(4, {
      title: 'Three',
      artist: 'Artist B',
      album: '',
      playedAt: '2026-09-10T10:00:00.000Z',
    }),
  ];
  const result = calculateSignals(records, {
    source: 'lastfm',
    timezone: 'UTC',
  });
  assert.equal(result.count, 4);
  assert.equal(result.uniqueArtists, 2);
  assert.equal(result.uniqueTracks, 3);
  assert.equal(result.entropyBits, 1);
  assert.equal(result.effectiveArtists, 2);
  assert.equal(result.repeatShare, 0.25);
  assert.equal(result.totalDurationMs, null);
  assert.equal(result.knownDurationRecords, 0);
  assert.equal(result.activeDays, 3);
  assert.equal(result.longestStreak, 2);
  assert.deepEqual(result.daily, [
    { date: '2026-09-07', count: 2 },
    { date: '2026-09-08', count: 1 },
    { date: '2026-09-10', count: 1 },
  ]);
  assert.equal(result.hourly[10], 3);
  assert.equal(result.hourly[11], 1);
  assert.equal(
    result.weekHours.find((cell) => cell.day === 0 && cell.hour === 10)?.count,
    1,
  );
  assert.deepEqual(result.topArtists, [
    { name: 'Artist A', count: 2 },
    { name: 'Artist B', count: 2 },
  ]);
  assert.deepEqual(result.topTracks[0], {
    name: 'One',
    artist: 'Artist A',
    count: 2,
  });
  assert.equal(result.topAlbums.length, 2);
  assert.deepEqual(result.coverage, {
    first: records[0].playedAt,
    last: records[3].playedAt,
  });
});

void test('sources remain separate even for overlapping song and timestamp histories', async () => {
  const a = (await normalizeHistory([lastfm(1788782400)], 'lastfm')).records;
  const b = (await normalizeHistory([lb(1788782400)], 'listenbrainz')).records;
  const c = (await normalizeHistory([spotify(a[0].playedAt)], 'spotify-export'))
    .records;
  for (const source of [
    'lastfm',
    'listenbrainz',
    'spotify-export',
  ] as HistorySource[]) {
    const result = calculateSignals([...a, ...b, ...c, ...a], {
      source,
      timezone: 'UTC',
    });
    assert.equal(result.count, 1);
    assert.equal(result.source, source);
    assert.equal(
      result.totalDurationMs,
      source === 'spotify-export' ? 180000 : null,
    );
  }
});

void test('actual-duration coverage distinguishes unknown, zero and partial durations', () => {
  const records = [
    record(1, {
      id: `spotify-export:${'1'.repeat(64)}`,
      source: 'spotify-export',
      durationMs: 0,
    }),
    record(2, {
      id: `spotify-export:${'2'.repeat(64)}`,
      source: 'spotify-export',
      durationMs: null,
    }),
    record(3, {
      id: `spotify-export:${'3'.repeat(64)}`,
      source: 'spotify-export',
      durationMs: 180000,
    }),
  ];
  const result = calculateSignals(records, {
    source: 'spotify-export',
    timezone: 'UTC',
  });
  assert.equal(result.totalDurationMs, 180000);
  assert.equal(result.knownDurationRecords, 2);
  assert.equal(
    calculateSignals([records[0]], {
      source: 'spotify-export',
      timezone: 'UTC',
    }).totalDurationMs,
    0,
  );
  assert.equal(
    calculateSignals([records[1]], {
      source: 'spotify-export',
      timezone: 'UTC',
    }).totalDurationMs,
    null,
  );
});

void test('timezone calendar boundaries and daylight-saving repeated hours aggregate correctly', () => {
  const london = calculateSignals(
    [
      record(1, { playedAt: '2026-09-06T23:30:00.000Z' }),
      record(2, { playedAt: '2026-09-07T23:00:00.000Z' }),
    ],
    {
      source: 'lastfm',
      timezone: 'Europe/London',
      from: '2026-09-07',
      to: '2026-09-07',
    },
  );
  assert.equal(london.count, 1);
  assert.deepEqual(london.daily, [{ date: '2026-09-07', count: 1 }]);
  assert.equal(london.hourly[0], 1);
  const ny = calculateSignals(
    [
      record(1, { playedAt: '2026-11-01T05:30:00.000Z' }),
      record(2, { playedAt: '2026-11-01T06:30:00.000Z' }),
    ],
    { source: 'lastfm', timezone: 'America/New_York' },
  );
  assert.equal(ny.hourly[1], 2);
  assert.equal(
    ny.weekHours.find((cell) => cell.day === 6 && cell.hour === 1)?.count,
    2,
  );
  assert.throws(
    () => calculateSignals([], { source: 'lastfm', timezone: 'Made/Up' }),
    /timezone/,
  );
  assert.throws(
    () =>
      calculateSignals([], {
        source: 'lastfm',
        timezone: 'UTC',
        from: '2026-09-08',
        to: '2026-09-07',
      }),
    /start/,
  );
});

void test('current streak is based on today or yesterday, and historical gaps break it', () => {
  const today = new Date().toISOString().slice(0, 10);
  const at = (offset: number) =>
    new Date(
      Date.parse(`${today}T12:00:00Z`) + offset * 86400000,
    ).toISOString();
  const records = [
    record(1, { playedAt: at(0) }),
    record(2, { playedAt: at(-1) }),
    record(3, { playedAt: at(-2) }),
    record(4, { playedAt: at(-4) }),
  ];
  assert.equal(
    calculateSignals(records, { source: 'lastfm', timezone: 'UTC' })
      .currentStreak,
    3,
  );
  assert.equal(
    calculateSignals(records.slice(1), { source: 'lastfm', timezone: 'UTC' })
      .currentStreak,
    2,
  );
  assert.equal(
    calculateSignals(records.slice(2), { source: 'lastfm', timezone: 'UTC' })
      .currentStreak,
    0,
  );
});

void test('empty source returns zero observations and null duration/coverage without invented values', () => {
  const result = calculateSignals([], { source: 'lastfm', timezone: 'UTC' });
  assert.equal(result.count, 0);
  assert.equal(result.entropyBits, 0);
  assert.equal(result.effectiveArtists, 0);
  assert.equal(result.repeatShare, 0);
  assert.equal(result.totalDurationMs, null);
  assert.deepEqual(result.coverage, { first: null, last: null });
  assert.equal(result.hourly.length, 24);
  assert.equal(result.weekHours.length, 168);
  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 0);
});

void test('5000-record normalization and aggregation remain bounded and interactive', async () => {
  const input = Array.from({ length: 5000 }, (_, i) =>
    spotify(
      new Date(1788782400000 + i * 180000).toISOString(),
      `Track ${i % 200}`,
      `Artist ${i % 37}`,
    ),
  );
  const started = performance.now();
  const normalized = await normalizeHistory(input, 'spotify-export');
  const signals = calculateSignals(normalized.records, {
    source: 'spotify-export',
    timezone: 'Europe/London',
  });
  const elapsed = performance.now() - started;
  assert.equal(normalized.records.length, 5000);
  assert.equal(signals.count, 5000);
  assert.ok(elapsed < 5000, `5000 records took ${elapsed.toFixed(1)} ms`);
});
