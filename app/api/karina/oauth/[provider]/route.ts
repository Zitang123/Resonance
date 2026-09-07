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
    const state = randomToken(),
      verifier = randomToken(48),
      now = Date.now(),
      url = makeAuthorization(p, providerConfig(), state, verifier);
    await database().batch([
      database()
        .prepare(
          'DELETE FROM oauth_states WHERE expires < ? OR (user_id=? AND provider=?)',
        )
        .bind(now, owner, p),
      database()
        .prepare(
          'INSERT INTO oauth_states(hash,user_id,provider,verifier,expires) VALUES (?,?,?,?,?)',
        )
        .bind(
          hashState(state),
          owner,
          p,
          seal(owner, p, verifier),
          now + 600000,
        ),
    ]);
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
