import {
  body,
  configured,
  connection,
  database,
  failure,
  json,
  mutation,
  provider,
  runtime,
  setting,
  user,
} from '@/lib/karina/server';
import {
  archiveSignals,
  historySource,
  recentRecords,
  saveRecords,
} from '@/lib/karina/archive';
export async function GET(request: Request) {
  try {
    const id = request.headers.get('oai-authenticated-user-id');
    const db = runtime().DB;
    const connected =
      id && db
        ? (
            await db
              .prepare(
                'SELECT provider,name,updated_at FROM connections WHERE user_id=?',
              )
              .bind(id)
              .all()
          ).results
        : [];
    const sources =
      id && db
        ? (
            await db
              .prepare(
                'SELECT source,COUNT(*) count,MIN(played_at) first,MAX(played_at) last FROM listens WHERE user_id=? GROUP BY source',
              )
              .bind(id)
              .all()
          ).results
        : [];
    const sync =
      id && db
        ? await db
            .prepare(
              'SELECT phase,page,last_success,error,next_run FROM sync_jobs WHERE user_id=?',
            )
            .bind(id)
            .first()
        : null;
    const heartbeat = db
      ? await db
          .prepare("SELECT value FROM system_state WHERE key='heartbeat'")
          .first<{ value: number }>()
      : null;
    const url = new URL(request.url);
    if (url.searchParams.get('view') === 'history') {
      const owner = user(request),
        source = historySource(url.searchParams.get('source'));
      return json({
        signals: await archiveSignals(
          owner,
          source,
          url.searchParams.get('period') || 'overall',
        ),
        recent: await recentRecords(owner, source),
      });
    }
    return json({
      signedIn: !!id,
      database: !!db,
      configured: {
        lastfm: configured('lastfm'),
        discord: configured('discord'),
        spotify: configured('spotify'),
      },
      connected,
      sources,
      sync,
      schedulerLastSeen: heartbeat?.value || null,
      interactionsUrl: `${url.origin}/api/karina/interactions`,
      installUrl: setting('DISCORD_CLIENT_ID')
        ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(setting('DISCORD_CLIENT_ID'))}&scope=applications.commands&integration_type=1`
        : null,
      callbacks: Object.fromEntries(
        ['lastfm', 'discord', 'spotify'].map((p) => [
          p,
          `${url.origin}/api/karina/callback/${p}`,
        ]),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const owner = user(request);
    mutation(request);
    const data = (await body(request)) as Record<string, unknown>;
    if (data.action === 'import')
      return json({ inserted: await saveRecords(owner, data.records) });
    if (data.action === 'disconnect') {
      const p = provider(String(data.provider));
      const existing = await connection(owner, p);
      const queries = [
        database()
          .prepare('DELETE FROM connections WHERE user_id=? AND provider=?')
          .bind(owner, p),
        database()
          .prepare('DELETE FROM oauth_states WHERE user_id=? AND provider=?')
          .bind(owner, p),
      ];
      if (p === 'lastfm')
        queries.push(
          database()
            .prepare('DELETE FROM sync_jobs WHERE user_id=?')
            .bind(owner),
        );
      await database().batch(queries);
      return json({ disconnected: !!existing, archiveRetained: true });
    }
    if (data.action === 'delete') {
      const source = historySource(data.source);
      const queries = [
        database()
          .prepare('DELETE FROM listens WHERE user_id=? AND source=?')
          .bind(owner, source),
      ];
      // Deleting Last.fm history also stops its sync so a scheduler cannot restore it.
      if (source === 'lastfm')
        queries.push(
          database()
            .prepare(
              "DELETE FROM connections WHERE user_id=? AND provider='lastfm'",
            )
            .bind(owner),
          database()
            .prepare('DELETE FROM sync_jobs WHERE user_id=?')
            .bind(owner),
          database()
            .prepare(
              "DELETE FROM archive_owners WHERE user_id=? AND source='lastfm'",
            )
            .bind(owner),
          database()
            .prepare(
              "DELETE FROM oauth_states WHERE user_id=? AND provider='lastfm'",
            )
            .bind(owner),
        );
      await database().batch(queries);
      return json({ deleted: true });
    }
    return json({ error: 'Unknown archive action.' }, 400);
  } catch (error) {
    return failure(error);
  }
}
