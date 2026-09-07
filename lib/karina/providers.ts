/* oxlint-disable no-control-regex -- Reject or strip untrusted control characters at provider boundaries. */
import { createHash } from 'node:crypto';
import { pkceChallenge } from './crypto.ts';

export type Provider = 'lastfm' | 'discord' | 'spotify';
export type ProviderErrorCode =
  | 'not_configured'
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'
  | 'cancelled'
  | 'invalid_response';

const LABELS: Record<Provider, string> = {
  lastfm: 'Last.fm',
  discord: 'Discord',
  spotify: 'Spotify',
};
const MESSAGES: Record<ProviderErrorCode, string> = {
  not_configured: 'connection is not configured.',
  invalid_request: 'connection request is invalid.',
  unauthorized: 'connection needs authorization again.',
  forbidden: 'has not granted access to this application.',
  not_found: 'account or resource was not found.',
  rate_limited: 'is temporarily limiting requests. Try again later.',
  unavailable: 'is temporarily unavailable. Try again later.',
  timeout: 'request timed out. Try again later.',
  cancelled: 'request was cancelled.',
  invalid_response: 'returned an unexpected response.',
};

export class ProviderError extends Error {
  readonly provider: Provider;
  readonly code: ProviderErrorCode;
  readonly status: number;
  /** Seconds; bounded to one hour for safe transport/display. Do not retry automatically. */
  readonly retryAfter?: number;

  constructor(
    provider: Provider,
    code: ProviderErrorCode,
    status = 502,
    retryAfter?: number,
  ) {
    super(`${LABELS[provider]} ${MESSAGES[code]}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.status =
      Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
    if (Number.isFinite(retryAfter) && (retryAfter as number) >= 0)
      this.retryAfter = Math.min(3600, Math.ceil(retryAfter as number));
  }
}

export interface ProviderConfig {
  /** Trusted server configuration, never derived from an unvalidated Host header. */
  origin: string;
  callbackPaths?: Partial<Record<Provider, string>>;
  lastfmApiKey?: string;
  lastfmApiSecret?: string;
  discordClientId?: string;
  discordClientSecret?: string;
  spotifyClientId?: string;
  spotifyClientSecret?: string;
}

export type ProviderFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;
export interface RequestOptions {
  fetch?: ProviderFetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Milliseconds since epoch; useful for deterministic tests. */
  now?: () => number;
}

const ENDPOINTS = {
  lastfm: 'https://ws.audioscrobbler.com/2.0/',
  discordToken: 'https://discord.com/api/v10/oauth2/token',
  discordUser: 'https://discord.com/api/v10/users/@me',
  spotifyToken: 'https://accounts.spotify.com/api/token',
  spotifyNowPlaying: 'https://api.spotify.com/v1/me/player/currently-playing',
} as const;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SPOTIFY_SCOPE = 'user-read-currently-playing';
type JsonObject = Record<string, unknown>;

function record(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function required(
  provider: Provider,
  value: unknown,
  configuration = false,
): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 8192 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new ProviderError(
      provider,
      configuration ? 'not_configured' : 'invalid_request',
      configuration ? 503 : 400,
    );
  }
  return value;
}

export function callbackUri(
  provider: Provider,
  config: ProviderConfig,
): string {
  try {
    const origin = new URL(config.origin);
    const loopback =
      origin.hostname === '127.0.0.1' ||
      origin.hostname === '[::1]' ||
      (provider !== 'spotify' && origin.hostname === 'localhost');
    if (
      (origin.protocol !== 'https:' &&
        !(origin.protocol === 'http:' && loopback)) ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== '/'
    )
      throw new Error();
    const path =
      config.callbackPaths?.[provider] ?? `/api/auth/${provider}/callback`;
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('\\') ||
      path.includes('?') ||
      path.includes('#')
    )
      throw new Error();
    const callback = new URL(path, origin);
    if (callback.origin !== origin.origin) throw new Error();
    return callback.toString();
  } catch {
    throw new ProviderError(provider, 'not_configured', 503);
  }
}

/** Caller must persist and consume the state once, binding it to the initiating browser session. */
export function makeAuthorization(
  provider: Provider,
  config: ProviderConfig,
  state: string,
  verifier?: string,
): string {
  required(provider, state);
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(state))
    throw new ProviderError(provider, 'invalid_request', 400);
  const callback = callbackUri(provider, config);
  if (provider === 'lastfm') {
    const cb = new URL(callback);
    cb.searchParams.set('state', state);
    const url = new URL('https://www.last.fm/api/auth/');
    url.searchParams.set(
      'api_key',
      required(provider, config.lastfmApiKey, true),
    );
    url.searchParams.set('cb', cb.toString());
    return url.toString();
  }
  const url = new URL(
    provider === 'discord'
      ? 'https://discord.com/oauth2/authorize'
      : 'https://accounts.spotify.com/authorize',
  );
  url.searchParams.set(
    'client_id',
    required(
      provider,
      provider === 'discord' ? config.discordClientId : config.spotifyClientId,
      true,
    ),
  );
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', callback);
  url.searchParams.set('state', state);
  url.searchParams.set(
    'scope',
    provider === 'discord' ? 'identify' : SPOTIFY_SCOPE,
  );
  if (provider === 'spotify') {
    try {
      url.searchParams.set('code_challenge', pkceChallenge(verifier ?? ''));
    } catch {
      throw new ProviderError(provider, 'invalid_request', 400);
    }
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

function retryAfter(response: Response, now: number): number | undefined {
  const raw = response.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(raw.trim())
    ? Number(raw)
    : (Date.parse(raw) - now) / 1000;
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(3600, Math.ceil(seconds))
    : undefined;
}

function httpError(
  provider: Provider,
  response: Response,
  now: number,
): ProviderError {
  const status = response.status;
  const code =
    status === 401
      ? 'unauthorized'
      : status === 403
        ? 'forbidden'
        : status === 404
          ? 'not_found'
          : status === 429
            ? 'rate_limited'
            : 'unavailable';
  return new ProviderError(provider, code, status, retryAfter(response, now));
}

async function readJson(
  response: Response,
  provider: Provider,
  signal: AbortSignal,
): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderError(provider, 'invalid_response');
  }
  if (!response.body) throw new ProviderError(provider, 'invalid_response');
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new ProviderError(provider, 'invalid_response');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, length).toString('utf8'));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(provider, 'invalid_response');
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

async function requestJson(
  provider: Provider,
  url: string | URL,
  init: RequestInit,
  options: RequestOptions,
  allowEmpty = false,
): Promise<unknown> {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.min(30_000, Math.floor(options.timeoutMs as number)))
    : 10_000;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([timeout, options.signal])
    : timeout;
  try {
    signal.throwIfAborted();
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      ...init,
      headers: (() => {
        const h = new Headers(init.headers);
        if (!h.has('Accept')) h.set('Accept', 'application/json');
        return h;
      })(),
      // Workers supports manual redirects; never forward provider credentials.
      redirect: 'manual',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      // Inspect only recognized OAuth error codes; never propagate response messages or bodies.
      if (
        response.status === 400 &&
        (String(url) === ENDPOINTS.spotifyToken ||
          String(url) === ENDPOINTS.discordToken)
      ) {
        let data: unknown;
        try {
          data = await readJson(response, provider, signal);
        } catch {
          /* sanitized fallback below */
        }
        if (record(data) && data.error === 'invalid_grant')
          throw new ProviderError(provider, 'unauthorized', 401);
        if (record(data) && data.error === 'invalid_client')
          throw new ProviderError(provider, 'not_configured', 503);
        if (record(data) && data.error === 'invalid_scope')
          throw new ProviderError(provider, 'forbidden', 403);
      }
      void response.body?.cancel().catch(() => undefined);
      throw httpError(provider, response, (options.now ?? Date.now)());
    }
    if (allowEmpty && response.status === 204) return null;
    const result = await readJson(response, provider, signal);
    signal.throwIfAborted();
    return result;
  } catch (error) {
    if (signal.aborted)
      throw new ProviderError(
        provider,
        options.signal?.aborted ? 'cancelled' : 'timeout',
        options.signal?.aborted ? 499 : 504,
      );
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(provider, 'unavailable', 502);
  }
}

function checkLastfmError(data: unknown): void {
  if (!record(data) || data.error === undefined) return;
  const code = Number(data.error);
  if ([4, 9, 14, 15].includes(code))
    throw new ProviderError('lastfm', 'unauthorized', 401);
  if ([10, 13, 26].includes(code))
    throw new ProviderError('lastfm', 'forbidden', 403);
  if (code === 6 || code === 7)
    throw new ProviderError('lastfm', 'not_found', 404);
  if (code === 29) throw new ProviderError('lastfm', 'rate_limited', 429);
  throw new ProviderError('lastfm', 'unavailable', 503);
}

export interface LastfmSession {
  username: string;
  sessionKey: string;
  subscriber: boolean;
}

/** Verifies the returned Last.fm identity through a signed server-side auth.getSession call. */
export async function exchangeLastfm(
  token: string,
  config: ProviderConfig,
  options: RequestOptions = {},
): Promise<LastfmSession> {
  const apiKey = required('lastfm', config.lastfmApiKey, true);
  const secret = required('lastfm', config.lastfmApiSecret, true);
  if (!/^[a-fA-F0-9]{32}$/.test(token))
    throw new ProviderError('lastfm', 'invalid_request', 400);
  // Last.fm specifies MD5 of sorted UTF-8 name/value pairs plus secret; format is excluded.
  const signature = createHash('md5')
    .update(
      `api_key${apiKey}methodauth.getSessiontoken${token}${secret}`,
      'utf8',
    )
    .digest('hex');
  const url = new URL(ENDPOINTS.lastfm);
  url.search = new URLSearchParams({
    method: 'auth.getSession',
    api_key: apiKey,
    token,
    api_sig: signature,
    format: 'json',
  }).toString();
  const data = await requestJson('lastfm', url, { method: 'GET' }, options);
  checkLastfmError(data);
  if (
    !record(data) ||
    !record(data.session) ||
    typeof data.session.name !== 'string' ||
    !data.session.name ||
    data.session.name.length > 256 ||
    typeof data.session.key !== 'string' ||
    !/^[a-fA-F0-9]{32}$/.test(data.session.key)
  )
    throw new ProviderError('lastfm', 'invalid_response');
  return {
    username: data.session.name,
    sessionKey: data.session.key,
    subscriber: String(data.session.subscriber) === '1',
  };
}

export interface DiscordIdentity {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

/** Tokens are used only to verify identity and deliberately omitted from the result. */
export async function exchangeDiscord(
  code: string,
  config: ProviderConfig,
  options: RequestOptions = {},
): Promise<DiscordIdentity> {
  const clientId = required('discord', config.discordClientId, true);
  const clientSecret = required('discord', config.discordClientSecret, true);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: required('discord', code),
    redirect_uri: callbackUri('discord', config),
  });
  const data = await requestJson(
    'discord',
    ENDPOINTS.discordToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
      },
      body,
    },
    options,
  );
  if (
    !record(data) ||
    typeof data.access_token !== 'string' ||
    !data.access_token ||
    typeof data.token_type !== 'string' ||
    data.token_type.toLowerCase() !== 'bearer' ||
    typeof data.scope !== 'string' ||
    !data.scope.split(/\s+/).includes('identify')
  )
    throw new ProviderError('discord', 'invalid_response');
  const user = await requestJson(
    'discord',
    ENDPOINTS.discordUser,
    {
      headers: {
        Authorization: `Bearer ${required('discord', data.access_token)}`,
      },
    },
    options,
  );
  if (
    !record(user) ||
    typeof user.id !== 'string' ||
    !/^\d{5,25}$/.test(user.id) ||
    typeof user.username !== 'string' ||
    !user.username ||
    user.username.length > 256
  )
    throw new ProviderError('discord', 'invalid_response');
  return {
    id: user.id,
    username: user.username,
    globalName:
      typeof user.global_name === 'string'
        ? user.global_name.slice(0, 256)
        : null,
    avatar:
      typeof user.avatar === 'string' &&
      /^(?:a_)?[a-f0-9]{32}$/.test(user.avatar)
        ? user.avatar
        : null,
  };
}

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  scope: string;
  expiresAt: number;
  /** Fixed origin for the six-month refresh lifetime. Refreshing never resets these dates. */
  authorizedAt: number;
  refreshExpiresAt: number;
}

function sixMonthsAfter(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 6);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

function spotifyTokenRequest(
  config: ProviderConfig,
  body: URLSearchParams,
): RequestInit {
  const clientId = required('spotify', config.spotifyClientId, true);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  // client_id is required by the documented PKCE flow; confidential clients may authenticate too.
  body.set('client_id', clientId);
  if (config.spotifyClientSecret)
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${required('spotify', config.spotifyClientSecret, true)}`, 'utf8').toString('base64')}`;
  return { method: 'POST', headers, body };
}

function parseSpotifyTokens(
  data: unknown,
  now: number,
  previous?: SpotifyTokens,
): SpotifyTokens {
  if (
    !record(data) ||
    typeof data.access_token !== 'string' ||
    !data.access_token ||
    typeof data.token_type !== 'string' ||
    data.token_type.toLowerCase() !== 'bearer' ||
    typeof data.expires_in !== 'number' ||
    !Number.isInteger(data.expires_in) ||
    data.expires_in < 1 ||
    data.expires_in > 86_400
  )
    throw new ProviderError('spotify', 'invalid_response');
  const refreshToken =
    data.refresh_token === undefined
      ? previous?.refreshToken
      : data.refresh_token;
  const scope = data.scope === undefined ? previous?.scope : data.scope;
  if (
    typeof refreshToken !== 'string' ||
    !refreshToken ||
    refreshToken.length > 8192 ||
    typeof scope !== 'string' ||
    !scope.split(/\s+/).includes(SPOTIFY_SCOPE)
  )
    throw new ProviderError('spotify', 'invalid_response');
  return {
    accessToken: required('spotify', data.access_token),
    refreshToken: required('spotify', refreshToken),
    tokenType: 'Bearer',
    scope,
    expiresAt: now + data.expires_in * 1000,
    authorizedAt: previous?.authorizedAt ?? now,
    refreshExpiresAt: previous?.refreshExpiresAt ?? sixMonthsAfter(now),
  };
}

export async function exchangeSpotify(
  code: string,
  verifier: string,
  config: ProviderConfig,
  options: RequestOptions = {},
): Promise<SpotifyTokens> {
  try {
    pkceChallenge(verifier);
  } catch {
    throw new ProviderError('spotify', 'invalid_request', 400);
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: required('spotify', code),
    code_verifier: verifier,
    redirect_uri: callbackUri('spotify', config),
  });
  const data = await requestJson(
    'spotify',
    ENDPOINTS.spotifyToken,
    spotifyTokenRequest(config, body),
    options,
  );
  return parseSpotifyTokens(data, (options.now ?? Date.now)());
}

export async function refreshSpotifyToken(
  previous: SpotifyTokens,
  config: ProviderConfig,
  options: RequestOptions = {},
): Promise<SpotifyTokens> {
  const now = (options.now ?? Date.now)();
  if (
    !Number.isFinite(previous.authorizedAt) ||
    !Number.isFinite(previous.refreshExpiresAt) ||
    previous.refreshExpiresAt <= now
  )
    throw new ProviderError('spotify', 'unauthorized', 401);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: required('spotify', previous.refreshToken),
  });
  const data = await requestJson(
    'spotify',
    ENDPOINTS.spotifyToken,
    spotifyTokenRequest(config, body),
    options,
  );
  return parseSpotifyTokens(data, (options.now ?? Date.now)(), previous);
}

export interface SpotifyNowPlaying {
  source: 'spotify';
  kind: 'track' | 'episode';
  name: string;
  artists: string[];
  album: string | null;
  url: string | null;
  imageUrl: string | null;
  isPlaying: boolean;
  durationMs: number | null;
  progressMs: number | null;
  observedAt: number;
  spotifyTimestamp: number | null;
}

function safeSpotifyUrl(value: unknown, image = false): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hostname !== (image ? 'i.scdn.co' : 'open.spotify.com')
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** Transient display only. This module intentionally exposes no Spotify history/statistics API. */
export async function getSpotifyNowPlaying(
  accessToken: string,
  options: RequestOptions = {},
): Promise<SpotifyNowPlaying | null> {
  const url = new URL(ENDPOINTS.spotifyNowPlaying);
  url.searchParams.set('additional_types', 'track,episode');
  const data = await requestJson(
    'spotify',
    url,
    {
      headers: { Authorization: `Bearer ${required('spotify', accessToken)}` },
    },
    options,
    true,
  );
  if (data === null) return null;
  if (!record(data)) throw new ProviderError('spotify', 'invalid_response');
  if (
    data.item === null ||
    data.currently_playing_type === 'ad' ||
    data.currently_playing_type === 'unknown'
  )
    return null;
  if (
    !record(data.item) ||
    typeof data.item.name !== 'string' ||
    typeof data.is_playing !== 'boolean'
  )
    throw new ProviderError('spotify', 'invalid_response');
  const item = data.item;
  const name = data.item.name;
  const kind =
    item.type === 'track' || item.type === 'episode'
      ? item.type
      : data.currently_playing_type;
  if (kind !== 'track' && kind !== 'episode') return null;
  const album = record(item.album) ? item.album : null;
  const show = record(item.show) ? item.show : null;
  const images = kind === 'track' ? album?.images : item.images;
  const firstImage = Array.isArray(images)
    ? images.find((entry) => record(entry) && safeSpotifyUrl(entry.url, true))
    : undefined;
  const artists = Array.isArray(item.artists)
    ? item.artists.flatMap((artist) =>
        record(artist) && typeof artist.name === 'string'
          ? [artist.name.slice(0, 512)]
          : [],
      )
    : [];
  return {
    source: 'spotify',
    kind,
    name: name.slice(0, 512),
    artists:
      kind === 'episode' && typeof show?.publisher === 'string'
        ? [show.publisher.slice(0, 512)]
        : artists,
    album:
      typeof album?.name === 'string'
        ? album.name.slice(0, 512)
        : typeof show?.name === 'string'
          ? show.name.slice(0, 512)
          : null,
    url: safeSpotifyUrl(
      record(item.external_urls) ? item.external_urls.spotify : null,
    ),
    imageUrl: record(firstImage) ? safeSpotifyUrl(firstImage.url, true) : null,
    isPlaying: data.is_playing,
    durationMs: nonNegativeNumber(item.duration_ms),
    progressMs: nonNegativeNumber(data.progress_ms),
    observedAt: (options.now ?? Date.now)(),
    spotifyTimestamp: nonNegativeNumber(data.timestamp),
  };
}

export interface LastfmPageOptions extends RequestOptions {
  /** Exclusive lower bound in UNIX seconds. */
  from?: number;
  /** Exclusive upper bound in UNIX seconds; pin this across a paginated import. */
  to?: number;
}
export interface LastfmPage {
  recenttracks: {
    track: JsonObject[];
    '@attr': JsonObject;
    [key: string]: unknown;
  };
}

/** Returns raw track objects, including Last.fm's now-playing marker; the caller filters scrobbles. */
export async function getLastfmPage(
  username: string,
  apiKey: string,
  page = 1,
  options: LastfmPageOptions = {},
): Promise<LastfmPage> {
  required('lastfm', username);
  required('lastfm', apiKey, true);
  if (
    username.length > 256 ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1_000_000
  )
    throw new ProviderError('lastfm', 'invalid_request', 400);
  for (const bound of [options.from, options.to])
    if (bound !== undefined && (!Number.isSafeInteger(bound) || bound < 0))
      throw new ProviderError('lastfm', 'invalid_request', 400);
  if (
    options.from !== undefined &&
    options.to !== undefined &&
    options.from >= options.to
  )
    throw new ProviderError('lastfm', 'invalid_request', 400);
  const url = new URL(ENDPOINTS.lastfm);
  url.search = new URLSearchParams({
    method: 'user.getRecentTracks',
    user: username,
    api_key: apiKey,
    page: String(page),
    limit: '200',
    format: 'json',
  }).toString();
  if (options.from !== undefined)
    url.searchParams.set('from', String(options.from));
  if (options.to !== undefined) url.searchParams.set('to', String(options.to));
  const data = await requestJson('lastfm', url, { method: 'GET' }, options);
  checkLastfmError(data);
  if (
    !record(data) ||
    !record(data.recenttracks) ||
    !record(data.recenttracks['@attr'])
  )
    throw new ProviderError('lastfm', 'invalid_response');
  const recent = data.recenttracks;
  const tracks =
    recent.track === undefined
      ? []
      : Array.isArray(recent.track)
        ? recent.track
        : [recent.track];
  // A current-playing item can be returned in addition to the requested completed scrobbles.
  if (tracks.length > 201 || !tracks.every(record))
    throw new ProviderError('lastfm', 'invalid_response');
  return {
    recenttracks: {
      ...recent,
      track: tracks,
      '@attr': recent['@attr'] as JsonObject,
    },
  };
}
