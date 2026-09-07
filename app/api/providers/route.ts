/** Fixed-host, read-only MetaBrainz adapter. Disabled until an operator identifies the app
 * and confirms service use. The in-process rate gate is for a single server only. */
let nextRequestAt = 0;
const cache = new Map<string, { expires: number; body: unknown }>();
function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get('kind');
  if (!['metadata', 'history'].includes(kind || ''))
    return response({ error: 'Choose metadata or history.' }, 400);
  const contact = process.env.RESONANCE_PROVIDER_CONTACT;
  if (
    process.env.RESONANCE_ENABLE_PROVIDERS !== 'true' ||
    !contact ||
    !/^https:\/\/[\w.-]+(?:\/[^\s]*)?$|^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
  )
    return response(
      {
        error:
          'Live provider access is not configured here. Save manually, search MusicBrainz, or import a ListenBrainz JSON file.',
      },
      503,
    );
  let url: URL;
  if (kind === 'history') {
    const user = params.get('user') || '';
    if (!/^[\p{L}\p{N}_ .-]{1,64}$/u.test(user))
      return response({ error: 'Enter a valid ListenBrainz username.' }, 400);
    url = new URL(
      `https://api.listenbrainz.org/1/user/${encodeURIComponent(user)}/listens`,
    );
    url.searchParams.set('count', '1000');
  } else {
    const title = params.get('title') || '',
      artist = params.get('artist') || '';
    if (
      !title.trim() ||
      !artist.trim() ||
      title.length > 300 ||
      artist.length > 300
    )
      return response(
        { error: 'Enter a title and artist under 300 characters.' },
        400,
      );
    const type = params.get('type') === 'track' ? 'recording' : 'release-group';
    const escape = (v: string) => v.replace(/[+\-!(){}[\]^"~*?:\\/&|]/g, ' ');
    url = new URL(`https://musicbrainz.org/ws/2/${type}`);
    url.searchParams.set(
      'query',
      `${type === 'recording' ? 'recording' : 'releasegroup'}:"${escape(title)}" AND artist:"${escape(artist)}"`,
    );
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('limit', '5');
  }
  const key = url.toString();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return response(cached.body);
  if (Date.now() < nextRequestAt)
    return response(
      { error: 'Please wait a moment before another lookup.' },
      429,
    );
  nextRequestAt = Date.now() + 1100;
  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': `Resonance/0.1.0 (${contact})`,
        Accept: 'application/json',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(9000),
    });
    if (!upstream.ok) {
      if (upstream.status === 429 || upstream.status === 503) {
        nextRequestAt =
          Date.now() +
          Math.min(
            300,
            Math.max(
              2,
              Number(
                upstream.headers.get('Retry-After') ||
                  upstream.headers.get('X-RateLimit-Reset-In') ||
                  5,
              ),
            ),
          ) *
            1000;
        return response(
          {
            error:
              'The provider is busy or rate limited. Try again shortly. Your local music is safe.',
          },
          429,
        );
      }
      if (upstream.status === 404)
        return response(
          { error: 'That public ListenBrainz profile was not found.' },
          404,
        );
      if (upstream.status === 401 || upstream.status === 403)
        return response(
          {
            error:
              'Provider access is unavailable. You can continue with local files and manual entries.',
          },
          upstream.status,
        );
      return response(
        { error: 'The provider is unavailable. You can keep working locally.' },
        502,
      );
    }
    if (upstream.headers.get('X-RateLimit-Remaining') === '0')
      nextRequestAt =
        Date.now() +
        Math.max(2, Number(upstream.headers.get('X-RateLimit-Reset-In') || 5)) *
          1000;
    const raw = await upstream.text();
    if (raw.length > 8 * 1024 * 1024)
      return response(
        {
          error:
            'The provider response is too large. Use a smaller history file.',
        },
        502,
      );
    const data = JSON.parse(raw);
    const body =
      kind === 'history'
        ? data
        : {
            matches: (data.recordings || data['release-groups'] || [])
              .slice(0, 5)
              .map(
                (r: {
                  id: string;
                  title: string;
                  disambiguation?: string;
                  'artist-credit'?: {
                    name?: string;
                    artist?: { name?: string };
                    joinphrase?: string;
                  }[];
                }) => ({
                  id: r.id,
                  title: r.title,
                  artist: (r['artist-credit'] || [])
                    .map(
                      (a) =>
                        (a.name || a.artist?.name || '') + (a.joinphrase || ''),
                    )
                    .join(''),
                  disambiguation: r.disambiguation || '',
                }),
              ),
          };
    if (cache.size >= 50) cache.delete(cache.keys().next().value!);
    cache.set(key, {
      expires: Date.now() + (kind === 'history' ? 60000 : 3600000),
      body,
    });
    return response(body);
  } catch {
    return response(
      {
        error:
          'Could not reach the provider. Save manually or import a local history file.',
      },
      502,
    );
  }
}
