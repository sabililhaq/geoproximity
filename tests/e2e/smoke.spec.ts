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

for (const width of [320, 390]) {
  test(`mobile selection stays readable in dark mode at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const input = page.locator('[data-dest-input]');
    await input.fill('-6.88, 107.61');
    await input.press('Enter');
    await page.getByRole('option').first().click();
    await expect(page.locator('.px-hint')).toHaveText('Tap the selected place again to clear');
    const popup = page.locator('.leaflet-popup-content');
    await expect(popup).toBeVisible();
    await expect(popup).not.toContainText('total');
    await expect
      .poll(async () => {
        const box = (await popup.boundingBox())!;
        const map = (await page.locator('.px-map-wrap').boundingBox())!;
        return (
          box.x >= map.x &&
          box.x + box.width <= map.x + map.width &&
          box.y >= map.y + 72 &&
          box.y + box.height <= map.y + map.height
        );
      })
      .toBe(true);
    const colors = await page
      .getByRole('button', { name: 'Driving', exact: true })
      .evaluate((button) => {
        const ink = document.createElement('span');
        ink.style.color = 'var(--px-ink)';
        button.append(ink);
        const expected = getComputedStyle(ink).color;
        ink.remove();
        return { actual: getComputedStyle(button).color, expected };
      });
    expect(colors.actual).toBe(colors.expected);
  });
}

test('mobile people summary frees space and can be edited again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const input = page.locator('[data-dest-input]');
  await input.fill('-6.88, 107.61');
  await input.press('Enter');
  const editor = page.locator('.px-people-editor');
  const before = (await page.locator('.px-people').boundingBox())!.height;
  await page.getByRole('option').first().click();
  await expect(editor).toBeHidden();
  const toggle = page.locator('[data-people-toggle]');
  await expect(toggle).toHaveText('2 peopleEdit');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await page.locator('.px-people').boundingBox())!.height).toBeLessThan(before - 100);
  await toggle.click();
  await expect(input).toBeVisible();
  await input.fill('-6.92, 107.55');
  await input.press('Enter');
  await expect(toggle).toHaveText('3 peopleDone');
  await toggle.click();
  await expect(editor).toBeHidden();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(editor).toBeVisible();
  await expect(toggle).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Clear all locations' }).click();
  await expect(input).toBeVisible();
  await expect(toggle).toBeHidden();
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 1280, height: 800 },
]) {
  test(`selecting a venue frames every person at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/#px2=-6.88,107.61,North;-6.92,107.55,West|-6.9,107.6,Venue|');
    await page.getByRole('option').first().click();
    await expect
      .poll(async () =>
        page.locator('.leaflet-marker-icon').evaluateAll((markers) => {
          const map = document.querySelector('.px-map-wrap')!.getBoundingClientRect();
          return (
            markers.length === 3 &&
            markers.every((marker) => {
              const box = marker.getBoundingClientRect();
              return (
                box.left >= map.left &&
                box.right <= map.right &&
                box.top >= map.top &&
                box.bottom <= map.bottom
              );
            })
          );
        }),
      )
      .toBe(true);
  });
}

test('people labels match the map and names can be edited with buttons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#px2=-6.88,107.61,North;-6.92,107.55,West|-6.9,107.6,Venue|');
  await expect(page.locator('.leaflet-marker-icon .px-person-badge')).toHaveText(['A', 'B']);
  await page.getByRole('button', { name: 'Rename North', exact: true }).click();
  const person = page.getByRole('textbox', { name: 'Rename North', exact: true });
  await person.fill('Home');
  await person.press('Enter');
  await expect(page.locator('[data-dest-current]')).toContainText('Home');
  await page.getByRole('option').first().click();
  await expect(page.locator('.px-peer-list .px-person-badge')).toHaveText(['A', 'B']);
  await expect(page.locator('.px-peer-list')).toContainText('Home');
  await expect(page.locator('[data-io-status]')).not.toContainText('calculating distances');
  await page.getByRole('button', { name: 'Rename Venue', exact: true }).click();
  const venue = page.getByRole('textbox', { name: 'Rename Venue', exact: true });
  await venue.fill('Cafe');
  await venue.press('Enter');
  await expect(page.getByRole('option')).toContainText('Cafe');
  await page.reload();
  await expect(page.locator('[data-dest-current]')).toContainText('Home');
  await expect(page.getByRole('option')).toContainText('Cafe');
});
