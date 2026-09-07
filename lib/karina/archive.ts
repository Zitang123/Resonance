import { ApiError, database } from './server';
import { validateRecords, calculateSignals } from './history';
import { LASTFM_BUDGET_CHECK } from './storage-budget';
import type {
  HistorySource,
  ListenRecord,
  ListeningSignals,
  RankedCount,
} from './types';
export function historySource(value: unknown): HistorySource {
  if (value === 'spotify-export')
    throw new ApiError(
      'Spotify archive analytics are not enabled while permission for this use is unresolved.',
      403,
    );
  if (value !== 'lastfm' && value !== 'listenbrainz')
    throw new ApiError('Choose Last.fm or ListenBrainz history.');
  return value;
}
export async function saveRecords(
  userId: string,
  input: unknown,
  guard?: { connectionUpdatedAt: number },
) {
  let records: ListenRecord[];
  try {
    records = validateRecords(input);
  } catch (error) {
    throw new ApiError((error as Error).message);
  }
  if (records.length > 200)
    throw new ApiError('Upload at most 200 records in each batch.');
  for (const record of records) {
    historySource(record.source);
    if (Date.parse(record.playedAt) > Date.now() + 300000)
      throw new ApiError('Listening records cannot be dated in the future.');
    record.durationMs = null;
  }
  // Recompute IDs at the trust boundary so changing a client ID cannot inflate counts.
  records = await Promise.all(
    records.map(async (r) => {
      const data = JSON.stringify([
        r.source,
        r.playedAt,
        r.title,
        r.artist,
        r.album,
        r.durationMs,
      ]);
      const hash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)),
      );
      return {
        ...r,
        id: `${r.source}:${Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')}`,
      };
    }),
  );
  const db = database();
  const queries: D1PreparedStatement[] = [];
  for (let i = 0; i < records.length; i += 8) {
    const chunk = records.slice(i, i + 8);
    const values = chunk.flatMap((r) => [
      userId,
      r.id,
      r.source,
      r.playedAt,
      r.title,
      r.artist,
      r.album,
      r.durationMs,
      ...(guard ? [userId, guard.connectionUpdatedAt] : []),
    ]);
    const insertion = guard
      ? chunk
          .map(
            () =>
              "SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM connections WHERE user_id=? AND provider='lastfm' AND updated_at=?)",
          )
          .join(' UNION ALL ')
      : `VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?)').join(',')}`;
    queries.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO listens (user_id,id,source,played_at,title,artist,album,duration_ms) ${insertion} RETURNING id`,
        )
        .bind(...values),
    );
  }
  if (!queries.length) return 0;
  if (records.some((r) => r.source === 'lastfm'))
    queries.push(db.prepare(LASTFM_BUDGET_CHECK));
  try {
    const result = await db.batch(queries);
    // RETURNING counts only inserted listens, excluding budget bookkeeping.
    return result.reduce((sum, r) => sum + r.results.length, 0);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('lastfm_archive_limit')
    )
      throw new ApiError(
        'Last.fm imports are paused because Resonance has reached its shared storage allowance. Your saved history is safe. The operator must resolve the allowance before imports can continue.',
        507,
      );
    throw error;
  }
}
export function periodStart(period: string) {
  const days: Record<string, number> = {
    '7day': 7,
    '1month': 30,
    '3month': 90,
    '12month': 365,
  };
  if (period === 'overall') return '1970-01-01T00:00:00.000Z';
  if (!days[period]) throw new ApiError('Choose a supported period.');
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  now.setUTCDate(now.getUTCDate() - days[period] + 1);
  return now.toISOString();
}
export async function archiveSignals(
  userId: string,
  source: HistorySource,
  period = 'overall',
): Promise<ListeningSignals> {
  historySource(source);
  const db = database(),
    from = periodStart(period),
    to = new Date().toISOString();
  const where =
    'user_id = ? AND source = ? AND played_at >= ? AND played_at <= ?';
  const query = (sql: string) => db.prepare(sql).bind(userId, source, from, to);
  const results = await db.batch([
    query(
      `SELECT COUNT(*) count, COUNT(DISTINCT artist) uniqueArtists, COUNT(DISTINCT json_array(artist,title)) uniqueTracks, SUM(duration_ms) totalDurationMs, COUNT(duration_ms) knownDurationRecords, MIN(played_at) first, MAX(played_at) last FROM listens WHERE ${where}`,
    ),
    query(
      `SELECT substr(played_at,1,10) date,COUNT(*) count FROM listens WHERE ${where} GROUP BY date ORDER BY date`,
    ),
    query(
      `SELECT (CAST(strftime('%w',played_at) AS INTEGER)+6)%7 day,CAST(strftime('%H',played_at) AS INTEGER) hour,COUNT(*) count FROM listens WHERE ${where} GROUP BY day,hour`,
    ),
    query(
      `SELECT artist name,COUNT(*) count FROM listens WHERE ${where} GROUP BY artist ORDER BY count DESC,name LIMIT 50`,
    ),
    query(
      `SELECT title name,artist,COUNT(*) count FROM listens WHERE ${where} GROUP BY artist,title ORDER BY count DESC,name LIMIT 50`,
    ),
    query(
      `SELECT album name,artist,COUNT(*) count FROM listens WHERE ${where} AND album <> '' GROUP BY artist,album ORDER BY count DESC,name LIMIT 50`,
    ),
    query(
      `SELECT n,COUNT(*) artists FROM (SELECT COUNT(*) n FROM listens WHERE ${where} GROUP BY artist) GROUP BY n`,
    ),
  ]);
  const totals = results[0].results[0] as {
    count: number;
    uniqueArtists: number;
    uniqueTracks: number;
    totalDurationMs: number | null;
    knownDurationRecords: number;
    first: string | null;
    last: string | null;
  };
  const daily = results[1].results as { date: string; count: number }[],
    cells = results[2].results as {
      day: number;
      hour: number;
      count: number;
    }[];
  const blank = calculateSignals([], { source, timezone: 'UTC' });
  const weekHours = blank.weekHours.map((cell) => ({
    ...cell,
    count:
      cells.find((c) => c.day === cell.day && c.hour === cell.hour)?.count || 0,
  }));
  const hourly = Array.from({ length: 24 }, (_, hour) =>
    cells.filter((c) => c.hour === hour).reduce((sum, c) => sum + c.count, 0),
  );
  let entropyBits = 0;
  for (const row of results[6].results as { n: number; artists: number }[]) {
    const p = row.n / totals.count;
    entropyBits -= row.artists * p * Math.log2(p);
  }
  let longestStreak = 0,
    run = 0,
    previous = 0;
  for (const day of daily) {
    const ts = Date.parse(day.date);
    run = ts - previous === 86400000 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = ts;
  }
  const dates = new Set(daily.map((d) => d.date));
  let cursor = Date.parse(new Date().toISOString().slice(0, 10));
  if (!dates.has(new Date(cursor).toISOString().slice(0, 10)))
    cursor -= 86400000;
  let currentStreak = 0;
  while (dates.has(new Date(cursor).toISOString().slice(0, 10))) {
    currentStreak++;
    cursor -= 86400000;
  }
  return {
    ...blank,
    ...totals,
    source,
    daily,
    hourly,
    weekHours,
    topArtists: results[3].results as RankedCount[],
    topTracks: results[4].results as RankedCount[],
    topAlbums: results[5].results as RankedCount[],
    activeDays: daily.length,
    currentStreak,
    longestStreak,
    entropyBits,
    effectiveArtists: totals.count ? 2 ** entropyBits : 0,
    repeatShare: totals.count
      ? (totals.count - totals.uniqueTracks) / totals.count
      : 0,
    coverage: { first: totals.first, last: totals.last },
  };
}
export async function recentRecords(
  userId: string,
  source: HistorySource,
  limit = 30,
) {
  return (
    await database()
      .prepare(
        'SELECT id,source,played_at AS playedAt,title,artist,album,duration_ms AS durationMs FROM listens WHERE user_id=? AND source=? ORDER BY played_at DESC,id DESC LIMIT ?',
      )
      .bind(userId, source, limit)
      .all<ListenRecord>()
  ).results;
}
