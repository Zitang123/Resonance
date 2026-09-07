/* oxlint-disable no-control-regex -- Reject or strip untrusted control characters at provider boundaries. */
import type {
  HistorySource,
  ListenRecord,
  ListeningSignals,
  SignalOptions,
  RankedCount,
} from './types.ts';
export type * from './types.ts';

const SOURCES: HistorySource[] = ['lastfm', 'listenbrainz', 'spotify-export'];
const MAX_FILE_RECORDS = 250_000;
const MAX_BATCH_RECORDS = 1000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_UNIX_SECONDS = 253402300799;
const encoder = new TextEncoder();
type Dict = Record<string, unknown>;
type Candidate = Omit<ListenRecord, 'id'>;
export type NormalizationResult = {
  records: ListenRecord[];
  skipped: number;
  warnings: string[];
};
const isObject = (value: unknown): value is Dict =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function sourceValue(value: unknown): HistorySource {
  if (!SOURCES.includes(value as HistorySource))
    throw new Error('Choose a supported listening history source.');
  return value as HistorySource;
}
function field(value: unknown, label: string, required = true): string {
  if (!required && (value === undefined || value === null)) return '';
  if (
    typeof value !== 'string' ||
    value.length > 2000 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)
  )
    throw new Error(`${label} must be text.`);
  const text = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if ((required && !text) || text.length > 500)
    throw new Error(
      `${label} must contain ${required ? '1–500' : 'at most 500'} characters.`,
    );
  return text;
}
function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40)
    throw new Error('A timestamp with an explicit timezone is required.');
  const text = value.trim().replace(' ', 'T');
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      text,
    );
  if (
    !match ||
    !validDay(match[1]) ||
    Number(match[2]) > 23 ||
    Number(match[3]) > 59 ||
    Number(match[4] || 0) > 59
  )
    throw new Error('A valid timestamp with an explicit timezone is required.');
  const complete = `${match[1]}T${match[2]}:${match[3]}:${match[4] || '00'}${match[5] || ''}${match[6]}`;
  const time = Date.parse(complete);
  if (
    !Number.isFinite(time) ||
    time < 0 ||
    time > MAX_UNIX_SECONDS * 1000 + 999
  )
    throw new Error('Listening timestamp is out of range.');
  return new Date(time).toISOString();
}
function unixTimestamp(value: unknown): string {
  const number =
    typeof value === 'string' && /^\d{1,12}$/.test(value)
      ? Number(value)
      : value;
  if (
    typeof number !== 'number' ||
    !Number.isSafeInteger(number) ||
    number < 0 ||
    number > MAX_UNIX_SECONDS
  )
    throw new Error('A valid Unix timestamp is required.');
  return new Date(number * 1000).toISOString();
}
function duration(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_DURATION_MS
  )
    throw new Error('Duration must be milliseconds between zero and 24 hours.');
  return value;
}
function nestedText(value: unknown): unknown {
  return isObject(value) ? (value['#text'] ?? value.name) : value;
}
function sourceArray(input: unknown, source: HistorySource): unknown[] {
  let records: unknown = input;
  if (source === 'lastfm' && isObject(input) && isObject(input.recenttracks))
    records = input.recenttracks.track;
  if (source === 'listenbrainz' && isObject(input))
    records = isObject(input.payload) ? input.payload.listens : input.listens;
  if (source === 'lastfm' && isObject(records)) records = [records];
  if (!Array.isArray(records))
    throw new Error(
      `The file does not contain a supported ${source} listening history list.`,
    );
  if (records.length > MAX_FILE_RECORDS)
    throw new Error('One history file can contain at most 250,000 records.');
  return records;
}
function candidate(row: unknown, source: HistorySource): Candidate | null {
  if (!isObject(row)) return null;
  if (source === 'lastfm') {
    if (
      isObject(row['@attr']) &&
      [true, 'true'].includes(row['@attr'].nowplaying as boolean | string)
    )
      return null;
    if (!isObject(row.date)) return null;
    return {
      source,
      playedAt: unixTimestamp(row.date.uts),
      title: field(row.name, 'Track title'),
      artist: field(nestedText(row.artist), 'Artist'),
      album: field(nestedText(row.album), 'Album', false),
      durationMs: null,
    };
  }
  if (source === 'listenbrainz') {
    if (!isObject(row.track_metadata)) return null;
    const metadata = row.track_metadata;
    // A recording's catalogue duration is not proof of time actually played.
    return {
      source,
      playedAt: unixTimestamp(row.listened_at),
      title: field(metadata.track_name, 'Track title'),
      artist: field(metadata.artist_name, 'Artist'),
      album: field(metadata.release_name, 'Album', false),
      durationMs: null,
    };
  }
  const extended =
    Object.hasOwn(row, 'ts') ||
    Object.hasOwn(row, 'master_metadata_track_name');
  return {
    source,
    playedAt: timestamp(extended ? row.ts : row.endTime),
    title: field(
      extended ? row.master_metadata_track_name : row.trackName,
      'Track title',
    ),
    artist: field(
      extended ? row.master_metadata_album_artist_name : row.artistName,
      'Artist',
    ),
    album: field(
      extended ? row.master_metadata_album_album_name : row.albumName,
      'Album',
      false,
    ),
    durationMs: duration(extended ? row.ms_played : row.msPlayed),
  };
}
async function contentId(record: Candidate): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(
      JSON.stringify([
        record.source,
        record.playedAt,
        record.title,
        record.artist,
        record.album,
        record.durationMs,
      ]),
    ),
  );
  return `${record.source}:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Normalize on the user's device before sending only the seven allowlisted fields. */
export async function normalizeHistory(
  input: unknown,
  source: HistorySource,
): Promise<NormalizationResult> {
  sourceValue(source);
  const rows = sourceArray(input, source),
    unique = new Map<string, Candidate>();
  let skipped = 0,
    ambiguousDates = 0;
  for (const row of rows) {
    if (
      source === 'spotify-export' &&
      isObject(row) &&
      !Object.hasOwn(row, 'ts') &&
      typeof row.endTime === 'string' &&
      !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.endTime.trim())
    ) {
      ambiguousDates++;
      skipped++;
      continue;
    }
    try {
      const record = candidate(row, source);
      if (!record) {
        skipped++;
        continue;
      }
      const key = JSON.stringify([
        record.source,
        record.playedAt,
        record.title,
        record.artist,
        record.album,
        record.durationMs,
      ]);
      if (unique.has(key)) {
        skipped++;
        continue;
      }
      unique.set(key, record);
    } catch {
      skipped++;
    }
  }
  const candidates = [...unique.values()],
    records: ListenRecord[] = [];
  // Bound concurrent digest work for large files, instead of creating 250k promises.
  for (let start = 0; start < candidates.length; start += 128) {
    records.push(
      ...(await Promise.all(
        candidates
          .slice(start, start + 128)
          .map(async (record) => ({ id: await contentId(record), ...record })),
      )),
    );
  }
  records.sort(
    (a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id),
  );
  return {
    records,
    skipped,
    warnings: ambiguousDates
      ? [
          `Skipped ${ambiguousDates} Spotify record${ambiguousDates === 1 ? '' : 's'} without an explicit timezone. Their listening times cannot be identified unambiguously.`,
        ]
      : [],
  };
}

/** Structural API boundary validation. Extra export/device/location fields are dropped. */
export function validateRecords(input: unknown): ListenRecord[] {
  if (!Array.isArray(input) || input.length > MAX_BATCH_RECORDS)
    throw new Error('A history batch must contain at most 1,000 records.');
  const ids = new Set<string>();
  return input.map((value, index) => {
    if (!isObject(value))
      throw new Error(`Record ${index + 1} must be an object.`);
    const source = sourceValue(value.source);
    if (
      typeof value.id !== 'string' ||
      !new RegExp(`^${source}:[a-f0-9]{64}$`).test(value.id)
    )
      throw new Error(`Record ${index + 1} has an invalid identity.`);
    if (ids.has(value.id))
      throw new Error('A history batch contains duplicate record identities.');
    ids.add(value.id);
    if (!Object.hasOwn(value, 'durationMs') || !Object.hasOwn(value, 'album'))
      throw new Error(
        'Each record must specify album and durationMs, using an empty album or null duration when unknown.',
      );
    if (
      typeof value.album !== 'string' ||
      (value.durationMs !== null && typeof value.durationMs !== 'number')
    )
      throw new Error(
        'Album must be text and durationMs must be a number or null.',
      );
    const record = {
      id: value.id,
      source,
      playedAt: timestamp(value.playedAt),
      title: field(value.title, 'Track title'),
      artist: field(value.artist, 'Artist'),
      album: field(value.album, 'Album', false),
      durationMs: duration(value.durationMs),
    };
    if (source !== 'spotify-export' && record.durationMs !== null)
      throw new Error(
        'This source does not establish actual listening duration.',
      );
    return record;
  });
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timezone: string): Intl.DateTimeFormat {
  if (typeof timezone !== 'string' || !timezone || timezone.length > 100)
    throw new Error('Choose a valid timezone.');
  let result = formatters.get(timezone);
  if (!result) {
    try {
      result = new Intl.DateTimeFormat('en-CA-u-ca-iso8601-nu-latn', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      throw new Error('Choose a valid timezone.');
    }
    if (formatters.size > 100) formatters.clear();
    formatters.set(timezone, result);
  }
  return result;
}
function localParts(
  time: string | number,
  format: Intl.DateTimeFormat,
): { date: string; hour: number; day: number } {
  const parts = format.formatToParts(new Date(time)),
    get = (type: string) => parts.find((part) => part.type === type)!.value;
  const date = `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
  return {
    date,
    hour: Number(get('hour')),
    day: (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7,
  };
}
const shiftDay = (date: string, offset: number): string =>
  new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
function bound(value: string | undefined): { date?: string; instant?: string } {
  if (value === undefined) return {};
  if (validDay(value)) return { date: value };
  return { instant: timestamp(value) };
}
function ranks(counts: Map<string, RankedCount>): RankedCount[] {
  return [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.name.localeCompare(b.name) ||
      (a.artist || '').localeCompare(b.artist || ''),
  );
}

/** Descriptive counts only. Sources are always filtered before aggregation. */
export function calculateSignals(
  records: ListenRecord[],
  options: SignalOptions,
): ListeningSignals {
  const source = sourceValue(options.source),
    format = formatter(options.timezone),
    from = bound(options.from),
    to = bound(options.to);
  if (
    (from.date && to.date && from.date > to.date) ||
    (from.instant && to.instant && from.instant > to.instant)
  )
    throw new Error('The start of the range must not be after its end.');
  const daily = new Map<string, number>(),
    artists = new Map<string, RankedCount>(),
    tracks = new Map<string, RankedCount>(),
    albums = new Map<string, RankedCount>();
  const hourly = Array<number>(24).fill(0),
    weekHours = Array.from({ length: 168 }, (_, index) => ({
      day: Math.floor(index / 24),
      hour: index % 24,
      count: 0,
    }));
  const seen = new Set<string>();
  let count = 0,
    knownDurationRecords = 0,
    totalDurationMs = 0,
    first: string | null = null,
    last: string | null = null;
  for (const record of records) {
    if (record.source !== source || seen.has(record.id)) continue;
    seen.add(record.id);
    const local = localParts(record.playedAt, format);
    if (
      (from.date && local.date < from.date) ||
      (to.date && local.date > to.date) ||
      (from.instant && record.playedAt < from.instant) ||
      (to.instant && record.playedAt > to.instant)
    )
      continue;
    count++;
    daily.set(local.date, (daily.get(local.date) || 0) + 1);
    hourly[local.hour]++;
    weekHours[local.day * 24 + local.hour].count++;
    if (source === 'spotify-export' && record.durationMs !== null) {
      knownDurationRecords++;
      totalDurationMs += record.durationMs;
    }
    const artistKey = record.artist,
      trackKey = JSON.stringify([record.artist, record.title]),
      albumKey = JSON.stringify([record.artist, record.album]);
    artists.set(artistKey, {
      name: record.artist,
      count: (artists.get(artistKey)?.count || 0) + 1,
    });
    tracks.set(trackKey, {
      name: record.title,
      artist: record.artist,
      count: (tracks.get(trackKey)?.count || 0) + 1,
    });
    if (record.album)
      albums.set(albumKey, {
        name: record.album,
        artist: record.artist,
        count: (albums.get(albumKey)?.count || 0) + 1,
      });
    if (first === null || record.playedAt < first) first = record.playedAt;
    if (last === null || record.playedAt > last) last = record.playedAt;
  }
  const days = [...daily.keys()].sort();
  let longestStreak = 0,
    running = 0,
    previous: string | undefined;
  for (const date of days) {
    running = previous && shiftDay(previous, 1) === date ? running + 1 : 1;
    longestStreak = Math.max(longestStreak, running);
    previous = date;
  }
  const today = localParts(Date.now(), format).date;
  let currentStreak = 0,
    cursor = daily.has(today) ? today : shiftDay(today, -1);
  while (daily.has(cursor)) {
    currentStreak++;
    cursor = shiftDay(cursor, -1);
  }
  let entropyBits = 0;
  for (const artist of artists.values()) {
    const share = artist.count / count;
    entropyBits -= share * Math.log2(share);
  }
  return {
    source,
    count,
    uniqueArtists: artists.size,
    uniqueTracks: tracks.size,
    totalDurationMs: knownDurationRecords ? totalDurationMs : null,
    knownDurationRecords,
    daily: days.map((date) => ({ date, count: daily.get(date)! })),
    hourly,
    weekHours,
    topArtists: ranks(artists),
    topTracks: ranks(tracks),
    topAlbums: ranks(albums),
    activeDays: days.length,
    currentStreak,
    longestStreak,
    entropyBits,
    effectiveArtists: count ? 2 ** entropyBits : 0,
    repeatShare: count ? (count - tracks.size) / count : 0,
    coverage: { first, last },
  };
}
