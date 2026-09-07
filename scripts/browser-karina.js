async (existingPage) => {
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  const browser = existingPage.context().browser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: {
      'oai-authenticated-user-id': 'karina-browser-qa',
      'oai-authenticated-user-email': 'qa@example.test',
    },
    recordVideo: {
      dir: 'output/playwright/video',
      size: { width: 1440, height: 1000 },
    },
  });
  const other = await browser.newContext({
    extraHTTPHeaders: {
      'oai-authenticated-user-id': 'karina-other-qa',
      'oai-authenticated-user-email': 'other@example.test',
    },
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: () =>
        Promise.reject(new DOMException('Embedded browser', 'SecurityError')),
      configurable: true,
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const root = 'http://localhost:4173';
  try {
    await context.request.post(root + '/api/karina', {
      headers: { Origin: root },
      data: { action: 'delete', source: 'listenbrainz' },
    });
    await page.goto(root + '/?space=Karina');
    await page.getByRole('heading', { name: 'Meet Karina.' }).waitFor();
    check(
      await page.getByText('Group chats', { exact: true }).isVisible(),
      'group chat support missing',
    );
    check(
      await page.getByText('/artistplays', { exact: true }).isVisible(),
      'artistplays command missing',
    );
    await page
      .getByRole('button', { name: 'Connect your music', exact: true })
      .click();
    await page.getByRole('dialog').waitFor();
    check(
      await page
        .getByRole('heading', { name: 'Connect Spotify', exact: true })
        .isVisible(),
      'Spotify connection guide missing',
    );
    check(
      await page
        .getByRole('heading', {
          name: 'Add your listening history',
          exact: true,
        })
        .isVisible(),
      'history connection guide missing',
    );
    check(
      !(await page
        .getByRole('link', { name: 'Create Last.fm API account' })
        .count()),
      'ordinary visitors must not create API applications',
    );
    await page.screenshot({ path: 'output/playwright/karina-setup.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Listening', exact: true }).click();
    await page
      .getByRole('button', { name: 'Import history', exact: true })
      .click();
    await page
      .getByLabel('History JSON file')
      .setInputFiles('scripts/fixtures/history-fixture.json');
    await page
      .getByText('2 records ready · 1 skipped.', { exact: false })
      .waitFor();
    check(
      !(await page
        .getByRole('button', { name: 'Save to my archive', exact: true })
        .isEnabled()),
      'history uploaded without consent',
    );
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', { name: 'Save to my archive', exact: true })
      .click();
    await page.getByText('2 new listens saved.', { exact: false }).waitFor();
    await page.getByText('A dated listen', { exact: true }).waitFor();
    let stats = await (
      await context.request.get(
        root + '/api/karina?view=history&source=listenbrainz&period=overall',
      )
    ).json();
    check(
      stats.signals.count === 2 &&
        stats.signals.uniqueArtists === 1 &&
        stats.signals.uniqueTracks === 2,
      'incorrect server aggregate',
    );
    check(
      stats.signals.totalDurationMs === null,
      'unknown duration fabricated',
    );
    check(
      stats.signals.hourly.reduce((a, b) => a + b, 0) === 2 &&
        stats.signals.weekHours.reduce((a, b) => a + b.count, 0) === 2,
      '3D bins disagree',
    );
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download chart', exact: true })
      .click();
    const download = await downloadPromise;
    check(download.suggestedFilename().endsWith('.svg'), 'chart export failed');
    const historyDownloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Export my history', exact: true })
      .click();
    const historyDownload = await historyDownloadPromise;
    check(
      historyDownload.suggestedFilename() === 'resonance-history.json',
      'paginated download did not finish',
    );
    await historyDownload.saveAs('output/playwright/karina-export.json');
    const exportResponse = await context.request.get(
      root + '/api/karina/export',
    );
    const backup = await exportResponse.json();
    check(backup.records.length === 2, 'history export incomplete');
    check(
      Object.keys(backup.records[0]).length === 7,
      'extra private export fields',
    );
    const changedIds = backup.records.map((r, i) => ({
      ...r,
      id: r.source + ':' + String(i + 1).padStart(64, '0'),
    }));
    const repeated = await (
      await context.request.post(root + '/api/karina', {
        headers: { Origin: root },
        data: { action: 'import', records: changedIds },
      })
    ).json();
    check(repeated.inserted === 0, 'client-changed IDs inflated listen counts');
    const isolated = await (
      await other.request.get(
        root + '/api/karina?view=history&source=listenbrainz&period=overall',
      )
    ).json();
    check(isolated.signals.count === 0, 'another account can read history');
    check(
      (
        await context.request.post(root + '/api/karina', {
          headers: { Origin: 'https://evil.example' },
          data: { action: 'delete', source: 'listenbrainz' },
        })
      ).status() === 403,
      'cross-origin write accepted',
    );
    check(
      (
        await context.request.get(
          root +
            '/api/karina?view=history&source=spotify-export&period=overall',
        )
      ).status() === 403,
      'Spotify analytics gate bypassed',
    );
    check(
      (
        await context.request.post(root + '/api/karina/interactions', {
          data: { type: 1 },
        })
      ).status() === 401,
      'unsigned Discord request accepted',
    );
    check(
      (
        await context.request.post(root + '/api/karina/jobs', { data: {} })
      ).status() === 401,
      'unsigned scheduler accepted',
    );
    await page.reload();
    await page.getByRole('button', { name: 'Listening', exact: true }).click();
    await page.getByLabel('History source').selectOption('listenbrainz');
    await page.getByText('A dated listen', { exact: true }).waitFor();
    await page
      .getByRole('button', { name: 'Explore sample', exact: true })
      .click();
    await page
      .getByText('Sample · fictional listening', { exact: true })
      .waitFor();
    const canvas = page.locator('.listening-terrain');
    await canvas.scrollIntoViewIfNeeded();
    const before = await canvas.evaluate((e) => e.toDataURL());
    const bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 130);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 100, bounds.y + 170, {
      steps: 12,
    });
    await page.mouse.up();
    const after = await canvas.evaluate((e) => e.toDataURL());
    check(before !== after, '3D drag did not alter the chart');
    await canvas.focus();
    await page.keyboard.press('ArrowRight');
    check(
      after !== (await canvas.evaluate((e) => e.toDataURL())),
      '3D keyboard rotation did not work',
    );
    await page.getByRole('button', { name: 'Reset chart view' }).click();
    await page.screenshot({
      path: 'output/playwright/karina-terrain-desktop.png',
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByText('Read the chart as a table', { exact: true }).click();
    check(
      (await page.locator('.terrain-table tbody tr').count()) === 24,
      'table alternative missing',
    );
    stats = await (
      await context.request.get(
        root + '/api/karina?view=history&source=listenbrainz&period=overall',
      )
    ).json();
    check(stats.signals.count === 2, 'sample polluted account history');
    await page.getByRole('button', { name: 'Karina', exact: true }).click();
    await page.screenshot({
      path: 'output/playwright/karina-desktop.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Delete listenbrainz history', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Delete history', exact: true })
      .click();
    await page.getByText('History deleted.', { exact: false }).waitFor();
    const cleared = await (
      await context.request.get(
        root + '/api/karina?view=history&source=listenbrainz&period=overall',
      )
    ).json();
    check(cleared.signals.count === 0, 'deletion failed');
    await context.request.post(root + '/api/karina', {
      headers: { Origin: root },
      data: { action: 'import', records: backup.records },
    });
    const restored = await (
      await context.request.get(
        root + '/api/karina?view=history&source=listenbrainz&period=overall',
      )
    ).json();
    check(restored.signals.count === 2, 'backup restore failed');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('button', { name: 'Karina', exact: true }).click();
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'mobile horizontal overflow',
    );
    for (const name of [
      'Crate',
      'Tonight',
      'Atlas',
      'Capsules',
      'Listening',
      'Karina',
    ]) {
      const box = await page
        .getByRole('button', { name, exact: true })
        .boundingBox();
      check(
        box &&
          box.x >= 0 &&
          box.x + box.width <= 390 &&
          box.y + box.height <= 844,
        'mobile navigation clipped: ' + name,
      );
    }
    await page.screenshot({ path: 'output/playwright/karina-mobile.png' });
    await page.getByRole('button', { name: 'Listening', exact: true }).click();
    await page
      .getByRole('button', { name: 'Explore sample', exact: true })
      .click();
    await canvas.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'output/playwright/karina-terrain-mobile.png',
    });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'mobile chart overflow',
    );
    const large = Array.from({ length: 1001 }, (_, i) => ({
      id: 'listenbrainz:' + String(i + 1).padStart(64, '0'),
      source: 'listenbrainz',
      playedAt: new Date(Date.UTC(2020, 0, 1) + i * 1000).toISOString(),
      title: 'Archive fixture ' + i,
      artist: 'QA artist',
      album: '',
      durationMs: null,
    }));
    for (let i = 0; i < large.length; i += 200) {
      const result = await other.request.post(root + '/api/karina', {
        headers: { Origin: root },
        data: { action: 'import', records: large.slice(i, i + 200) },
      });
      check(result.ok(), 'large fixture import failed');
    }
    const firstPage = await (
      await other.request.get(root + '/api/karina/export?format=page')
    ).json();
    const secondPage = await (
      await other.request.get(
        root +
          '/api/karina/export?format=page&cursor=' +
          encodeURIComponent(firstPage.nextCursor),
      )
    ).json();
    check(
      firstPage.records.length === 1000 &&
        secondPage.records.length === 1 &&
        secondPage.nextCursor === null,
      'export pagination lost records',
    );
    check(
      new Set([...firstPage.records, ...secondPage.records].map((r) => r.id))
        .size === 1001,
      'export pagination duplicated records',
    );
    check(errors.length === 0, 'browser errors: ' + errors.join('; '));
    return 'PASS Karina: setup, consent import, SQL statistics, duplicate IDs, account isolation, CSRF, provider gates, export/restore/delete, public command manifest, sample isolation, drag/keyboard charts, reduced motion, 390px navigation.';
  } finally {
    await context.request.post(root + '/api/karina', {
      headers: { Origin: root },
      data: { action: 'delete', source: 'listenbrainz' },
    });
    await other.request.post(root + '/api/karina', {
      headers: { Origin: root },
      data: { action: 'delete', source: 'listenbrainz' },
    });
    await context.close();
    await other.close();
  }
};
