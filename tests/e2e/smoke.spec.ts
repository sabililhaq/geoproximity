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

test('puts the comparison task before display settings', async ({ page }) => {
  await page.goto('/');
  const order = await page.locator('.px-sidebar-body').evaluate((body) => {
    const destination = body.querySelector('[data-dest-current]')!;
    const input = body.querySelector('[data-loc-input]')!;
    const modes = body.querySelector('.px-route-row')!;
    const settings = body.querySelector('.px-advanced')!;
    return [destination, input, modes].every((element, index, elements) =>
      Boolean(
        element.compareDocumentPosition(elements[index + 1] ?? settings) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    );
  });
  expect(order).toBe(true);
});

test('expands the mobile map and returns to the comparison', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const count = await page.getByRole('option').count();
  await page.getByRole('button', { name: 'Expand map' }).click();
  await expect(page.locator('.px-sidebar')).toBeHidden();
  await expect(page.locator('.px-map-wrap')).toBeVisible();
  await page.getByRole('button', { name: 'Show places' }).click();
  await expect(page.locator('.px-sidebar')).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(count);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('[data-view-toggle]')).toBeHidden();
});

test('adds another person without dropping the first starting point', async ({ page }) => {
  await page.goto('/');
  const people = page.locator('[data-dest-current]');
  const input = page.locator('[data-dest-input]');
  const count = await page.getByRole('option').count();
  await expect(input).toBeVisible();
  await expect(people).toContainText('Jalan Braga');
  await input.fill('48.8566, 2.3522');
  await input.press('Enter');
  await expect(people).toContainText('Jalan Braga');
  await expect(people).toContainText('48.8566');
  await expect(page.getByRole('option')).toHaveCount(count);
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
    await expect(page.locator('[data-rank-by]')).toHaveCount(0);
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

for (const width of [320, 390, 844, 1280]) {
  test(`multi-peer details fit the sidebar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const input = page.locator('[data-dest-input]');
    for (const coordinates of ['-6.88, 107.61', '-6.92, 107.55']) {
      await input.fill(coordinates);
      await input.press('Enter');
    }
    const row = page.getByRole('option').first();
    await row.click();
    await expect(row.locator('.px-peer-list li')).toHaveCount(3);
    const layout = await row.evaluate((element) => {
      const sidebar = element.closest('.px-sidebar-body')!;
      const body = element.querySelector('.px-row-body')!.getBoundingClientRect();
      const metric = element.querySelector('.px-row-dist')!.getBoundingClientRect();
      const peers = element.querySelector('.px-peer-list')!.getBoundingClientRect();
      return {
        overflow: sidebar.scrollWidth > sidebar.clientWidth,
        detailsWidth: body.width,
        separated: metric.bottom <= peers.top,
        metricFits: metric.left >= body.left && metric.right <= body.right,
      };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.detailsWidth).toBeGreaterThan(180);
    expect(layout.separated).toBe(true);
    expect(layout.metricFits).toBe(true);
    const hint = await page.locator('.px-hint').boundingBox();
    const map = await page.locator('.px-map-wrap').boundingBox();
    expect(hint!.x).toBeGreaterThanOrEqual(map!.x);
    expect(hint!.x + hint!.width).toBeLessThanOrEqual(map!.x + map!.width);
  });
}
