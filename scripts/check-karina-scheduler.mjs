import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const bundle = await build({
  entryPoints: ['karina-worker/worker.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  external: ['node:*', 'cloudflare:*'],
});
for (const privateSite of [false, true]) {
  let calls = 0;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-09-07',
      compatibilityFlags: ['nodejs_compat'],
      script: bundle.outputFiles[0].text,
      bindings: {
        RESONANCE_ORIGIN: 'https://resonance.example',
        KARINA_JOB_SECRET: 'synthetic-private-job-secret',
        ...(privateSite ? { SITES_BYPASS_TOKEN: 'synthetic-site-token' } : {}),
      },
      outboundService: async (request) => {
        calls++;
        assert.equal(request.url, 'https://resonance.example/api/karina/jobs');
        assert.equal(request.method, 'POST');
        assert.equal(
          request.headers.get('authorization'),
          'Bearer synthetic-private-job-secret',
        );
        assert.equal(
          request.headers.get('oai-sites-authorization'),
          privateSite ? 'Bearer synthetic-site-token' : null,
        );
        return Response.json({ message: 'Synthetic scheduled page accepted.' });
      },
    }),
  );
  try {
    const worker = await mf.getWorker();
    await worker.scheduled({ cron: '*/5 * * * *' });
    assert.equal(
      calls,
      1,
      'The actual scheduled handler must forward one authenticated job',
    );
  } finally {
    await mf.dispose();
  }
}
console.log(
  'Native Worker scheduled handler forwarded exactly one authenticated job for public and private Sites.',
);

// Exercise the real persistent alarm, including an unavailable downstream Site.
for (const downstreamStatus of [200, 503]) {
  let calls = 0;
  const secret = 'synthetic-job-secret-with-at-least-32-characters';
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-09-07',
      compatibilityFlags: ['nodejs_compat'],
      script: bundle.outputFiles[0].text,
      durableObjects: {
        KARINA_CLOCK: { className: 'KarinaClock', useSQLite: true },
      },
      bindings: {
        RESONANCE_ORIGIN: 'https://resonance.example',
        KARINA_JOB_SECRET: secret,
      },
      outboundService: async (request) => {
        calls++;
        assert.equal(request.url, 'https://resonance.example/api/karina/jobs');
        assert.equal(request.headers.get('authorization'), `Bearer ${secret}`);
        return new Response(null, { status: downstreamStatus });
      },
    }),
  );
  try {
    const url = 'https://worker.example/scheduler';
    assert.equal((await mf.dispatchFetch(url, { method: 'POST' })).status, 401);
    const headers = { Authorization: `Bearer ${secret}` };
    const start = await (
      await mf.dispatchFetch(url, { method: 'POST', headers })
    ).json();
    const repeated = await (
      await mf.dispatchFetch(url, { method: 'POST', headers })
    ).json();
    assert.equal(
      start.nextRun,
      repeated.nextRun,
      'Repeated setup cannot postpone the timer',
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const status = await (await mf.dispatchFetch(url, { headers })).json();
    assert.equal(calls, 1);
    assert.equal(status.lastStatus, downstreamStatus);
    assert.ok(status.lastAttempt > 0);
    assert.ok(
      status.nextRun > Date.now() + 240000,
      'The next run remains scheduled even after an outage',
    );
  } finally {
    await mf.dispose();
  }
}
console.log(
  'Persistent alarm authorization, idempotent setup, actual wakeup and rescheduling after success/failure passed.',
);
