import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const root = process.cwd();
const compile = (file) =>
  ts.transpileModule(readFileSync(`${root}/${file}`, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
const source = compile('lib/resonance/use-collection.ts'),
  domainSource = compile('lib/resonance/domain.ts'),
  clientSource = compile('lib/account/client.ts');
const empty = () => ({
  version: 1,
  items: [],
  capsules: [],
  moments: [],
  preferences: { lowerEffects: false },
});
const acct = (id = 'alice', revision = 'r1', onboarded = true) => ({
  id,
  name: id,
  revision,
  onboarded,
});
const track = (id) => ({
  id,
  title: id,
  artist: 'Synthetic artist',
  type: 'track',
  links: [],
  savedAt: '2026-09-08T12:00:00.000Z',
  recommendedBy: '',
  note: '',
  tags: [],
  status: 'saved',
});
function harness(legacy) {
  const slots = [],
    effects = [],
    requests = [],
    map = new Map();
  let index = 0,
    store;
  if (legacy) map.set('resonance:personal:v1', JSON.stringify(legacy));
  const events = () => {
    const handlers = new Map();
    return {
      addEventListener: (n, f) => {
        if (!handlers.has(n)) handlers.set(n, new Set());
        handlers.get(n).add(f);
      },
      removeEventListener: (n, f) => handlers.get(n)?.delete(f),
      emit: (n, event = {}) => {
        for (const f of handlers.get(n) || []) f(event);
      },
    };
  };
  const window = events(),
    document = { ...events(), visibilityState: 'visible' };
  const localStorage = {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots))
        slots[i] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[i],
        (v) => (slots[i] = typeof v === 'function' ? v(slots[i]) : v),
      ];
    },
    useRef(v) {
      const i = index++;
      return (slots[i] ??= { current: v });
    },
    useEffect(f, deps) {
      const i = index++;
      if (!(i in slots)) {
        slots[i] = deps;
        effects.push(f);
      }
    },
  };
  const globals = {
    structuredClone,
    queueMicrotask,
    localStorage,
    window,
    document,
    location: { assign() {} },
    crypto,
    JSON,
    TextEncoder,
    TextDecoder,
    Headers,
    AbortSignal,
    Response,
    URL,
    console,
    fetch: (url, options) =>
      new Promise((resolve, reject) =>
        requests.push({ url, options, resolve, reject }),
      ),
  };
  function module(text, require) {
    const m = { exports: {} };
    vm.runInNewContext(
      `(function(require,module,exports){${text}\n})`,
      globals,
    )(require, m, m.exports);
    return m.exports;
  }
  const domain = module(domainSource, () => {
      throw Error('unexpected import');
    }),
    client = module(clientSource, () => {
      throw Error('unexpected import');
    });
  const hook = module(source, (n) =>
    n === 'react'
      ? react
      : n === './domain'
        ? domain
        : n === '../account/client'
          ? client
          : undefined,
  );
  function render() {
    index = 0;
    store = hook.useCollection();
    while (effects.length) effects.shift()();
    return store;
  }
  async function settle() {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setImmediate(r));
      render();
    }
    return store;
  }
  function next(url, method = 'GET') {
    const i = requests.findIndex(
      (r) => r.url === url && (r.options.method || 'GET') === method,
    );
    assert.notEqual(
      i,
      -1,
      `Missing ${method} ${url}; pending ${requests.map((r) => r.url)}`,
    );
    return requests.splice(i, 1)[0];
  }
  async function answer(url, body, method = 'GET', status = 200) {
    const r = next(url, method);
    r.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await settle();
    return r;
  }
  render();
  return {
    get store() {
      return store;
    },
    requests,
    window,
    document,
    map,
    client,
    settle,
    answer,
    next,
  };
}
async function loaded(legacy) {
  const h = harness(legacy);
  await h.settle();
  await h.answer('/api/account', { account: acct() });
  await h.answer('/api/account/collection', { state: empty(), revision: 'r1' });
  assert.equal(h.store.ready, true);
  return h;
}
const results = [];
// Focus while the initial collection is loading starts a same-identity refresh.
{
  const h = harness();
  await h.settle();
  await h.answer('/api/account', { account: acct() });
  const old = h.next('/api/account/collection');
  h.window.emit('focus');
  await h.settle();
  await h.answer('/api/account', { account: acct() });
  old.resolve(new Response(JSON.stringify({ state: empty(), revision: 'r1' })));
  await h.settle();
  if (h.requests.some((r) => r.url === '/api/account/collection'))
    await h.answer('/api/account/collection', {
      state: empty(),
      revision: 'r1',
    });
  results.push({
    case: 'initial-load-focus-race',
    ready: h.store.ready,
    checking: h.store.checking,
    error: h.store.error,
    pending: h.requests.length,
    account: h.store.account?.id,
  });
  assert.equal(h.store.ready, true);
}
// Same account visibility validation preserves state and resumes normal saves.
{
  const h = await loaded();
  h.document.visibilityState = 'hidden';
  h.document.emit('visibilitychange');
  await h.settle();
  assert.equal(h.store.checking, true);
  h.document.visibilityState = 'visible';
  h.document.emit('visibilitychange');
  await h.settle();
  await h.answer('/api/account', { account: acct() });
  assert.equal(h.store.ready, true);
  assert.equal(h.store.checking, false);
  results.push({ case: 'same-account-visibility', pass: true });
}
// A pending refresh must not restore a signed-out identity.
{
  const h = await loaded();
  h.window.emit('focus');
  await h.settle();
  const pending = h.next('/api/account');
  h.store.signOut();
  await h.settle();
  pending.resolve(new Response(JSON.stringify({ account: acct() })));
  await h.settle();
  assert.equal(h.store.account, null);
  assert.equal(h.client.getActiveAccount(), null);
  results.push({ case: 'signout-pending-refresh', pass: true });
}
// Switching users while a save is pending must ignore the first user's response.
{
  const h = await loaded();
  const next = { ...empty(), items: [track('alice-track')] };
  const saved = h.store.commit(next);
  await h.settle();
  const pending = h.next('/api/account/collection', 'PUT');
  h.window.emit('focus');
  await h.settle();
  await h.answer('/api/account', { account: acct('bob', 'b1') });
  await h.answer('/api/account/collection', { state: empty(), revision: 'b1' });
  pending.resolve(
    new Response(JSON.stringify({ state: next, revision: 'r2' })),
  );
  await h.settle();
  assert.equal(await saved, false);
  assert.equal(h.store.account.id, 'bob');
  assert.equal(h.store.state.items.length, 0);
  results.push({ case: 'account-switch-pending-save', pass: true });
}
// A read-back failure after migration should be represented as UI state, not escape the action.
{
  const legacy = { ...empty(), items: [track('legacy-track')] };
  const h = await loaded(legacy);
  const outcome = h.store.migrate().then(
    (v) => ({ value: v }),
    (e) => ({ rejected: e.message }),
  );
  await h.settle();
  await h.answer(
    '/api/account/collection',
    { state: legacy, revision: 'r2' },
    'PUT',
  );
  await h.answer(
    '/api/account/collection',
    { error: 'Synthetic read-back outage' },
    'GET',
    503,
  );
  const result = await outcome;
  results.push({
    case: 'migration-readback-failure',
    ...result,
    error: h.store.error,
    legacyRetained: !!h.store.legacy,
    notice: h.store.notice,
  });
  assert.equal(result.value, false);
  assert.ok(h.store.error);
}
// Initial new account opens one room, then completion updates UI.
{
  const h = harness();
  await h.settle();
  await h.answer('/api/account', { account: acct('alice', null, false) });
  await h.answer('/api/account', { revision: 'r0' }, 'POST');
  await h.answer('/api/account/collection', { state: empty(), revision: 'r0' });
  assert.equal(h.store.ready, true);
  assert.equal(h.store.account.onboarded, false);
  const done = h.store.finishOnboarding();
  await h.settle();
  await h.answer('/api/account', { complete: true }, 'POST');
  assert.equal(await done, true);
  assert.equal(h.store.account.onboarded, true);
  results.push({ case: 'new-account-onboarding', pass: true });
}

// A later retry of an identical migrated collection is idempotent.
{
  const legacy = { ...empty(), items: [track('legacy-track')] };
  const h = harness(legacy);
  await h.settle();
  await h.answer('/api/account', { account: acct() });
  await h.answer('/api/account/collection', { state: legacy, revision: 'r1' });
  const ok = await h.store.migrate();
  await h.settle();
  assert.equal(ok, true);
  assert.equal(h.requests.length, 0);
  assert.equal(h.store.legacy, null);
  results.push({ case: 'migration-replay', pass: true });
}
// Stale onboarding failures should not alter the signed-out welcome.
{
  const h = harness();
  await h.settle();
  await h.answer('/api/account', { account: acct('alice', 'r1', false) });
  await h.answer('/api/account/collection', { state: empty(), revision: 'r1' });
  const pending = h.store.finishOnboarding();
  await h.settle();
  const req = h.next('/api/account', 'POST');
  h.store.signOut();
  await h.settle();
  req.resolve(
    new Response(JSON.stringify({ error: 'Synthetic old-account failure' }), {
      status: 409,
    }),
  );
  await h.settle();
  await pending;
  assert.equal(h.store.error, '');
  results.push({
    case: 'signout-pending-onboarding-failure',
    account: h.store.account,
    error: h.store.error,
  });
}
// Signing out after a failed save should not carry the failure into the welcome.
{
  const h = await loaded();
  h.store.setError('Synthetic save conflict');
  await h.settle();
  h.store.signOut();
  await h.settle();
  assert.equal(h.store.error, '');
  results.push({
    case: 'signout-existing-error',
    account: h.store.account,
    error: h.store.error,
  });
}

// A validation read started before the current save may report the pre-save revision late.
{
  const h = await loaded();
  const state = { ...empty(), items: [track('just-saved')] };
  const saving = h.store.commit(state);
  await h.settle();
  const write = h.next('/api/account/collection', 'PUT');
  h.window.emit('focus');
  await h.settle();
  const read = h.next('/api/account');
  write.resolve(new Response(JSON.stringify({ state, revision: 'r2' })));
  await h.settle();
  assert.equal(await saving, true);
  read.resolve(new Response(JSON.stringify({ account: acct('alice', 'r1') })));
  await h.settle();
  assert.equal(h.store.error, '');
  assert.equal(h.store.state.items.length, 1);
  results.push({
    case: 'late-pre-save-account-revision',
    error: h.store.error,
    items: h.store.state.items.length,
    checking: h.store.checking,
  });
}
console.log(`${results.length} client account sequencing scenarios passed.`);
