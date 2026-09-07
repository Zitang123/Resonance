import { ApiError, database, failure, json, user } from '@/lib/karina/server';
export async function GET(request: Request) {
  try {
    const owner = user(request);
    const cursor = new URL(request.url).searchParams.get('cursor') || '';
    if (cursor && !/^(?:lastfm|listenbrainz):[a-f0-9]{64}$/.test(cursor))
      throw new ApiError('Invalid export cursor.');
    const records = (
      await database()
        .prepare(
          'SELECT id,source,played_at AS playedAt,title,artist,album,duration_ms AS durationMs FROM listens WHERE user_id=? AND id>? ORDER BY id LIMIT 1000',
        )
        .bind(owner, cursor)
        .all<{ id: string }>()
    ).results;
    // Each page is a separate bounded request; the client writes the complete backup file.
    return json({
      records,
      nextCursor: records.length === 1000 ? records.at(-1)!.id : null,
    });
  } catch (error) {
    return failure(error);
  }
}
