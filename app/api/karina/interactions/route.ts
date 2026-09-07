import { waitUntil } from 'cloudflare:workers';
import { database, json, setting } from '@/lib/karina/server';
import {
  commandReply,
  parseInteraction,
  replyVisibility,
  verifyDiscord,
  type ParsedCommandInteraction,
  type ListeningSnapshot,
} from '@/lib/karina/protocol';
import {
  archiveSignals,
  periodStart,
  recentRecords,
} from '@/lib/karina/archive';
import { connection, configured } from '@/lib/karina/server';
import { spotifyPlaying } from '@/lib/karina/accounts';
import { getLastfmPage } from '@/lib/karina/providers';
import { queueSync, reserveProvider } from '@/lib/karina/sync';
import { renderWeekChart } from '@/lib/karina/chart';
const privateError = (message: string) =>
  json({
    type: 4,
    data: { content: message, flags: 64, allowed_mentions: { parse: [] } },
  });
export async function POST(request: Request) {
  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response('Invalid body', { status: 400 });
    let bytes = 0,
      raw = '';
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 1_048_576) {
        await reader.cancel();
        return new Response('Too large', { status: 413 });
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    if (
      !(await verifyDiscord(
        raw,
        request.headers.get('x-signature-ed25519') || '',
        request.headers.get('x-signature-timestamp') || '',
        setting('DISCORD_PUBLIC_KEY'),
      ))
    )
      return new Response('Invalid signature', { status: 401 });
    const command = parseInteraction(JSON.parse(raw));
    if (!command) return new Response('Invalid command', { status: 400 });
    if (command.kind === 'ping') return json({ type: 1 });
    if (command.applicationId !== setting('DISCORD_CLIENT_ID'))
      return new Response('Wrong application', { status: 401 });
    const db = database();
    // Resolve the invoker, never an installation owner or a supplied slash-command user ID.
    const owner = await db
      .prepare(
        "SELECT user_id FROM connections WHERE provider='discord' AND external_id=?",
      )
      .bind(command.actorId)
      .first<{ user_id: string }>();
    if (
      !owner ||
      command.command === 'connect' ||
      command.command === 'privacy'
    )
      return json(
        commandReply(command, {
          linked: !!owner,
          siteUrl: setting('RESONANCE_ORIGIN'),
        }),
      );
    const inserted = await db
      .prepare('INSERT OR IGNORE INTO interactions(id,created_at) VALUES (?,?)')
      .bind(command.id, Date.now())
      .run();
    if (!inserted.meta.changes)
      return privateError('This command has already been received.');
    waitUntil(finish(command, owner.user_id));
    return json({
      type: 5,
      data: { flags: replyVisibility(command) === 'public' ? 0 : 64 },
    });
  } catch {
    return privateError(
      'Karina could not start this command. Try again in a moment.',
    );
  }
}
async function finish(command: ParsedCommandInteraction, owner: string) {
  const endpoint = `https://discord.com/api/v10/webhooks/${command.applicationId}/${encodeURIComponent(command.token)}/messages/@original`;
  try {
    const linked = await connection(owner, 'lastfm');
    const source = linked
      ? 'lastfm'
      : (
          await database()
            .prepare(
              "SELECT source FROM listens WHERE user_id=? AND source IN ('lastfm','listenbrainz') GROUP BY source ORDER BY CASE source WHEN 'lastfm' THEN 0 ELSE 1 END LIMIT 1",
            )
            .bind(owner)
            .first<{ source: 'lastfm' | 'listenbrainz' }>()
        )?.source || 'lastfm';
    const snapshot: ListeningSnapshot = {
      linked: true,
      siteUrl: setting('RESONANCE_ORIGIN'),
      source: source === 'lastfm' ? 'Last.fm' : 'ListenBrainz',
    };
    let png: Uint8Array | undefined;
    if (command.command === 'fm' || command.command === 'nowplaying') {
      snapshot.nowPlaying = await spotifyPlaying(owner);
      if (!snapshot.nowPlaying && linked && configured('lastfm')) {
        await reserveProvider('lastfm');
        const page = await getLastfmPage(
          linked.name,
          setting('LASTFM_API_KEY'),
        );
        const current = page.recenttracks.track.find(
          (t) =>
            (t['@attr'] as Record<string, unknown> | undefined)?.nowplaying ===
            'true',
        );
        if (current) {
          const a = current.artist as Record<string, unknown> | string;
          snapshot.nowPlaying = {
            title: typeof current.name === 'string' ? current.name : '',
            artist:
              typeof a === 'string'
                ? a
                : typeof a?.['#text'] === 'string'
                  ? a['#text']
                  : typeof a?.name === 'string'
                    ? a.name
                    : '',
            url: typeof current.url === 'string' ? current.url : undefined,
            playing: true,
          };
        }
      }
      if (snapshot.nowPlaying && 'source' in snapshot.nowPlaying)
        snapshot.source = String(snapshot.nowPlaying.source);
    } else if (command.command === 'sync') {
      await queueSync(owner);
      snapshot.syncMessage =
        'Your next history page is queued. It will run when the background scheduler checks in; you can also sync from Resonance.';
    } else if (command.command === 'recent')
      snapshot.recent = await recentRecords(owner, source, 10);
    else if (command.command === 'artistplays') {
      const row = await database()
        .prepare(
          'SELECT artist name,COUNT(*) count,MIN(played_at) first,MAX(played_at) last FROM listens WHERE user_id=? AND source=? AND artist=? COLLATE NOCASE GROUP BY artist COLLATE NOCASE LIMIT 1',
        )
        .bind(owner, source, command.artist || '')
        .first<{ name: string; count: number; first: string; last: string }>();
      snapshot.artistPlays = row || {
        name: command.artist || '',
        count: 0,
        first: null,
        last: null,
      };
    } else if (command.command === 'discoveries') {
      snapshot.discoveries = (
        await database()
          .prepare(
            'SELECT artist name,COUNT(*) count,MIN(played_at) first FROM listens WHERE user_id=? AND source=? GROUP BY artist COLLATE NOCASE HAVING MIN(played_at)>=? AND MIN(played_at)<=? ORDER BY first DESC,name LIMIT 10',
          )
          .bind(
            owner,
            source,
            periodStart(command.period),
            new Date().toISOString(),
          )
          .all<{ name: string; count: number; first: string }>()
      ).results;
    } else {
      const signals = await archiveSignals(owner, source, command.period);
      snapshot.topArtists = signals.topArtists;
      snapshot.topAlbums = signals.topAlbums;
      snapshot.topTracks = signals.topTracks;
      snapshot.stats = {
        count: signals.count,
        artistCount: signals.uniqueArtists,
        trackCount: signals.uniqueTracks,
        first: signals.coverage.first,
        last: signals.coverage.last,
        durationMs: signals.totalDurationMs,
        source: snapshot.source!,
      };
      if (command.command === 'chart' && signals.count)
        png = renderWeekChart(signals.weekHours, `${snapshot.source} / UTC`);
    }
    const reply = commandReply(command, snapshot).data;
    if (png) {
      const form = new FormData();
      form.set(
        'payload_json',
        JSON.stringify({
          ...reply,
          attachments: [{ id: 0, filename: 'karina-week.png' }],
          embeds: reply.embeds?.map((e, i) =>
            i === 0
              ? { ...e, image: { url: 'attachment://karina-week.png' } }
              : e,
          ),
        }),
      );
      form.set(
        'files[0]',
        new Blob([new Uint8Array(png)], { type: 'image/png' }),
        'karina-week.png',
      );
      await send(endpoint, { method: 'PATCH', body: form });
    } else
      await send(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reply),
      });
  } catch {
    // A public defer cannot become private. Keep the original error generic; no account details.
    try {
      await send(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content:
            'Karina could not finish this request. Open Resonance to check your connection and try again.',
          embeds: [],
          allowed_mentions: { parse: [] },
        }),
      });
    } catch {
      /* A failed delivery is never logged with its interaction token. */
    }
  }
}
async function send(url: string, init: RequestInit) {
  const result = await fetch(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
  });
  if (!result.ok) throw Error('Discord delivery failed');
}
