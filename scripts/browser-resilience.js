async (existingPage) => {
  // All destructive recovery tests run in a NEW isolated in-memory profile.
  // Neither the user's open app nor the caller's collection is modified.
  const testContext = await existingPage.context().browser().newContext();
  const page = await testContext.newPage();
  try {
    const check = (value, message) => {
      if (!value) throw Error(message);
    };
    const key = 'resonance:personal:v1';
    const read = () =>
      page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
    const settings = () =>
      page
        .getByRole('button', { name: 'Settings and backup', exact: true })
        .click();
    const close = () =>
      page.getByRole('button', { name: 'Close', exact: true }).click();
    const restore = async (buffer) => {
      await page
        .getByLabel('Restore backup', { exact: true })
        .setInputFiles(buffer);
      await page
        .getByRole('button', { name: 'Restore this backup', exact: true })
        .click();
      await page
        .getByText('Recovery complete. Your restored music is ready.')
        .waitFor();
    };
    await page.goto('http://localhost:4173/');
    await page
      .getByRole('button', { name: 'Save music', exact: true })
      .waitFor();
    const initial = {
      version: 1,
      items: [
        {
          id: 'isolated-qa-record',
          title: 'Recovery fixture',
          artist: 'QA artist',
          type: 'track',
          links: [],
          savedAt: '2026-09-07T12:00:00.000Z',
          recommendedBy: '',
          note: 'A test note',
          tags: [],
          status: 'saved',
          metadata: { source: 'manual' },
        },
      ],
      capsules: [],
      moments: [],
      preferences: { lowerEffects: false },
    };
    await page.evaluate(
      ({ key, initial }) => localStorage.setItem(key, JSON.stringify(initial)),
      { key, initial },
    );
    await page.reload();
    await page
      .getByRole('button', { name: 'Open Recovery fixture', exact: true })
      .waitFor();
    const backup = 'scripts/fixtures/recovery-fixture.json';
    await settings();
    await page
      .getByLabel('Restore backup', { exact: true })
      .setInputFiles('scripts/fixtures/invalid-fixture.json');
    await page.getByRole('dialog').getByRole('alert').waitFor();
    check(
      JSON.stringify(await read()) === JSON.stringify(initial),
      'invalid backup changed collection',
    );
    await page
      .getByRole('button', { name: 'Delete personal collection', exact: true })
      .click();
    check(
      (await read()).items.length === 1,
      'delete confirmation did not protect collection',
    );
    await page
      .getByRole('button', { name: 'Delete this collection', exact: true })
      .click();
    check((await read()).items.length === 0, 'delete failed');
    await restore(backup);
    check(
      (await read()).items[0].note === initial.items[0].note,
      'restore lost note',
    );
    await page
      .getByRole('textbox', { name: /ListenBrainz username/ })
      .fill('resonance-fixture');
    const listens = 'scripts/fixtures/history-fixture.json';
    for (let i = 0; i < 2; i++) {
      await page
        .getByLabel('Import history file', { exact: true })
        .setInputFiles(listens);
      await page
        .getByRole('button', { name: 'Import these listens', exact: true })
        .click();
    }
    check(
      (await read()).moments.filter((m) => m.source === 'listenbrainz')
        .length === 2,
      'history import was not deduplicated',
    );
    await page
      .getByRole('button', { name: 'Fetch public history', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    check(
      (await read()).moments.length === initial.moments.length + 2,
      'unavailable provider changed history',
    );
    await close();
    await page.getByRole('button', { name: 'Save music', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Title', exact: true })
      .fill('Storage failure draft');
    await page
      .getByRole('textbox', { name: 'Artist', exact: true })
      .fill('QA artist');
    await page.evaluate(() => {
      window.__qaSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('resonance:personal:'))
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return window.__qaSetItem.call(this, key, value);
      };
    });
    await page
      .getByRole('button', { name: 'Save to crate', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    check(
      (await page
        .getByRole('textbox', { name: 'Title', exact: true })
        .inputValue()) === 'Storage failure draft',
      'storage error lost draft',
    );
    check((await read()).items.length === 1, 'failed write updated state');
    await page.evaluate(() => {
      Storage.prototype.setItem = window.__qaSetItem;
      delete window.__qaSetItem;
    });
    await close();
    await page.evaluate(
      (k) => localStorage.setItem(k, '{broken-original'),
      key,
    );
    await page.reload();
    await page.getByRole('button', { name: 'Recovery & backup' }).waitFor();
    check(
      (await page.evaluate((k) => localStorage.getItem(k), key)) ===
        '{broken-original',
      'corrupt original was overwritten',
    );
    await settings();
    await restore(backup);
    await close();
    const second = await page.context().newPage();
    await second.goto('http://localhost:4173/');
    await second
      .getByRole('button', { name: 'Save music', exact: true })
      .click();
    await second
      .getByRole('textbox', { name: 'Title', exact: true })
      .fill('Other tab');
    await second
      .getByRole('textbox', { name: 'Artist', exact: true })
      .fill('QA artist');
    await second
      .getByRole('button', { name: 'Save to crate', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Open Other tab', exact: true })
      .waitFor();
    check(
      (await read()).items.length === 2,
      'cross-tab update lost collection',
    );
    await second.close();
    // An entirely new browser context proves a first visit installs a complete offline shell.
    const cold = await page.context().browser().newContext();
    const offlinePage = await cold.newPage();
    await offlinePage.goto('http://localhost:4173/');
    await offlinePage
      .getByRole('button', { name: 'Save music', exact: true })
      .waitFor();
    await offlinePage.waitForFunction(async () => {
      const cache = await caches.open('resonance-shell-v2');
      const resources = performance
        .getEntriesByType('resource')
        .filter((r) => /\.(js|css)$/.test(r.name));
      return (
        !!navigator.serviceWorker.controller &&
        resources.length >= 7 &&
        (await Promise.all(resources.map((r) => cache.match(r.name)))).every(
          Boolean,
        )
      );
    });
    await cold.setOffline(true);
    await offlinePage.reload();
    check(
      await offlinePage.evaluate(() =>
        fetch('/api/providers?kind=metadata')
          .then(() => false)
          .catch(() => true),
      ),
      'network was not actually offline',
    );
    await offlinePage
      .getByRole('button', { name: 'Save music', exact: true })
      .click();
    await offlinePage
      .getByRole('textbox', { name: 'Title', exact: true })
      .fill('Saved offline');
    await offlinePage
      .getByRole('textbox', { name: 'Artist', exact: true })
      .fill('QA artist');
    await offlinePage
      .getByRole('button', { name: 'Save to crate', exact: true })
      .click();
    await offlinePage
      .getByRole('button', { name: 'Open Saved offline', exact: true })
      .waitFor();
    await offlinePage.reload();
    await offlinePage
      .getByRole('button', { name: 'Open Saved offline', exact: true })
      .waitFor();
    await cold.close();
    // Restore the first journey's known state for a repeatable handoff.
    await settings();
    await restore(backup);
    await close();
    return {
      passed: [
        'invalid backup unchanged',
        'delete confirmation',
        'restore preview',
        'history normalization and repeat-import deduplication',
        'disabled provider fallback',
        'quota error retains draft',
        'corrupt storage preserved and restored',
        'cross-tab update',
        'cold first-visit offline reload and offline save',
      ],
    };
  } finally {
    await testContext.close();
  }
};
