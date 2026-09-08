import assert from 'node:assert/strict';
import { hook, deferred, domain } from './account-test-harness.mjs';

{
  const first = deferred();
  let calls = 0;
  const h = hook(async () =>
    ++calls === 1 ? first.promise : { account: null },
  );
  try {
    h.mount();
    await h.flush();
    h.fire('focus');
    await h.flush();
    first.resolve({ account: null });
    const result = await h.flush();
    assert.equal(result.ready, true);
    assert.equal(result.account, null);
    assert.equal(result.checking, false);
    console.log(
      'PASS focus during initial signed-out identity request completes loading',
    );
  } finally {
    h.dispose();
  }
}
const alice = {
  id: 'alice',
  name: 'Alice',
  revision: 'revision-a',
  onboarded: true,
};
const state = {
  ...structuredClone(domain.EMPTY_STATE),
  items: [
    {
      id: 'track-a',
      title: 'Private A',
      artist: 'Artist',
      type: 'track',
      links: [],
      savedAt: '2026-09-01T00:00:00Z',
      recommendedBy: '',
      note: '',
      tags: [],
      status: 'saved',
    },
  ],
};
for (const operation of ['refresh', 'finish', 'delete']) {
  const pending = deferred();
  let delay = false;
  const h = hook(async (url, options) => {
    const action = options.body ? JSON.parse(options.body).action : null;
    if (
      delay &&
      ((operation === 'refresh' && url === '/api/account' && !action) ||
        action === operation)
    )
      return pending.promise;
    if (url === '/api/account/collection')
      return { state, revision: alice.revision };
    return { account: alice };
  });
  try {
    h.mount();
    let store = await h.flush();
    assert.equal(store.account.id, 'alice');
    delay = true;
    const inFlight =
      operation === 'refresh'
        ? store.reload()
        : operation === 'finish'
          ? store.finishOnboarding()
          : store.eraseAccount();
    store = h.render();
    store.signOut();
    pending.resolve(
      operation === 'refresh'
        ? { account: alice }
        : { complete: true, deleted: true },
    );
    if (inFlight) await inFlight;
    store = await h.flush();
    assert.equal(store.account, null);
    assert.equal(h.active(), null);
    assert.equal(store.state.items.length, 0);
    assert.equal(h.navigations.length, 0);
    console.log(`PASS late ${operation} completion cannot undo sign-out`);
  } finally {
    h.dispose();
  }
}
{
  const h = hook(async (url) =>
    url === '/api/account/collection'
      ? { state, revision: alice.revision }
      : { account: alice },
  );
  try {
    h.mount();
    const before = await h.flush();
    h.fire('focus');
    const after = await h.flush();
    assert.equal(after.state, before.state);
    assert.equal(after.ready, true);
    assert.equal(after.checking, false);
    console.log(
      'PASS same-account focus preserves the loaded collection object',
    );
  } finally {
    h.dispose();
  }
}
