export const QUEUE_SYNC =
  "INSERT INTO sync_jobs(user_id,cutoff) SELECT ?,? WHERE EXISTS (SELECT 1 FROM connections WHERE user_id=? AND provider='lastfm') ON CONFLICT(user_id) DO UPDATE SET next_run=MIN(next_run,excluded.next_run)";
export const DUE_JOB =
  "SELECT sync_jobs.user_id FROM sync_jobs INNER JOIN connections ON connections.user_id=sync_jobs.user_id AND connections.provider='lastfm' WHERE next_run<=? AND lease<? ORDER BY next_run,sync_jobs.user_id LIMIT 1";
export const CHECKPOINT_CONNECTION =
  " AND EXISTS (SELECT 1 FROM connections WHERE connections.user_id=sync_jobs.user_id AND provider='lastfm' AND updated_at=?)";
