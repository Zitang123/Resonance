import { QUEUE_SYNC, CHECKPOINT_CONNECTION } from './sync-sql';
import { ApiError, configured, connection, database, setting } from './server';
import { getLastfmPage, ProviderError } from './providers';
import { normalizeHistory } from './history';
import { saveRecords } from './archive';
type Job = {
  user_id: string;
  page: number;
  cutoff: number;
  since: number;
  latest: number;
  phase: string;
  next_run: number;
  lease: number;
};
export async function reserveProvider(name: string, gapMs = 1100) {
  const db = database(),
    now = Date.now();
  await db
    .prepare('INSERT OR IGNORE INTO system_state(key,value) VALUES (?,0)')
    .bind(`rate:${name}`)
    .run();
  const result = await db
    .prepare(
      'UPDATE system_state SET value=? WHERE key=? AND value<=? RETURNING key',
    )
    .bind(now + gapMs, `rate:${name}`, now)
    .first();
  if (!result)
    throw new ApiError(
      'The music service is cooling down. Try again shortly.',
      429,
    );
}
export async function queueSync(owner: string) {
  if (!configured('lastfm') || !(await connection(owner, 'lastfm')))
    throw new ApiError('Connect Last.fm before syncing.', 400);
  const queued = await database()
    .prepare(QUEUE_SYNC)
    .bind(owner, Math.floor(Date.now() / 1000), owner)
    .run();
  if (!queued.meta.changes)
    throw new ApiError(
      'Your Last.fm connection changed. Reconnect before syncing.',
    );
}
export async function syncPage(owner: string) {
  if (!configured('lastfm'))
    throw new ApiError('Last.fm setup is incomplete.', 503);
  const linked = await connection(owner, 'lastfm');
  if (!linked) throw new ApiError('Connect Last.fm before syncing.');
  const db = database(),
    now = Date.now();
  const job = await db
    .prepare(
      "UPDATE sync_jobs SET lease=?,cutoff=CASE WHEN phase='incremental' AND page=1 THEN ? ELSE cutoff END WHERE user_id=? AND lease<? AND next_run<=? RETURNING *",
    )
    .bind(now + 45000, Math.floor(now / 1000), owner, now, now)
    .first<Job>();
  if (!job)
    return {
      message:
        'Your history is already syncing, or waiting for the next allowed request.',
    };
  try {
    await reserveProvider('lastfm');
    const raw = await getLastfmPage(
      linked.name,
      setting('LASTFM_API_KEY'),
      job.page,
      { from: job.since || undefined, to: job.cutoff },
    );
    const { records } = await normalizeHistory(raw, 'lastfm');
    const inserted = await saveRecords(owner, records, {
      connectionUpdatedAt: linked.updated_at,
    });
    const pages = Number(raw.recenttracks['@attr'].totalPages);
    if (!Number.isSafeInteger(pages) || pages < 0)
      throw new ApiError('Last.fm returned an invalid page count.', 502);
    const latest = Math.max(
      job.latest,
      ...records.map((r) => Math.floor(Date.parse(r.playedAt) / 1000)),
    );
    const done = job.page >= pages || !raw.recenttracks.track.length;
    let checkpoint: D1Result;
    if (done)
      checkpoint = await db
        .prepare(
          "UPDATE sync_jobs SET phase='incremental',page=1,cutoff=?,since=?,latest=?,next_run=?,lease=0,last_success=?,error=NULL WHERE user_id=? AND lease=?" +
            CHECKPOINT_CONNECTION,
        )
        .bind(
          Math.floor(now / 1000),
          Math.max(0, latest - 172800),
          latest,
          now + 300000,
          now,
          owner,
          now + 45000,
          linked.updated_at,
        )
        .run();
    else
      checkpoint = await db
        .prepare(
          'UPDATE sync_jobs SET page=page+1,latest=?,next_run=?,lease=0,last_success=?,error=NULL WHERE user_id=? AND lease=?' +
            CHECKPOINT_CONNECTION,
        )
        .bind(latest, now + 1500, now, owner, now + 45000, linked.updated_at)
        .run();
    if (!checkpoint.meta.changes) {
      await db
        .prepare(
          'UPDATE sync_jobs SET lease=0,next_run=? WHERE user_id=? AND lease=?',
        )
        .bind(now + 2000, owner, now + 45000)
        .run();
      return {
        message:
          'Your connection changed. This history page will be retried safely.',
      };
    }
    return {
      complete: done,
      message: `Saved ${inserted} new listens. ${done ? 'History is up to date through the last sync cutoff.' : `Next: archive page ${job.page + 1}.`}`,
    };
  } catch (error) {
    const message =
      error instanceof ProviderError || error instanceof ApiError
        ? error.message
        : 'Sync was interrupted. The next attempt will resume this page.';
    const delay =
      error instanceof ApiError && error.status === 507
        ? 86400000
        : error instanceof ProviderError && error.retryAfter
          ? error.retryAfter * 1000
          : 60000;
    if (error instanceof ProviderError && error.status === 429)
      await db
        .prepare('UPDATE system_state SET value=MAX(value,?) WHERE key=?')
        .bind(now + delay, 'rate:lastfm')
        .run();
    await db
      .prepare(
        'UPDATE sync_jobs SET lease=0,next_run=?,error=? WHERE user_id=? AND lease=?',
      )
      .bind(now + delay, message, owner, now + 45000)
      .run();
    throw new ApiError(
      message,
      error instanceof ProviderError ? error.status : 503,
    );
  }
}
