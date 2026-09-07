import { reserveProvider } from './sync';
import {
  ApiError,
  configured,
  connection,
  database,
  setting,
  type Provider,
} from './server';
import { decryptCredential, encryptCredential } from './crypto';
import {
  getSpotifyNowPlaying,
  refreshSpotifyToken,
  type ProviderConfig,
  type SpotifyTokens,
} from './providers';
export function providerConfig(): ProviderConfig {
  return {
    origin: setting('RESONANCE_ORIGIN'),
    callbackPaths: {
      lastfm: '/api/karina/callback/lastfm',
      discord: '/api/karina/callback/discord',
      spotify: '/api/karina/callback/spotify',
    },
    lastfmApiKey: setting('LASTFM_API_KEY'),
    lastfmApiSecret: setting('LASTFM_SHARED_SECRET'),
    discordClientId: setting('DISCORD_CLIENT_ID'),
    discordClientSecret: setting('DISCORD_CLIENT_SECRET'),
    spotifyClientId: setting('SPOTIFY_CLIENT_ID'),
    spotifyClientSecret: setting('SPOTIFY_CLIENT_SECRET'),
  };
}
export function seal(owner: string, provider: Provider, value: unknown) {
  return encryptCredential(
    JSON.stringify(value),
    setting('KARINA_TOKEN_KEY'),
    `${owner}:${provider}`,
  );
}
export function unseal<T>(owner: string, provider: Provider, value: string): T {
  return JSON.parse(
    decryptCredential(
      value,
      setting('KARINA_TOKEN_KEY'),
      `${owner}:${provider}`,
    ),
  );
}
export async function spotifyPlaying(owner: string) {
  if (!configured('spotify')) return null;
  const linked = await connection(owner, 'spotify');
  if (!linked?.credentials) return null;
  let tokens = unseal<SpotifyTokens>(owner, 'spotify', linked.credentials);
  if (tokens.expiresAt < Date.now() + 60000) {
    // Only one request may refresh this connection at a time. Disconnect wins over a late refresh.
    const key = `spotify-refresh:${owner}`,
      now = Date.now();
    await database()
      .prepare('INSERT OR IGNORE INTO system_state(key,value) VALUES (?,0)')
      .bind(key)
      .run();
    const lease = await database()
      .prepare(
        'UPDATE system_state SET value=? WHERE key=? AND value<? RETURNING key',
      )
      .bind(now + 30000, key, now)
      .first();
    if (!lease)
      throw new ApiError('Spotify is refreshing. Try again in a moment.', 429);
    try {
      const current = await connection(owner, 'spotify');
      if (!current?.credentials) return null;
      tokens = unseal<SpotifyTokens>(owner, 'spotify', current.credentials);
      if (tokens.expiresAt < Date.now() + 60000) {
        tokens = await refreshSpotifyToken(tokens, providerConfig());
        const saved = await database()
          .prepare(
            "UPDATE connections SET credentials=? WHERE user_id=? AND provider='spotify' AND credentials=?",
          )
          .bind(seal(owner, 'spotify', tokens), owner, current.credentials)
          .run();
        if (!saved.meta.changes) return null;
      }
    } finally {
      await database()
        .prepare('UPDATE system_state SET value=0 WHERE key=? AND value=?')
        .bind(key, now + 30000)
        .run();
    }
  }
  await reserveProvider('spotify');
  const active = await connection(owner, 'spotify');
  if (!active || active.updated_at !== linked.updated_at) return null;
  // Never insert a currently-playing snapshot into the listening archive.
  const snapshot = await getSpotifyNowPlaying(tokens.accessToken);
  const latest = await connection(owner, 'spotify');
  if (!latest || latest.updated_at !== linked.updated_at) return null;
  return snapshot
    ? {
        title: snapshot.name,
        artist: snapshot.artists.join(', '),
        url: snapshot.url || undefined,
        playing: snapshot.isPlaying,
        source: 'Spotify',
      }
    : null;
}
