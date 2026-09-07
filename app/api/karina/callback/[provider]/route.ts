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
  getSpotifyIdentity,
  ProviderError,
} from '@/lib/karina/providers';
import { providerConfig, seal, unseal } from '@/lib/karina/accounts';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  let result = 'error';
  let stage = 'identity',
    providerName = 'unknown';
  try {
    const p = provider((await params).provider);
    providerName = p;
    const owner = user(request),
      url = new URL(request.url),
      state = url.searchParams.get('state') || '';
    stage = 'validation';
    if (
      !configured(p) ||
      url.origin !== setting('RESONANCE_ORIGIN') ||
      !/^[\w-]{32,256}$/.test(state)
    )
      throw new ApiError('Invalid connection.');
    stage = 'state-claim';
    const stored = await database()
      .prepare(
        'UPDATE oauth_states SET used=1 WHERE hash=? AND user_id=? AND provider=? AND expires>? AND used=0 RETURNING verifier',
      )
      .bind(hashState(state), owner, p, Date.now())
      .first<{ verifier: string }>();
    if (!stored) throw new ApiError('Connection expired.');
    if (url.searchParams.has('error')) result = 'cancelled';
    else {
      stage = 'provider-exchange';
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
        const identity = await getSpotifyIdentity(tokens.accessToken);
        externalId = identity.accountId;
        name = identity.displayName;
        credentials = seal(owner, p, tokens);
      }
      stage = 'archive-ownership';
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
      stage = 'connection-save';
      const db = database();
      const otherOwner = await db
        .prepare(
          'SELECT 1 AS present FROM connections WHERE provider=? AND external_id=? AND user_id<>? LIMIT 1',
        )
        .bind(p, externalId, owner)
        .first();
      if (otherOwner) {
        result = 'account-conflict';
        throw new ApiError(
          'This provider account is already linked elsewhere.',
          409,
        );
      }
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
  } catch (error) {
    if (
      result === 'error' &&
      providerName === 'spotify' &&
      error instanceof ProviderError
    )
      result =
        error.code === 'forbidden'
          ? 'spotify-access'
          : error.code === 'rate_limited'
            ? 'provider-busy'
            : error.code === 'unauthorized'
              ? 'expired'
              : 'error';
    // Only fixed classifications; never log exceptions, URLs, tokens or identities.
    console.error('Karina account connection failed', {
      provider: providerName,
      stage,
      code:
        error instanceof ProviderError
          ? error.code
          : error instanceof ApiError
            ? 'request_rejected'
            : 'internal',
      status:
        error instanceof ProviderError || error instanceof ApiError
          ? error.status
          : 500,
    });
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
