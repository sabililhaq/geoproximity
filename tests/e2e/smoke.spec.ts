import { expect, test, type Page } from '@playwright/test';

async function stubNetwork(page: Page) {
  await page.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('https://photon.komoot.io/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ features: [] }),
    }),
  );
  await page.route('https://router.project-osrm.org/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'Ok', durations: [[60]], distances: [[1000]] }),
    }),
  );
  await page.route(/basemaps\.cartocdn\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') }),
  );
}

test.beforeEach(async ({ page }) => {
  await stubNetwork(page);
});

test('loads the bundled sample', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('option').first()).toBeVisible();
  await expect(page.getByText('Jalan Braga')).toBeVisible();
  await expect(page.getByText('Warunk Upnormal')).toBeVisible();
});

test('adds a place from pasted coordinates', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Clear all locations' }).click();
  const dest = page.locator('[data-dest-input]');
  await dest.fill('48.8566, 2.3522');
  await dest.press('Enter');
  await expect(page.locator('[data-dest-current]')).toContainText('48.8566');
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
]) {
  test(`mobile controls remain usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('[data-rank-by]')).toBeHidden();
    const last = page.getByRole('option').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await last.click();
    await expect(last).toHaveClass(/is-selected/);

    if (viewport.width < 768) {
      const sidebar = page.locator('.px-sidebar');
      const before = (await sidebar.boundingBox())!;
      const divider = (await page.locator('.px-resizer').boundingBox())!;
      const x = divider.x + divider.width / 2;
      const y = divider.y + divider.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 40, { steps: 5 });
      await page.mouse.up();
      // Short landscape screens reach the map's minimum height before the full drag.
      expect((await sidebar.boundingBox())!.height).toBeGreaterThan(before.height + 10);
    }
  });
}

test('browser pinch zoom keeps the map visible', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale)).toBe(2);
  await expect(page.locator('[data-proximity]')).not.toHaveClass(/is-keyboard-open/);
  await expect(page.locator('.px-map-wrap')).toBeVisible();
});

test('keeps a low input above a keyboard that opens after focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.px-advanced summary').click();
  const input = page.locator('[data-loc-input]');
  await input.focus();
  // Real keyboard animations complete after the previous fixed 80ms focus timer.
  await page.waitForTimeout(150);
  for (const height of [500, 360, 300]) {
    await page.evaluate((height) => {
      Object.defineProperties(window.visualViewport!, {
        height: { configurable: true, value: height },
        offsetTop: { configurable: true, value: 24 },
      });
      window.visualViewport!.dispatchEvent(new Event('resize'));
    }, height);
    await expect
      .poll(() =>
        input.evaluate((element) => {
          const field = element.getBoundingClientRect();
          const panel = element.closest('.px-sidebar-body')!.getBoundingClientRect();
          const viewport = window.visualViewport!;
          return (
            field.top >= Math.max(panel.top, viewport.offsetTop) &&
            field.bottom <= Math.min(panel.bottom, viewport.offsetTop + viewport.height)
          );
        }),
      )
      .toBe(true);
  }
  await expect(input).toBeFocused();
  await input.fill('48.8566, 2.3522');
  await input.press('Enter');
  await expect(page.locator('[data-loc-list]')).toContainText('48.8566');
});
