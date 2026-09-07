import { DurableObject } from 'cloudflare:workers';
import { verifyDiscord } from '../lib/karina/protocol';
type RelayEnvironment = {
  RESONANCE_ORIGIN: string;
  DISCORD_PUBLIC_KEY: string;
  SITES_BYPASS_TOKEN?: string;
  KARINA_JOB_SECRET: string;
  KARINA_CLOCK?: DurableObjectNamespace;
};
function headers(env: RelayEnvironment) {
  return {
    ...(env.SITES_BYPASS_TOKEN
      ? { 'OAI-Sites-Authorization': `Bearer ${env.SITES_BYPASS_TOKEN}` }
      : {}),
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
async function runJob(env: RelayEnvironment) {
  const response = await fetch(target(env, '/api/karina/jobs'), {
    method: 'POST',
    headers: headers(env),
    redirect: 'manual',
    signal: AbortSignal.timeout(25000),
  });
  await response.body?.cancel();
  return response.status;
}
function operator(request: Request, env: RelayEnvironment) {
  const expected = env.KARINA_JOB_SECRET || '';
  const supplied =
    request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (expected.length < 32 || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++)
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return difference === 0;
}
// One persistent timer for the deployment. Listening records and account jobs
// remain in Resonance; this object stores only its next wakeup and run status.
export class KarinaClock extends DurableObject<RelayEnvironment> {
  async fetch(request: Request) {
    if (!operator(request, this.env))
      return new Response('Unauthorized', { status: 401 });
    if (request.method === 'POST') {
      // Repeated setup must not postpone an already scheduled run.
      if ((await this.ctx.storage.getAlarm()) === null)
        await this.ctx.storage.setAlarm(Date.now() + 1000);
    } else if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }
    return Response.json(
      {
        nextRun: await this.ctx.storage.getAlarm(),
        lastAttempt:
          (await this.ctx.storage.get<number>('lastAttempt')) ?? null,
        lastStatus: (await this.ctx.storage.get<number>('lastStatus')) ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  async alarm() {
    // Arm the next wakeup before networking, including after downstream outages.
    await this.ctx.storage.setAlarm(Date.now() + 300000);
    let status = 0;
    try {
      status = await runJob(this.env);
    } catch {
      // Fixed status only: never log credentials, responses or listening data.
    }
    await this.ctx.storage.put({ lastAttempt: Date.now(), lastStatus: status });
    if (status < 200 || status >= 300)
      console.error('Karina scheduled sync failed', status);
  }
}
const relay = {
  async fetch(request: Request, env: RelayEnvironment): Promise<Response> {
    if (new URL(request.url).pathname === '/scheduler' && env.KARINA_CLOCK) {
      if (!operator(request, env))
        return new Response('Unauthorized', { status: 401 });
      return env.KARINA_CLOCK.get(env.KARINA_CLOCK.idFromName('karina')).fetch(
        request,
      );
    }
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
      runJob(env)
        .then((status) => {
          if (status < 200 || status >= 300)
            console.error('Karina scheduled sync failed', status);
        })
        .catch(() => {
          console.error('Karina scheduled sync could not reach Resonance');
        }),
    );
  },
};

export default relay;
