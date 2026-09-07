import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  callbackUri,
  exchangeDiscord,
  exchangeLastfm,
  exchangeSpotify,
  getLastfmPage,
  getSpotifyNowPlaying,
  getSpotifyIdentity,
  makeAuthorization,
  ProviderError,
  refreshSpotifyToken,
} from './providers.ts';
import type {
  ProviderConfig,
  ProviderFetch,
  SpotifyTokens,
} from './providers.ts';
import { pkceChallenge } from './crypto.ts';

const config: ProviderConfig = {
  origin: 'https://karina.example',
  callbackPaths: {
    lastfm: '/api/karina/callback/lastfm',
    discord: '/api/karina/callback/discord',
    spotify: '/api/karina/callback/spotify',
  },
  lastfmApiKey: 'test-lastfm-key',
  lastfmApiSecret: 'test-lastfm-secret',
  discordClientId: '1234567890',
  discordClientSecret: 'test-discord-secret',
  spotifyClientId: 'test-spotify-client',
};
const state = 's'.repeat(43);
const verifier = 'v'.repeat(64);
const time = Date.UTC(2026, 7, 31, 12, 30);
const spotifyReply = {
  access_token: 'test-spotify-access',
  refresh_token: 'test-spotify-refresh',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'user-read-currently-playing',
};

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: (() => {
      const h = new Headers(init.headers);
      if (!h.has('content-type')) h.set('content-type', 'application/json');
      return h;
    })(),
  });
}

function queue(...responses: Response[]): {
  fetch: ProviderFetch;
  calls: { url: URL; init: RequestInit }[];
} {
  const calls: { url: URL; init: RequestInit }[] = [];
  return {
    calls,
    fetch: async (input, init = {}) => {
      calls.push({ url: new URL(input), init });
      assert.equal(init.redirect, 'manual');
      assert.equal(init.cache, 'no-store');
      assert.ok(init.signal instanceof AbortSignal);
      const next = responses.shift();
      assert.ok(next, 'Unexpected provider request');
      return next;
    },
  };
}

void test('authorization URLs pin identity scopes, callback paths, state and Spotify S256', () => {
  const discord = new URL(makeAuthorization('discord', config, state));
  assert.equal(
    discord.origin + discord.pathname,
    'https://discord.com/oauth2/authorize',
  );
  assert.equal(discord.searchParams.get('scope'), 'identify');
  assert.equal(discord.searchParams.get('state'), state);
  assert.equal(
    discord.searchParams.get('redirect_uri'),
    'https://karina.example/api/karina/callback/discord',
  );
  assert.equal(discord.searchParams.has('permissions'), false);
  const spotify = new URL(
    makeAuthorization('spotify', config, state, verifier),
  );
  assert.equal(
    spotify.searchParams.get('scope'),
    'user-read-currently-playing',
  );
  assert.equal(
    spotify.searchParams.get('code_challenge'),
    pkceChallenge(verifier),
  );
  assert.equal(spotify.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(spotify.searchParams.has('code_verifier'), false);
  const lastfm = new URL(makeAuthorization('lastfm', config, state));
  assert.equal(
    lastfm.origin + lastfm.pathname,
    'https://www.last.fm/api/auth/',
  );
  assert.equal(
    new URL(lastfm.searchParams.get('cb')!).searchParams.get('state'),
    state,
  );
  assert.equal(lastfm.searchParams.has('api_secret'), false);
});

void test('callback validation rejects cross-origin configuration and enforces Spotify loopback IP', () => {
  assert.throws(
    () => callbackUri('discord', { ...config, origin: 'http://example.com' }),
    ProviderError,
  );
  assert.throws(
    () =>
      callbackUri('discord', {
        ...config,
        origin: 'https://user:password@example.com',
      }),
    ProviderError,
  );
  assert.throws(
    () =>
      callbackUri('discord', {
        ...config,
        callbackPaths: { discord: '//evil.example/callback' },
      }),
    ProviderError,
  );
  assert.throws(
    () =>
      callbackUri('spotify', { ...config, origin: 'http://localhost:3000' }),
    ProviderError,
  );
  assert.equal(
    callbackUri('spotify', { origin: 'http://127.0.0.1:3000' }),
    'http://127.0.0.1:3000/api/auth/spotify/callback',
  );
  assert.throws(
    () => makeAuthorization('spotify', config, state, 'short'),
    ProviderError,
  );
  assert.throws(
    () => makeAuthorization('lastfm', config, 'short'),
    ProviderError,
  );
});

void test('Last.fm identity is verified by signed getSession, excluding format from signature', async () => {
  const token = 'a'.repeat(32);
  const request = queue(
    json({
      session: { name: 'listener', key: 'b'.repeat(32), subscriber: '0' },
    }),
  );
  assert.deepEqual(await exchangeLastfm(token, config, request), {
    username: 'listener',
    sessionKey: 'b'.repeat(32),
    subscriber: false,
  });
  const url = request.calls[0].url;
  assert.equal(url.origin + url.pathname, 'https://ws.audioscrobbler.com/2.0/');
  assert.equal(url.searchParams.get('method'), 'auth.getSession');
  const expected = createHash('md5')
    .update(
      `api_keytest-lastfm-keymethodauth.getSessiontoken${token}test-lastfm-secret`,
    )
    .digest('hex');
  assert.equal(url.searchParams.get('api_sig'), expected);
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.toString().includes('test-lastfm-secret'), false);
});

void test('Last.fm application errors in successful HTTP replies are sanitized and classified', async () => {
  for (const [errorCode, status] of [
    [14, 401],
    [29, 429],
    [26, 403],
    [11, 503],
  ]) {
    const request = queue(
      json({ error: errorCode, message: 'LEAK_test-secret' }),
    );
    await assert.rejects(
      exchangeLastfm('a'.repeat(32), config, request),
      (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(error.status, status);
        assert.equal(String(error).includes('LEAK'), false);
        return true;
      },
    );
  }
});

void test('Discord code exchange uses identify and returns only verified identity', async () => {
  const request = queue(
    json({
      access_token: 'test-discord-token',
      refresh_token: 'discarded-refresh',
      token_type: 'Bearer',
      scope: 'identify',
    }),
    json({
      id: '1234567890',
      username: 'listener',
      global_name: 'Listener',
      avatar: 'a'.repeat(32),
      email: 'private@example.com',
      mfa_enabled: true,
    }),
  );
  const identity = await exchangeDiscord('test-code', config, request);
  assert.deepEqual(identity, {
    id: '1234567890',
    username: 'listener',
    globalName: 'Listener',
    avatar: 'a'.repeat(32),
  });
  assert.equal(
    request.calls[0].url.toString(),
    'https://discord.com/api/v10/oauth2/token',
  );
  const body = new URLSearchParams(
    request.calls[0].init.body as URLSearchParams,
  );
  assert.equal(body.get('redirect_uri'), callbackUri('discord', config));
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(
    request.calls[1].url.toString(),
    'https://discord.com/api/v10/users/@me',
  );
  assert.equal(
    new Headers(request.calls[1].init.headers).get('authorization'),
    'Bearer test-discord-token',
  );
  assert.equal(JSON.stringify(identity).includes('token'), false);
  assert.equal(JSON.stringify(identity).includes('private@'), false);
});

void test('Discord cannot return an identity without an identify-scoped bearer token', async () => {
  const request = queue(
    json({ access_token: 'token', token_type: 'Bearer', scope: 'email' }),
  );
  await assert.rejects(exchangeDiscord('code', config, request), ProviderError);
  assert.equal(request.calls.length, 1);
});

void test('Spotify PKCE exchange calculates access expiry and calendar six-month refresh expiry', async () => {
  const request = queue(json(spotifyReply));
  const tokens = await exchangeSpotify('test-code', verifier, config, {
    ...request,
    now: () => time,
  });
  assert.equal(tokens.expiresAt, time + 3_600_000);
  assert.equal(tokens.authorizedAt, time);
  assert.equal(tokens.refreshExpiresAt, Date.UTC(2027, 1, 28, 12, 30));
  const body = new URLSearchParams(
    request.calls[0].init.body as URLSearchParams,
  );
  assert.equal(body.get('code_verifier'), verifier);
  assert.equal(body.get('client_id'), config.spotifyClientId);
  assert.equal(body.get('redirect_uri'), callbackUri('spotify', config));
  assert.equal(
    request.calls[0].url.toString(),
    'https://accounts.spotify.com/api/token',
  );
});

void test('Spotify identity linking uses immutable account_id and discards email and tokens', async () => {
  const request = queue(
    json({
      account_id: 'immutable_123',
      id: 'mutable-user-name',
      display_name: 'Listener',
      email: 'private@example.com',
      access_token: 'do-not-retain',
    }),
  );
  assert.deepEqual(await getSpotifyIdentity('test-access', request), {
    accountId: 'immutable_123',
    displayName: 'Listener',
  });
  assert.equal(
    request.calls[0].url.toString(),
    'https://api.spotify.com/v1/me',
  );
  assert.equal(
    new Headers(request.calls[0].init.headers).get('authorization'),
    'Bearer test-access',
  );
});

void test('Spotify rejects missing or invalid stable identities rather than falling back to id or email', async () => {
  for (const account_id of [
    undefined,
    '',
    'bad/identity',
    'a'.repeat(201),
    123,
  ]) {
    await assert.rejects(
      getSpotifyIdentity(
        'test-access',
        queue(
          json({ account_id, id: 'mutable', email: 'private@example.com' }),
        ),
      ),
      ProviderError,
    );
  }
  assert.deepEqual(
    await getSpotifyIdentity(
      'test-access',
      queue(json({ account_id: 'stable', display_name: null })),
    ),
    { accountId: 'stable', displayName: 'Spotify listener' },
  );
});

void test('optional Spotify confidential-client authentication retains PKCE', async () => {
  const request = queue(json(spotifyReply));
  await exchangeSpotify(
    'test-code',
    verifier,
    { ...config, spotifyClientSecret: 'test-secret' },
    request,
  );
  assert.equal(
    new Headers(request.calls[0].init.headers).get('authorization'),
    `Basic ${Buffer.from('test-spotify-client:test-secret').toString('base64')}`,
  );
  assert.equal(
    new URLSearchParams(request.calls[0].init.body as URLSearchParams).get(
      'code_verifier',
    ),
    verifier,
  );
});

void test('Spotify refresh rotation preserves original authorization deadline and missing refresh token', async () => {
  const previous: SpotifyTokens = {
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    tokenType: 'Bearer',
    scope: 'user-read-currently-playing',
    expiresAt: time,
    authorizedAt: time,
    refreshExpiresAt: time + 100_000,
  };
  const rotated = await refreshSpotifyToken(previous, config, {
    ...queue(json({ ...spotifyReply, refresh_token: 'rotated' })),
    now: () => time + 1000,
  });
  assert.equal(rotated.refreshToken, 'rotated');
  assert.equal(rotated.authorizedAt, previous.authorizedAt);
  assert.equal(rotated.refreshExpiresAt, previous.refreshExpiresAt);
  assert.equal(rotated.expiresAt, time + 1000 + 3_600_000);
  const {
    refresh_token: _refresh,
    scope: _scope,
    ...withoutRefresh
  } = spotifyReply;
  const retained = await refreshSpotifyToken(previous, config, {
    ...queue(json(withoutRefresh)),
    now: () => time + 1000,
  });
  assert.equal(retained.refreshToken, 'old-refresh');
  const noRequests = queue();
  await assert.rejects(
    refreshSpotifyToken(previous, config, {
      ...noRequests,
      now: () => previous.refreshExpiresAt,
    }),
    (error: unknown) => error instanceof ProviderError && error.status === 401,
  );
  assert.equal(noRequests.calls.length, 0);
});

void test('OAuth revocation and bad client configuration have actionable sanitized errors', async () => {
  const revoked = queue(
    json(
      { error: 'invalid_grant', error_description: 'LEAK_revoked_refresh' },
      { status: 400 },
    ),
  );
  await assert.rejects(
    exchangeSpotify('code', verifier, config, revoked),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === 'unauthorized' &&
      error.status === 401 &&
      !String(error).includes('LEAK'),
  );
  const badClient = queue(
    json(
      { error: 'invalid_client', error_description: 'LEAK_client_secret' },
      { status: 400 },
    ),
  );
  await assert.rejects(
    exchangeDiscord('code', config, badClient),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === 'not_configured' &&
      error.status === 503 &&
      !String(error).includes('LEAK'),
  );
});

void test('Spotify now-playing returns only a transient display snapshot', async () => {
  const request = queue(
    json({
      is_playing: true,
      progress_ms: 10000,
      timestamp: 12345,
      device: { id: 'private-device' },
      item: {
        type: 'track',
        name: 'Song',
        artists: [{ name: 'Artist' }],
        album: {
          name: 'Album',
          images: [{ url: 'https://i.scdn.co/image/art' }],
        },
        duration_ms: 200000,
        external_urls: { spotify: 'https://open.spotify.com/track/abc' },
        privateData: 'excluded',
      },
    }),
  );
  const snapshot = await getSpotifyNowPlaying('test-access', {
    ...request,
    now: () => time,
  });
  assert.deepEqual(snapshot, {
    source: 'spotify',
    kind: 'track',
    name: 'Song',
    artists: ['Artist'],
    album: 'Album',
    imageUrl: 'https://i.scdn.co/image/art',
    url: 'https://open.spotify.com/track/abc',
    isPlaying: true,
    durationMs: 200000,
    progressMs: 10000,
    observedAt: time,
    spotifyTimestamp: 12345,
  });
  assert.equal(request.calls.length, 1);
  assert.equal(
    request.calls[0].url.pathname,
    '/v1/me/player/currently-playing',
  );
  assert.equal(JSON.stringify(snapshot).includes('private'), false);
});

void test('Spotify handles no content, ads, nullable item and unsafe media links', async () => {
  assert.equal(
    await getSpotifyNowPlaying(
      'token',
      queue(new Response(null, { status: 204 })),
    ),
    null,
  );
  assert.equal(
    await getSpotifyNowPlaying('token', queue(json({ item: null }))),
    null,
  );
  assert.equal(
    await getSpotifyNowPlaying(
      'token',
      queue(json({ currently_playing_type: 'ad' })),
    ),
    null,
  );
  const snapshot = await getSpotifyNowPlaying(
    'token',
    queue(
      json({
        is_playing: false,
        item: {
          name: 'Song',
          type: 'track',
          album: { images: [{ url: 'https://evil.example/image' }] },
          external_urls: { spotify: 'javascript:alert(1)' },
        },
      }),
    ),
  );
  assert.equal(snapshot?.imageUrl, null);
  assert.equal(snapshot?.url, null);
  assert.equal(snapshot?.progressMs, null);
});

void test('Last.fm pagination preserves raw tracks and exact second-based bounds', async () => {
  const raw = {
    name: 'Song',
    date: { uts: '1700000000' },
    artist: { '#text': 'Artist' },
    '@attr': { nowplaying: 'true' },
  };
  const request = queue(
    json({
      recenttracks: { track: raw, '@attr': { page: '2', totalPages: '10' } },
    }),
  );
  const result = await getLastfmPage('listener&admin=true', 'test-key', 2, {
    ...request,
    from: 100,
    to: 200,
  });
  assert.deepEqual(result.recenttracks.track, [raw]);
  const query = request.calls[0].url.searchParams;
  assert.equal(query.get('user'), 'listener&admin=true');
  assert.equal(query.has('admin'), false);
  assert.equal(query.get('limit'), '200');
  assert.equal(query.get('page'), '2');
  assert.equal(query.get('from'), '100');
  assert.equal(query.get('to'), '200');
  assert.equal(query.has('sk'), false);
});

void test('Last.fm rejects invalid ranges before making any requests', async () => {
  const requests = queue();
  await assert.rejects(
    getLastfmPage('listener', 'key', 0, requests),
    ProviderError,
  );
  await assert.rejects(
    getLastfmPage('listener', 'key', 1, { ...requests, from: 200, to: 100 }),
    ProviderError,
  );
  await assert.rejects(
    getLastfmPage('listener', 'key', 1, { ...requests, from: -1 }),
    ProviderError,
  );
  assert.equal(requests.calls.length, 0);
});

void test('rate limiting preserves safe status and caps Retry-After without exposing response bodies', async () => {
  const request = queue(
    json(
      { error: 'LEAK_test-secret' },
      { status: 429, headers: { 'retry-after': '999999' } },
    ),
  );
  await assert.rejects(
    getSpotifyNowPlaying('test-access', request),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.status, 429);
      assert.equal(error.retryAfter, 3600);
      assert.equal(error.code, 'rate_limited');
      assert.equal(JSON.stringify(error).includes('LEAK'), false);
      assert.equal('cause' in error, false);
      return true;
    },
  );
});

void test('network errors and non-JSON replies cannot echo provider secrets', async () => {
  const fetch: ProviderFetch = async () => {
    throw new Error('LEAK_token_from_request_url');
  };
  for (const options of [
    { fetch },
    queue(new Response('LEAK_not_json')),
    queue(new Response('', { headers: { 'content-length': '999999999' } })),
  ]) {
    await assert.rejects(
      getSpotifyNowPlaying('test-access', options),
      (error: unknown) =>
        error instanceof ProviderError && !String(error).includes('LEAK'),
    );
  }
});

void test('OAuth redirects are rejected without forwarding credentials or reading their body', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const request = queue(
      new Response('LEAK_redirect_body', {
        status,
        headers: { location: 'https://untrusted.example/LEAK_destination' },
      }),
    );
    await assert.rejects(
      exchangeDiscord('test-code', config, request),
      (error: unknown) =>
        error instanceof ProviderError &&
        error.code === 'unavailable' &&
        !String(error).includes('LEAK'),
    );
    assert.equal(request.calls.length, 1);
  }
});

void test('pre-aborted calls and deadline expiration are classified without leaking abort reasons', async () => {
  const controller = new AbortController();
  controller.abort(new Error('LEAK_abort_reason'));
  const noRequests = queue();
  await assert.rejects(
    getSpotifyNowPlaying('token', { ...noRequests, signal: controller.signal }),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === 'cancelled' &&
      !String(error).includes('LEAK'),
  );
  assert.equal(noRequests.calls.length, 0);
  const fetch: ProviderFetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(
        () => reject(new Error('unexpected deadline')),
        200,
      );
      init!.signal!.addEventListener(
        'abort',
        () => {
          clearTimeout(keepAlive);
          reject(init!.signal!.reason);
        },
        { once: true },
      );
    });
  await assert.rejects(
    getSpotifyNowPlaying('token', { fetch, timeoutMs: 5 }),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === 'timeout' &&
      error.status === 504,
  );
});

void test('the request deadline also bounds stalled response bodies', async () => {
  const keepAlive = setTimeout(() => {}, 200);
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  try {
    await assert.rejects(
      getSpotifyNowPlaying('token', {
        ...queue(new Response(stream)),
        timeoutMs: 5,
      }),
      (error: unknown) =>
        error instanceof ProviderError && error.code === 'timeout',
    );
    assert.equal(cancelled, true);
  } finally {
    clearTimeout(keepAlive);
  }
});
