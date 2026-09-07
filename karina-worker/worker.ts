import { verifyDiscord } from '../lib/karina/protocol';
type RelayEnvironment = {
  RESONANCE_ORIGIN: string;
  DISCORD_PUBLIC_KEY: string;
  SITES_BYPASS_TOKEN: string;
  KARINA_JOB_SECRET: string;
};
function headers(env: RelayEnvironment) {
  return {
    'OAI-Sites-Authorization': `Bearer ${env.SITES_BYPASS_TOKEN}`,
    Authorization: `Bearer ${env.KARINA_JOB_SECRET}`,
  };
}
function target(env: RelayEnvironment, path: string) {
  const url = new URL(env.RESONANCE_ORIGIN);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw Error('Invalid origin');
  return new URL(path, url);
}
const relay = {
  async fetch(request: Request, env: RelayEnvironment): Promise<Response> {
    if (
      new URL(request.url).pathname !== '/interactions' ||
      request.method !== 'POST'
    )
      return new Response('Not found', { status: 404 });
    try {
      if (Number(request.headers.get('content-length')) > 1_048_576)
        return new Response('Too large', { status: 413 });
      const reader = request.body?.getReader();
      if (!reader) return new Response('Missing body', { status: 400 });
      const decoder = new TextDecoder();
      let raw = '',
        size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1_048_576) {
          await reader.cancel();
          return new Response('Too large', { status: 413 });
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
      const signature = request.headers.get('x-signature-ed25519') || '',
        timestamp = request.headers.get('x-signature-timestamp') || '';
      if (
        !(await verifyDiscord(
          raw,
          signature,
          timestamp,
          env.DISCORD_PUBLIC_KEY,
        ))
      )
        return new Response('Invalid signature', { status: 401 });
      // Forward only authenticated Discord payloads; preserve the exact signed body.
      const result = await fetch(target(env, '/api/karina/interactions'), {
        method: 'POST',
        headers: {
          ...headers(env),
          'Content-Type': 'application/json',
          'x-signature-ed25519': signature,
          'x-signature-timestamp': timestamp,
        },
        body: raw,
        redirect: 'manual',
        signal: AbortSignal.timeout(2500),
      });
      if (result.status >= 300 && result.status < 400) {
        await result.body?.cancel();
        throw Error('Resonance returned an unexpected redirect');
      }
      return new Response(result.body, {
        status: result.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return Response.json({
        type: 4,
        data: {
          content:
            'Karina’s connection is temporarily unavailable. Please try again.',
          flags: 64,
          allowed_mentions: { parse: [] },
        },
      });
    }
  },
  async scheduled(
    _event: ScheduledController,
    env: RelayEnvironment,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      fetch(target(env, '/api/karina/jobs'), {
        method: 'POST',
        headers: headers(env),
        redirect: 'manual',
        signal: AbortSignal.timeout(25000),
      })
        .then(async (response) => {
          await response.body?.cancel();
          if (!response.ok)
            console.error('Karina scheduled sync failed', response.status);
        })
        .catch(() => {
          console.error('Karina scheduled sync could not reach Resonance');
        }),
    );
  },
};

export default relay;
