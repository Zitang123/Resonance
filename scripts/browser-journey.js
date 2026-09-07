async (existingPage) => {
  const context = await existingPage
    .context()
    .browser()
    .newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto('http://localhost:4173/');
    await page
      .getByRole('button', { name: 'Save music', exact: true })
      .waitFor();
    await page.screenshot({
      path: 'output/playwright/01-empty-desktop.png',
      animations: 'disabled',
    });
    const check = (value, message) => {
      if (!value) throw Error(message);
    };
    const state = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('resonance:personal:v1') || 'null'),
      );
    await page.getByRole('button', { name: 'Save music', exact: true }).click();
    await page
      .getByRole('textbox', { name: /Music link/ })
      .fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page
      .getByRole('textbox', { name: 'Title', exact: true })
      .fill('QA — 밤 / Déjà vu');
    await page
      .getByRole('textbox', { name: 'Artist', exact: true })
      .fill('Resonance Test');
    await page.getByLabel('Music type', { exact: true }).selectOption('track');
    await page
      .getByRole('textbox', { name: /Recommended by/ })
      .fill('A friend');
    await page
      .getByRole('textbox', { name: /Personal tags/ })
      .fill('night, focus');
    await page
      .getByRole('textbox', { name: /Why save it/ })
      .fill('Test memory: the walk home.');
    await page
      .getByLabel('Add to a capsule', { exact: true })
      .selectOption('new');
    await page
      .getByRole('textbox', { name: 'New capsule title' })
      .fill('QA journeys');
    await page
      .getByRole('button', { name: 'Save to crate', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Open QA — 밤 / Déjà vu', exact: true })
      .waitFor();
    let s = await state();
    check(
      s.items.length === 1 && s.capsules[0].itemIds[0] === s.items[0].id,
      'save + capsule failed',
    );
    await page.reload();
    await page
      .getByRole('button', { name: 'Open QA — 밤 / Déjà vu', exact: true })
      .click();
    await page.getByRole('dialog').waitFor();
    check(
      (await page
        .getByRole('link', { name: 'Open in YouTube' })
        .getAttribute('href')) ===
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'provider handoff link failed',
    );
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open in YouTube' }).click();
    const popup = await popupPromise;
    await popup.close();
    s = await state();
    check(
      s.moments.length === 0 && s.items[0].status === 'saved',
      'click was incorrectly counted as listening',
    );
    await page
      .getByRole('button', { name: 'Add a memory or listening session' })
      .click();
    await page
      .getByRole('textbox', { name: 'Your memory' })
      .fill('A quiet evening. 기억하고 싶은 노래.');
    await page
      .getByLabel('Moment type', { exact: true })
      .selectOption('session');
    await page
      .getByRole('button', { name: 'Save moment', exact: true })
      .click();
    s = await state();
    check(
      s.moments.length === 1 && s.items[0].status === 'tried',
      'manual listening session failed',
    );
    await page.getByRole('button', { name: 'Save music', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Title', exact: true })
      .fill('QA — 밤 / Déjà vu');
    await page
      .getByRole('textbox', { name: 'Artist', exact: true })
      .fill('Resonance Test');
    await page.getByLabel('Music type', { exact: true }).selectOption('track');
    await page
      .getByRole('textbox', { name: /Why save it/ })
      .fill('A second recommendation.');
    await page
      .getByRole('button', { name: 'Save to crate', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Merge recommendation', exact: true })
      .click();
    s = await state();
    check(
      s.items.length === 1 && s.items[0].note.includes('second recommendation'),
      'duplicate merge failed',
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    s = await state();
    check(!s.items[0].note.includes('second recommendation'), 'undo failed');
    await page.getByRole('button', { name: 'Tonight', exact: true }).click();
    await page
      .getByRole('button', { name: 'Open QA — 밤 / Déjà vu', exact: true })
      .waitFor();
    check(
      (await page.getByText('Last logged').count()) > 0,
      'Tonight explanation missing',
    );
    await page.getByRole('button', { name: 'Atlas', exact: true }).click();
    check(
      await page.getByText('session · Manual', { exact: true }).isVisible(),
      'Atlas provenance missing',
    );
    await page
      .getByRole('button', { name: 'Accessible list view', exact: true })
      .click();
    await page.screenshot({
      path: 'output/playwright/04-atlas.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Capsules', exact: true }).click();
    await page.getByRole('button', { name: /QA journeys/ }).click();
    check(
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /QA — 밤/ })
        .isVisible(),
      'capsule reopening failed',
    );
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    s = await state();
    check(s.capsules.length === 2, 'capsule duplicate failed');
    const exportPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const exported = await exportPromise;
    await exported.saveAs('output/playwright/capsule.html');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page
      .getByRole('button', { name: 'Settings and backup', exact: true })
      .click();
    const backupPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Export backup', exact: true })
      .click();
    const backup = await backupPromise;
    await backup.saveAs('output/playwright/backup.json');
    await page
      .getByRole('switch', { name: 'Lower effects', exact: true })
      .check();
    check(
      (await state()).preferences.lowerEffects,
      'lower effects persistence failed',
    );
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Crate/ }).click();
    await page.getByRole('textbox', { name: 'Search your crate' }).fill('deja');
    check(
      await page
        .getByRole('button', { name: 'Open QA — 밤 / Déjà vu', exact: true })
        .isVisible(),
      'Unicode search failed',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'mobile overflow',
    );
    await page.screenshot({
      path: 'output/playwright/05-mobile-personal.png',
      fullPage: true,
    });
    return 'PASS: save → capsule → reload → provider handoff without listen → manual session → duplicate → undo → Tonight → Atlas → capsule reopen/duplicate/export → backup → lower effects → Unicode search → mobile';
  } finally {
    await context.close();
  }
};
