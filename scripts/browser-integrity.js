async (existingPage) => {
  const context = await existingPage
    .context()
    .browser()
    .newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  try {
    await page.goto('http://localhost:4173/');
    await page
      .getByRole('button', { name: 'Explore a labelled sample collection' })
      .click();
    await page.evaluate(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException('QA quota exceeded', 'QuotaExceededError');
      };
    });
    await page.getByRole('button', { name: 'Capsules', exact: true }).click();
    await page.locator('.capsule-card').first().click();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Atlas', exact: true }).click();
    await page
      .locator('.timeline li')
      .filter({ hasText: 'memory · Manual' })
      .first()
      .getByRole('button')
      .first()
      .click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Crate/ }).click();
    await page.locator('.music-card .cover-button').first().click();
    await page
      .getByRole('button', { name: 'Delete from crate', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    await page.reload(); // Drops the quota stub; the profile is disposable.
    await page.evaluate(() => {
      const state = {
        version: 1,
        items: Array.from({ length: 5000 }, (_, n) => ({
          id: 'scale-' + n,
          title: 'Scale record ' + n,
          artist: 'Fixture artist ' + (n % 80),
          type: 'album',
          links: [],
          savedAt: '2026-09-07T12:00:00.000Z',
          recommendedBy: '',
          note: 'Synthetic performance fixture',
          tags: [],
          status: 'saved',
          metadata: { source: 'manual' },
        })),
        capsules: [],
        moments: [],
        preferences: { lowerEffects: true },
      };
      localStorage.setItem('resonance:personal:v1', JSON.stringify(state));
      localStorage.setItem('resonance:mode', 'personal');
    });
    const start = Date.now();
    await page.reload();
    await page.getByText('5000 records', { exact: true }).waitFor();
    const hydrateMs = Date.now() - start;
    check(
      (await page.locator('.music-card').count()) === 24,
      'large collection was not paginated',
    );
    const searchStart = Date.now();
    await page
      .getByRole('textbox', { name: 'Search your crate' })
      .fill('Scale record 4999');
    await page
      .getByRole('button', { name: 'Open Scale record 4999', exact: true })
      .waitFor();
    const searchMs = Date.now() - searchStart;
    check(
      (await page.locator('.music-card').count()) === 1,
      'large collection search failed',
    );
    return {
      passed: [
        'quota errors visible within capsule, memory and record overlays',
        '5000-record hydration and bounded 24-card rendering',
        '5000-record browser search',
      ],
      hydrateMs,
      searchMs,
    };
  } finally {
    await context.close();
  }
};
