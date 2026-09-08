import { env } from 'cloudflare:workers';
export type Provider = 'lastfm' | 'discord' | 'spotify';
type Runtime = { DB?: D1Database; [key: string]: unknown };
export const runtime = () => env as unknown as Runtime;
export function setting(key: string) {
  const value = runtime()[key];
  return typeof value === 'string' ? value : '';
}
export function database() {
  const db = runtime().DB;
  if (!db)
    throw new ApiError('The listening archive needs database setup.', 503);
  return db;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function user(request: Request) {
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id || id.length > 200)
    throw new ApiError('Sign in to use your private listening archive.', 401);
  const expected = request.headers.get('x-resonance-account');
  if (expected && expected !== id)
    throw new ApiError(
      'Your sign-in changed. Reopen your Resonance account.',
      409,
    );
  return id;
}
export function origin(request: Request) {
  return new URL(request.url).origin;
}
export function mutation(request: Request) {
  if (request.headers.get('origin') !== origin(request))
    throw new ApiError('Please make this change from Resonance.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApiError('Expected a JSON request.', 415);
}
export async function body(
  request: Request,
  limit = 1_000_000,
): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > limit)
    throw new ApiError('This request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError('Missing request body.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError('This request is too large.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError('This file is not valid JSON.');
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof ApiError
          ? error.message
          : 'The connection could not complete. Your collection is safe; please try again.',
    },
    error instanceof ApiError ? error.status : 503,
  );
}
export function configured(provider: Provider) {
  if (
    !/^[a-f0-9]{64}$/i.test(setting('KARINA_TOKEN_KEY')) ||
    !setting('RESONANCE_ORIGIN')
  )
    return false;
  if (provider === 'lastfm')
    return !!(
      setting('LASTFM_API_KEY') &&
      setting('LASTFM_SHARED_SECRET') &&
      setting('LASTFM_ENABLED') === 'true'
    );
  if (provider === 'discord')
    return !!(
      setting('DISCORD_CLIENT_ID') &&
      setting('DISCORD_CLIENT_SECRET') &&
      setting('DISCORD_PUBLIC_KEY')
    );
  return !!(
    setting('SPOTIFY_CLIENT_ID') &&
    setting('SPOTIFY_DISPLAY_ENABLED') === 'true'
  );
}
export function provider(value: string): Provider {
  if (!['lastfm', 'discord', 'spotify'].includes(value))
    throw new ApiError('Unknown connection.');
  return value as Provider;
}
export function machine(request: Request) {
  const expected = setting('KARINA_JOB_SECRET');
  const given =
    request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (expected.length < 32 || given.length !== expected.length)
    throw new ApiError('Unauthorized.', 401);
  let delta = 0;
  for (let i = 0; i < given.length; i++)
    delta |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  if (delta !== 0) throw new ApiError('Unauthorized.', 401);
}
export type Connection = {
  user_id: string;
  provider: Provider;
  external_id: string;
  name: string;
  credentials: string | null;
  updated_at: number;
};
export const connection = (id: string, name: Provider) =>
  database()
    .prepare('SELECT * FROM connections WHERE user_id = ? AND provider = ?')
    .bind(id, name)
    .first<Connection>();
