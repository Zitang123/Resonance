import { spotifyPlaying } from '@/lib/karina/accounts';
import { connection, failure, json, user } from '@/lib/karina/server';
import { ProviderError } from '@/lib/karina/providers';

export async function GET(request: Request) {
  try {
    const owner = user(request);
    if (!(await connection(owner, 'spotify')))
      return json({ connected: false, playing: null });
    const playing = await spotifyPlaying(owner);
    if (!(await connection(owner, 'spotify')))
      return json({ connected: false, playing: null });
    return json({ connected: true, playing });
  } catch (error) {
    if (error instanceof ProviderError)
      return json(
        {
          error:
            error.code === 'unauthorized'
              ? 'Reconnect Spotify to restore access.'
              : error.code === 'forbidden'
                ? 'Spotify has not enabled access for this account. Resonance currently has limited beta access.'
                : error.code === 'rate_limited'
                  ? 'Spotify is busy. Wait a little before refreshing.'
                  : 'Spotify could not be reached. Please try again shortly.',
          reconnect: error.code === 'unauthorized',
        },
        error.status,
      );
    return failure(error);
  }
}
