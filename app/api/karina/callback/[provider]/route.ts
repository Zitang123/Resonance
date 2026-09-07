import {
  ApiError,
  configured,
  connection,
  database,
  provider,
  setting,
  user,
} from '@/lib/karina/server';
import { linkStatements } from '@/lib/karina/link-sql';
import { hashState } from '@/lib/karina/crypto';
import {
  exchangeDiscord,
  exchangeLastfm,
  exchangeSpotify,
} from '@/lib/karina/providers';
import { providerConfig, seal, unseal } from '@/lib/karina/accounts';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  let result = 'error';
  try {
    const owner = user(request),
      p = provider((await params).provider),
      url = new URL(request.url),
      state = url.searchParams.get('state') || '';
    if (
      !configured(p) ||
      url.origin !== setting('RESONANCE_ORIGIN') ||
      !/^[\w-]{32,256}$/.test(state)
    )
      throw new ApiError('Invalid connection.');
    const stored = await database()
      .prepare(
        'UPDATE oauth_states SET used=1 WHERE hash=? AND user_id=? AND provider=? AND expires>? AND used=0 RETURNING verifier',
      )
      .bind(hashState(state), owner, p, Date.now())
      .first<{ verifier: string }>();
    if (!stored) throw new ApiError('Connection expired.');
    if (url.searchParams.has('error')) result = 'cancelled';
    else {
      const config = providerConfig();
      let externalId = '',
        name = '',
        credentials: string | null = null;
      if (p === 'lastfm') {
        const session = await exchangeLastfm(
          url.searchParams.get('token') || '',
          config,
        );
        externalId = session.username.toLowerCase();
        name = session.username;
        credentials = seal(owner, p, session);
      } else if (p === 'discord') {
        const identity = await exchangeDiscord(
          url.searchParams.get('code') || '',
          config,
        );
        externalId = identity.id;
        name = identity.globalName || identity.username;
      } else {
        const tokens = await exchangeSpotify(
          url.searchParams.get('code') || '',
          unseal<string>(owner, p, stored.verifier),
          config,
        );
        externalId = owner;
        name = 'Spotify account';
        credentials = seal(owner, p, tokens);
      }
      const previous = await connection(owner, p);
      const archiveOwner =
        p === 'lastfm'
          ? await database()
              .prepare(
                "SELECT external_id FROM archive_owners WHERE user_id=? AND source='lastfm'",
              )
              .bind(owner)
              .first<{ external_id: string }>()
          : null;
      const existingRows =
        p === 'lastfm'
          ? await database()
              .prepare(
                "SELECT 1 AS present FROM listens WHERE user_id=? AND source='lastfm' LIMIT 1",
              )
              .bind(owner)
              .first()
          : null;
      if (
        p === 'lastfm' &&
        ((archiveOwner && archiveOwner.external_id !== externalId) ||
          (!archiveOwner && existingRows))
      ) {
        result = 'archive-conflict';
        throw new ApiError(
          'Clear the old Last.fm archive before switching identities.',
        );
      }
      if (p === 'lastfm' && previous && previous.external_id !== externalId)
        throw new ApiError(
          'Delete the previous Last.fm archive before switching accounts.',
        );
      const db = database();
      const committed = await db.batch(
        linkStatements({
          owner,
          provider: p,
          externalId,
          name,
          credentials,
          stateHash: hashState(state),
          now: Date.now(),
        }).map((q) => db.prepare(q.sql).bind(...q.params)),
      );
      result = committed[0].meta.changes ? 'success' : 'cancelled';
    }
  } catch {
    /* No provider tokens, response bodies or account identifiers in logs/redirects. */
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/?space=Karina&connection=${result}`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
