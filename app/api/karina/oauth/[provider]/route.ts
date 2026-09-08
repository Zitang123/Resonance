import { room } from '@/lib/account/collection';
import {
  ApiError,
  configured,
  database,
  failure,
  provider,
  setting,
  user,
} from '@/lib/karina/server';
import { hashState, randomToken } from '@/lib/karina/crypto';
import { makeAuthorization } from '@/lib/karina/providers';
import { providerConfig, seal } from '@/lib/karina/accounts';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const owner = user(request),
      p = provider((await params).provider);
    if (!configured(p))
      throw new ApiError(
        'This connection is not available yet. Resonance needs to finish its service setup.',
        503,
      );
    if (new URL(request.url).origin !== setting('RESONANCE_ORIGIN'))
      throw new ApiError(
        'Open the configured Resonance address before connecting.',
        400,
      );
    const generation = (await room(owner))?.revision;
    if (!generation)
      throw new ApiError('Open your Resonance account before connecting.', 409);
    const state = randomToken(),
      verifier = randomToken(48),
      now = Date.now(),
      url = makeAuthorization(p, providerConfig(), state, verifier);
    const saved = await database().batch([
      database()
        .prepare(
          'DELETE FROM oauth_states WHERE expires < ? OR (user_id=? AND provider=? AND EXISTS (SELECT 1 FROM rooms WHERE user_id=? AND revision=?))',
        )
        .bind(now, owner, p, owner, generation),
      database()
        .prepare(
          'INSERT INTO oauth_states(hash,user_id,provider,verifier,expires) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM rooms WHERE user_id=? AND revision=?)',
        )
        .bind(
          hashState(state),
          owner,
          p,
          seal(owner, p, verifier),
          now + 600000,
          owner,
          generation,
        ),
    ]);
    if (!saved[1].meta.changes)
      throw new ApiError(
        'Your account changed. Reopen Resonance before connecting.',
        409,
      );
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    return failure(error);
  }
}
