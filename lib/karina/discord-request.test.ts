import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiscordRequest } from './discord-request.ts';

const endpoint = 'https://discord.com/api/v10/applications/123/commands';
void test('429 retries the same command after Discord’s fractional delay', async () => {
  const waits: number[] = [],
    bodies: unknown[] = [];
  const request = createDiscordRequest(
    async (_url, init) => {
      bodies.push(init.body);
      return bodies.length === 1
        ? Response.json({ retry_after: 1.25 }, { status: 429 })
        : Response.json({ id: 'registered' });
    },
    async (ms) => {
      waits.push(ms);
    },
  );
  const result = await request(endpoint, {
    method: 'POST',
    body: '{"name":"fm"}',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(waits, [1350]);
  assert.deepEqual(bodies, ['{"name":"fm"}', '{"name":"fm"}']);
});
void test('an exhausted bucket delays the next command without consuming the successful body', async () => {
  const order: string[] = [];
  const request = createDiscordRequest(
    async () => {
      order.push('request');
      return Response.json(
        { id: 'ok' },
        {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset-after': '0.5',
          },
        },
      );
    },
    async (ms) => {
      order.push(`wait ${ms}`);
    },
  );
  assert.deepEqual(await (await request(endpoint, {})).json(), { id: 'ok' });
  await request(endpoint, {});
  assert.deepEqual(order, ['request', 'wait 600', 'request']);
});
void test('Retry-After works for a non-JSON 429 and authentication errors are not retried', async () => {
  let calls = 0;
  const waits: number[] = [];
  const request = createDiscordRequest(
    async () =>
      ++calls === 1
        ? new Response('limited', {
            status: 429,
            headers: { 'retry-after': '2' },
          })
        : new Response('unauthorized', { status: 401 }),
    async (ms) => {
      waits.push(ms);
    },
  );
  assert.equal((await request(endpoint, {})).status, 401);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2100]);
});
void test('persistent rate limiting has a finite retry budget', async () => {
  let calls = 0;
  const request = createDiscordRequest(
    async () => {
      calls++;
      return Response.json({ retry_after: 0 }, { status: 429 });
    },
    async () => {},
  );
  await assert.rejects(request(endpoint, {}), /still rate limiting/);
  assert.equal(calls, 5);
});
void test('a long server pause is not shortened and other origins never receive a request', async () => {
  let calls = 0;
  const request = createDiscordRequest(
    async () => {
      calls++;
      return Response.json({ retry_after: 600 }, { status: 429 });
    },
    async () => {
      assert.fail('must not retry early');
    },
  );
  await assert.rejects(
    request('https://example.com/', {}),
    /only be sent to Discord/,
  );
  assert.equal(calls, 0);
  await assert.rejects(request(endpoint, {}), /longer pause/);
  assert.equal(calls, 1);
});
