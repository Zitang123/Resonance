import { cleanupImages } from '@/lib/account/collection';
import { DUE_JOB } from '@/lib/karina/sync-sql';
import { database, failure, json, machine } from '@/lib/karina/server';
import { syncPage } from '@/lib/karina/sync';
export async function POST(request: Request) {
  try {
    machine(request);
    const now = Date.now(),
      db = database();
    await db.batch([
      db
        .prepare(
          "INSERT INTO system_state(key,value) VALUES ('heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .bind(now),
      db.prepare('DELETE FROM oauth_states WHERE expires<?').bind(now),
      db
        .prepare('DELETE FROM interactions WHERE created_at<?')
        .bind(now - 86400000),
    ]);
    await cleanupImages().catch(() => {});
    const job = await db
      .prepare(DUE_JOB)
      .bind(now, now)
      .first<{ user_id: string }>();
    return json(
      job
        ? await syncPage(job.user_id)
        : { message: 'No history pages are due.' },
    );
  } catch (error) {
    return failure(error);
  }
}
