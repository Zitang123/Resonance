async (existingPage) => {
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  const context = await existingPage
    .context()
    .browser()
    .newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });
  const page = await context.newPage();
  try {
    await page.goto('http://localhost:4173/');
    await page
      .getByRole('button', { name: 'Explore a labelled sample collection' })
      .tap();
    await page
      .getByRole('button', { name: 'Settings and backup', exact: true })
      .tap();
    await page.getByRole('button', { name: 'Reset sample', exact: true }).tap();
    await page.getByRole('button', { name: 'Close', exact: true }).tap();
    await page
      .getByRole('button', { name: 'Dismiss notification', exact: true })
      .tap();
    check(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      'touch pointer not active',
    );
    await page.screenshot({
      path: 'output/playwright/10-mobile-crate.png',
      animations: 'disabled',
    });
    const session = await context.newCDPSession(page);
    await session.send('Input.synthesizeScrollGesture', {
      x: 200,
      y: 450,
      yDistance: -450,
      gestureSourceType: 'touch',
    });
    await page.waitForFunction(() => scrollY > 100);
    await page.locator('.music-card .cover-button').first().tap();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({
      path: 'output/playwright/11-mobile-detail.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Close', exact: true }).tap();
    for (const name of ['Tonight', 'Capsules', 'Atlas']) {
      await page.getByRole('button', { name, exact: true }).tap();
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name} has mobile overflow`,
      );
      await page.screenshot({
        path: `output/playwright/mobile-${name.toLowerCase()}.png`,
        animations: 'disabled',
      });
    }
    await page.getByRole('button', { name: 'Capsules', exact: true }).tap();
    const before = await page.evaluate(
      () => JSON.parse(localStorage.getItem('resonance:sample:v1')).capsules[0],
    );
    await page.locator('.capsule-card').first().tap();
    await page.getByRole('button', { name: 'Edit capsule', exact: true }).tap();
    await page
      .getByRole('textbox', { name: 'Your writing', exact: true })
      .fill('Edited on a phone. 밤의 음악.');
    await page
      .getByRole('button', { name: /^Move .* down$/ })
      .first()
      .tap();
    await page
      .getByLabel('Capsule theme', { exact: true })
      .selectOption('blue');
    check(
      await page.getByLabel('Add an image', { exact: true }).isDisabled(),
      'image rights gate missing',
    );
    await page
      .getByRole('checkbox', {
        name: 'I own this image or have permission to use it.',
        exact: true,
      })
      .check();
    await page
      .getByLabel('Add an image', { exact: true })
      .setInputFiles('output/playwright/10-mobile-crate.png');
    await page
      .getByRole('button', { name: 'Remove image', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Save capsule', exact: true }).tap();
    const after = await page.evaluate(
      () => JSON.parse(localStorage.getItem('resonance:sample:v1')).capsules[0],
    );
    check(
      after.itemIds[1] === before.itemIds[0] &&
        after.theme === 'blue' &&
        after.description.includes('밤') &&
        after.image.startsWith('data:image/png'),
      'capsule mobile edit/reorder/image failed',
    );
    await page
      .getByRole('button', { name: 'Dismiss notification', exact: true })
      .tap();
    await page
      .getByRole('button', { name: 'Settings and backup', exact: true })
      .tap();
    await page.getByRole('button', { name: 'Reset sample', exact: true }).tap();
    check(
      (await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('resonance:sample:v1')).capsules[0]
            .description,
      )) !== after.description,
      'sample reset failed',
    );
    await page.getByRole('button', { name: 'Close', exact: true }).tap();
    return {
      passed: [
        '390px touch layout in all four spaces',
        'native touch scrolling',
        'touch detail open and close',
        'capsule editing and ordering',
        'local image rights/upload',
        'independent sample reset',
      ],
    };
  } finally {
    await context.close();
  }
};
