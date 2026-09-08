import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(
  new URL('../../public/sw.js', import.meta.url),
  'utf8',
);
const origin = 'https://resonance.test';
function worker({
  writeFails = false,
  readFails = false,
  offline = false,
  cachedShell = false,
} = {}) {
  const events = new Map();
  const context = vm.createContext({
    URL,
    Response,
    Promise,
    self: {
      location: { origin },
      addEventListener: (name, fn) => events.set(name, fn),
    },
    fetch: async (request) => {
      if (offline) throw new TypeError('Network offline');
      const response = new Response('network response');
      Object.defineProperty(response, 'url', {
        value: new URL(
          typeof request === 'string' ? request : request.url,
          origin,
        ).href,
      });
      return response;
    },
    caches: {
      open: async () => ({
        put: async () => {
          if (writeFails) throw new DOMException('Full', 'QuotaExceededError');
        },
      }),
      match: async () => {
        if (readFails) throw Error('Storage blocked');
        return cachedShell ? new Response('cached shell') : undefined;
      },
    },
    DOMException,
  });
  vm.runInContext(source, context);
  return async (path, mode = 'cors') => {
    let pending;
    events.get('fetch')({
      request: { url: origin + path, method: 'GET', mode },
      respondWith: (p) => (pending = p),
    });
    return pending;
  };
}
test('full offline cache preserves successful online navigation and uncached assets', async () => {
  const fetch = worker({ writeFails: true });
  for (const [path, mode] of [['/assets/app.js', 'cors']]) {
    const response = await fetch(path, mode);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'network response');
  }
});
test('blocked cache reads still fetch assets online', async () => {
  const response = await worker({ readFails: true, writeFails: true })(
    '/assets/app.js',
  );
  assert.equal(await response.text(), 'network response');
});
test('navigation never reuses another account’s cached HTML, including offline', async () => {
  assert.equal(
    await worker({ offline: true, cachedShell: true })('/', 'navigate'),
    undefined,
  );
});
test('provider APIs and authentication routes are never intercepted', async () => {
  const fetch = worker();
  for (const path of [
    '/api/providers?kind=history',
    '/auth/callback',
    '/signin-with-chatgpt',
    '/signout-with-chatgpt',
    '/callback',
    '/api/account/collection',
    '/private/image.png',
    '/cdn-cgi/access/login',
  ])
    assert.equal(await fetch(path), undefined);
});
