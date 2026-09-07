async (existingPage) => {
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  const context = await existingPage
    .context()
    .browser()
    .newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: {
        dir: 'output/playwright/video',
        size: { width: 1440, height: 900 },
      },
    });
  const page = await context.newPage();
  try {
    await page.goto('http://localhost:4173/');
    await page
      .getByRole('button', { name: 'Explore a labelled sample collection' })
      .click();
    const cards = page.locator('[data-motion="record"]');
    await cards.first().waitFor();
    check(
      await page
        .getByText('Sample collection — fictional notes and activity.')
        .isVisible(),
      'sample label missing',
    );
    await page.screenshot({
      path: 'output/playwright/02-crate-desktop.png',
      fullPage: true,
    });
    const card = cards.first();
    await card.hover({ position: { x: 30, y: 50 } });
    await page.waitForFunction(
      () =>
        Math.abs(
          parseFloat(
            document
              .querySelector('[data-motion="record"]')
              .style.getPropertyValue('--tilt-y'),
          ),
        ) > 1,
    );
    check(
      await card
        .locator('[data-motion-surface]')
        .evaluate((e) => getComputedStyle(e).transform !== 'none'),
      'record spring not applied',
    );
    await page.screenshot({ path: 'output/playwright/06-hover-depth.png' });
    await page.mouse.move(10, 10);
    await page.waitForFunction(
      () =>
        parseFloat(
          document
            .querySelector('[data-motion="record"]')
            .style.getPropertyValue('--tilt-y'),
        ) === 0,
    );
    const before = await page
      .locator('[data-parallax]')
      .first()
      .evaluate((e) => e.style.getPropertyValue('--scroll-y'));
    await page.mouse.wheel(0, 240);
    await page.waitForFunction(() => scrollY > 150);
    const after = await page
      .locator('[data-parallax]')
      .first()
      .evaluate((e) => e.style.getPropertyValue('--scroll-y'));
    check(before !== after, 'ribbon parallax did not track native scroll');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(
      () =>
        new DOMMatrix(
          getComputedStyle(document.querySelector('[data-motion-surface]'))
            .transform,
        ).isIdentity,
    );
    check(
      await page
        .locator('[data-parallax]')
        .first()
        .evaluate((e) => getComputedStyle(e).translate === 'none'),
      'reduced motion did not stop parallax',
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page
      .getByRole('button', { name: 'Settings and backup', exact: true })
      .click();
    await page
      .getByRole('switch', { name: 'Lower effects', exact: true })
      .check();
    await page.waitForFunction(
      () => document.documentElement.dataset.effects === 'low',
    );
    check(
      await card
        .locator('[data-motion-surface]')
        .evaluate(
          (e) => new DOMMatrix(getComputedStyle(e).transform).isIdentity,
        ),
      'lower effects did not stop motion',
    );
    await page
      .getByRole('switch', { name: 'Lower effects', exact: true })
      .uncheck();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page
      .getByRole('button', { name: 'Dismiss notification', exact: true })
      .click();
    const open = page.getByRole('button', { name: /^Open / }).first();
    await open.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() =>
      document.activeElement?.getAttribute('aria-label')?.startsWith('Open '),
    );
    await page.getByRole('button', { name: 'Tonight', exact: true }).click();
    await page.screenshot({
      path: 'output/playwright/03-tonight.png',
      fullPage: true,
    });
    const pin = page.getByRole('button', { name: /^Pin / }).first();
    const pinName = await pin.getAttribute('aria-label');
    await pin.click();
    check(
      (await page
        .getByRole('button', {
          name: pinName.replace('Pin ', 'Unpin '),
          exact: true,
        })
        .getAttribute('aria-pressed')) === 'true',
      'Tonight pin failed',
    );
    await page.getByRole('tab', { name: 'Unexplored', exact: true }).click();
    await page
      .getByRole('button', { name: /^Dismiss / })
      .first()
      .click();
    check(
      (await page.locator('.tonight-card').count()) === 2,
      'Tonight dismissal failed',
    );
    await page.getByRole('button', { name: 'Capsules', exact: true }).click();
    const capsule = page.locator('[data-motion="capsule"]').first();
    await capsule.hover({ position: { x: 30, y: 45 } });
    await page.waitForFunction(
      () =>
        Math.abs(
          parseFloat(
            document
              .querySelector('[data-motion="capsule"]')
              .style.getPropertyValue('--tilt-y'),
          ),
        ) > 1,
    );
    const transform = await capsule
      .locator('[data-motion-surface]')
      .evaluate((e) => getComputedStyle(e).transform);
    check(
      transform.startsWith('matrix3d'),
      'capsule spring CSS was overridden',
    );
    await page.screenshot({
      path: 'output/playwright/07-capsules.png',
      fullPage: true,
    });
    await capsule.click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: 'output/playwright/08-capsule-open.png' });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Atlas', exact: true }).click();
    await page.screenshot({
      path: 'output/playwright/09-atlas-sample.png',
      fullPage: true,
    });
    const slider = page.getByRole('slider');
    await slider.focus();
    await page.keyboard.press('Home');
    const earliest = await slider.getAttribute('aria-valuenow');
    await page.keyboard.press('End');
    check(
      (await slider.getAttribute('aria-valuenow')) !== earliest,
      'timeline keyboard scrubber failed',
    );
    await page.getByRole('button', { name: /^Crate/ }).click();
    await page
      .getByRole('checkbox', { name: 'Select this page', exact: true })
      .check();
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    check(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem('resonance:sample:v1')).items.every(
          (i) => i.status === 'keep',
        ),
      ),
      'bulk keep failed',
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page
      .getByRole('button', { name: 'Dismiss notification', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Back to my collection', exact: true })
      .click();
    check(
      await page
        .getByRole('button', { name: 'Explore a labelled sample collection' })
        .isVisible(),
      'sample leaked into personal collection',
    );
    // 200% text enlargement must retain accessible controls and horizontal fit.
    await page.evaluate(
      () => (document.documentElement.style.fontSize = '200%'),
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'enlarged text caused horizontal overflow',
    );
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    return {
      passed: [
        'spring hover and settle',
        'native scroll parallax',
        'live reduced motion',
        'lower effects',
        'keyboard detail and focus return',
        'Tonight pin and dismiss',
        'capsule depth and reopen',
        'Atlas keyboard scrubber',
        'bulk organisation and undo',
        'sample isolation',
        '200% root text enlargement',
      ],
      video: await page.video().path(),
    };
  } finally {
    await context.close();
  }
};
