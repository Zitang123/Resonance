import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Exercise native Worker fetch; Node fetch and injected responses missed a
// production incompatibility with redirect: error. No real network or secrets.
const bundle = await build({
  stdin: {
    contents: `
      import { exchangeDiscord } from './lib/karina/providers.ts';
      export default { async fetch(request) {
        try {
          const identity = await exchangeDiscord(new URL(request.url).pathname.slice(1), {
            origin: 'https://resonance.example', discordClientId: '123456',
            discordClientSecret: 'synthetic-test-secret'
          });
          return Response.json(identity);
        } catch (error) { return Response.json({ code: error.code }, { status: 502 }); }
      }};`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  external: ['node:*'],
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: 'account-exchange',
        modules: true,
        compatibilityDate: '2026-09-03',
        compatibilityFlags: ['nodejs_compat'],
        script: bundle.outputFiles[0].text,
        outboundService: 'synthetic-discord',
      },
      {
        name: 'synthetic-discord',
        modules: true,
        compatibilityDate: '2026-09-03',
        script: `export default { async fetch(request) {
        const url = new URL(request.url);
        if (url.hostname !== 'discord.com') return Response.json({ access_token: 'leaked-test-token', token_type: 'Bearer', scope: 'identify' });
        if (url.pathname.endsWith('/token')) {
          const body = new URLSearchParams(await request.text());
          if (body.get('code') === 'redirect') return Response.redirect('https://untrusted.example/token', 307);
          return Response.json({ access_token: 'synthetic-token', token_type: 'Bearer', scope: 'identify' });
        }
        if (url.pathname.endsWith('/users/@me')) return Response.json({ id: '123456789', username: 'test-listener', global_name: null, avatar: null });
        return new Response(null, { status: 404 });
      }};`,
      },
    ],
  }),
);
try {
  const success = await mf.dispatchFetch('https://test.example/valid');
  assert.equal(success.status, 200);
  assert.equal((await success.json()).username, 'test-listener');
  const redirect = await mf.dispatchFetch('https://test.example/redirect');
  assert.equal(redirect.status, 502);
  assert.deepEqual(await redirect.json(), { code: 'unavailable' });
  process.stdout.write(
    'Native Worker OAuth exchange and redirect rejection passed.\n',
  );
} finally {
  await mf.dispose();
}
