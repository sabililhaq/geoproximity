import { expect, test, type Page, type Route } from '@playwright/test';

const comparison =
  '/#px2=-6.88,107.61,North;-6.92,107.55,West|-6.9,107.6,Cafe;-6.91,107.58,Library|';
const rows = (page: Page) => page.locator('[data-loc-list] [role=option]');

for (const width of [320, 1280]) {
  test(`sample chooser loads and persists a group meetup at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
    const trigger = page.locator('.px-actions [data-sample]');
    await trigger.click();
    await expect(page.getByRole('button', { name: 'Group meetup', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-samples]')).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('button', { name: 'Group meetup', exact: true }).click();
    await expect(page.locator('[data-samples]')).toBeHidden();
    await expect(page.locator('[data-people-toggle]')).toHaveText('3 peopleEdit');
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).first()).toContainText('Central meeting point');
    await rows(page).first().click();
    await page.locator('.px-trip-details summary').click();
    await expect(page.locator('.px-peer-list li')).toHaveCount(3);
    await expect(page.locator('.px-peer-list')).toContainText('A · North Bandung');
    await page.reload();
    await expect(page.locator('[data-people-toggle]')).toHaveText('3 peopleEdit');
    await expect(rows(page)).toHaveCount(3);
    await trigger.click();
    await page.getByRole('button', { name: 'Default sample', exact: true }).click();
    await expect(page.locator('[data-people-toggle]')).toHaveText('1 personEdit');
    await expect(rows(page)).toHaveCount(4);
    // The empty-state sample action opens the same chooser.
    await page.locator('[data-clear]').click();
    await page.locator('.px-map-empty [data-sample]').click();
    await page.getByRole('button', { name: 'Group meetup', exact: true }).click();
    await expect(page.locator('[data-people-toggle]')).toHaveText('3 peopleEdit');
    await expect(trigger).toBeFocused();
  });
}

test.beforeEach(async ({ page }) => {
  await page.route(/basemaps\.cartocdn\.com/, (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.goto(comparison);
});

async function routing(page: Page, durations: (number | null)[][], distances: (number | null)[][]) {
  await page.route('https://router.project-osrm.org/**', (route) => {
    const url = new URL(route.request().url());
    const coordinates = url.pathname
      .split('/')
      .at(-1)!
      .split(';')
      .map((pair) => pair.split(',').map(Number));
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        url.pathname.includes('/table/')
          ? { code: 'Ok', durations, distances }
          : { code: 'Ok', routes: [{ distance: 3000, duration: 1000, geometry: { coordinates } }] },
      ),
    });
  });
}

async function drive(page: Page) {
  await page.locator('[data-route-mode=driving]').click();
  await expect(page.locator('[data-loc-list]')).toHaveAttribute('aria-busy', 'false');
}

test('moving a venue persists its coordinates across reload', async ({ page }) => {
  const before = page.url();
  const marker = page.locator('.leaflet-marker-icon[title=Cafe]');
  const box = (await marker.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.url()).not.toBe(before);
  const moved = page.url();
  await page.reload();
  expect(page.url()).toBe(moved);
  await expect(rows(page)).toHaveCount(2);
});

test('a narrow embedded widget uses the mobile layout inside a desktop viewport', async ({
  page,
}) => {
  await page.locator('#app').evaluate((el) => {
    el.style.width = '390px';
  });
  const map = (await page.locator('.px-map-wrap').boundingBox())!;
  const sidebar = (await page.locator('.px-sidebar').boundingBox())!;
  expect(map.y + map.height).toBeLessThanOrEqual(sidebar.y);
  expect(map.width).toBeLessThanOrEqual(390);
  expect(sidebar.width).toBeLessThanOrEqual(390);
  await page.locator('[data-view-toggle]').click();
  await expect(page.locator('.px-sidebar')).toBeHidden();
  await page.locator('[data-view-toggle]').click();
  await expect(page.locator('.px-sidebar')).toBeVisible();
});

test('co-located people and candidates survive share reload', async ({ page }) => {
  await page.locator('[data-people-toggle]').click();
  const person = page.locator('[data-dest-input]');
  for (const coordinates of ['-6.88,107.61', '-6.9,107.6']) {
    await person.fill(coordinates);
    await person.press('Enter');
  }
  const venue = page.locator('[data-loc-input]');
  await venue.fill('-6.88,107.61');
  await venue.press('Enter');
  await page.reload();
  await expect(page.locator('.px-dest-card')).toHaveCount(4);
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('[data-loc-list]')).toContainText('-6.8800');
  await expect(page.locator('[data-loc-list]')).toContainText('Cafe');
});

test('nested rename and remove buttons retain native keyboard activation', async ({ page }) => {
  await rows(page).first().focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Rename Library', exact: true }).focus();
  await page.keyboard.press('Enter');
  const editor = page.getByRole('textbox', { name: 'Rename Library', exact: true });
  await expect(editor).toBeFocused();
  await editor.fill('Meeting place');
  await editor.press('Enter');
  await page.getByRole('button', { name: 'Remove Meeting place', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(rows(page)).toHaveCount(2);
});

test('routing can be cancelled without a stale result replacing straight-line ranking', async ({
  page,
}) => {
  let pending: Route | undefined;
  await page.route('https://router.project-osrm.org/**', (route) => {
    pending = route;
  });
  await page.locator('[data-route-mode=driving]').click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(page.locator('[data-route-mode=driving]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-route-status]')).toContainText('Calculating driving');
  await expect(page.locator('[data-route-mode=straight]')).toBeEnabled();
  await page.locator('[data-route-mode=straight]').click();
  await pending!
    .fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'Ok',
        durations: [
          [1, 900],
          [1, 900],
        ],
        distances: [
          [100, 9000],
          [100, 9000],
        ],
      }),
    })
    .catch(() => {});
  await expect(page.locator('[data-route-status]')).toBeHidden();
  await expect(rows(page).first()).toContainText('Library');
  await expect(rows(page).first()).toContainText('Farthest: 4.7 km');
  await expect(page.locator('[data-loc-list]')).toHaveAttribute('aria-busy', 'false');
  await page.waitForTimeout(150);
  await expect(rows(page).first()).toContainText('Farthest: 4.7 km');
});

test('fallback ranking is independent of person order and retains incomplete status', async ({
  page,
}) => {
  await routing(
    page,
    [
      [null, null],
      [null, null],
    ],
    [
      [null, null],
      [null, null],
    ],
  );
  await drive(page);
  await expect(rows(page).first()).toContainText('Library');
  await expect(rows(page).first()).toContainText('time unavailable');
  await rows(page).first().click();
  await page.locator('.px-trip-details summary').click();
  await expect(page.locator('.px-peer-list .is-farthest')).toContainText('North');
  await expect(page.locator('.px-peer-list .is-farthest')).toContainText('4.7 km');
  await page.goto(
    '/#px2=-6.92,107.55,West;-6.88,107.61,North|-6.9,107.6,Cafe;-6.91,107.58,Library|d',
  );
  await page.reload();
  await expect(page.locator('[data-loc-list]')).toHaveAttribute('aria-busy', 'false');
  await expect(rows(page).first()).toContainText('Library');
});

test('time comparisons show one longest-trip metric and disclose individual trips', async ({
  page,
}) => {
  await routing(
    page,
    [
      [600, 900],
      [1200, 1000],
    ],
    [
      [1000, 5000],
      [2000, 3000],
    ],
  );
  await drive(page);
  await rows(page).first().click();
  await expect(rows(page).first().locator('.px-row-dist')).toHaveText('Longest trip: 17 min');
  await expect(page.locator('.px-row-meta')).toHaveCount(0);
  await expect(page.locator('.px-peer-list')).toBeHidden();
  await page.locator('.px-trip-details summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.px-peer-list')).toBeVisible();
  await expect(page.locator('.px-peer-list')).toContainText('North: 15 min · 5.0 km');
  await expect(page.locator('.px-peer-list')).toContainText('West: 17 min · 3.0 km');
  await expect(page.locator('.px-trip-total')).toContainText('32 min');
  await expect(rows(page).first()).toHaveAttribute('aria-selected', 'true');
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
]) {
  test(`large groups stay compact at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const origins = Array.from(
      { length: 8 },
      (_, i) => `${-6.85 - i * 0.01},${107.55 + i * 0.012},Person%20${i + 1}`,
    ).join(';');
    const venues = Array.from(
      { length: 12 },
      (_, i) => `${-6.86 - i * 0.005},${107.56 + i * 0.008},Venue%20${i + 1}`,
    ).join(';');
    await page.goto(`/#px2=${origins}|${venues}|`);
    await page.reload();
    await rows(page).first().click();
    await expect(page.locator('[data-people-toggle]')).toHaveText('8 peopleEdit');
    await expect(page.locator('.px-peer-list')).toBeHidden();
    await expect(rows(page).nth(1)).toBeInViewport();
    const dimensions = await page
      .locator('.px-sidebar-body')
      .evaluate((el) => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }));
    expect(dimensions.scrollWidth).toBe(dimensions.width);
    await expect(page.locator('.leaflet-tooltip')).toHaveCount(0);
    if (viewport.width === 667) {
      const sidebar = (await page.locator('.px-sidebar').boundingBox())!;
      const map = (await page.locator('.px-map-wrap').boundingBox())!;
      expect(map.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
      expect(map.height).toBeGreaterThan(300);
    }
    await page.locator('.px-trip-details summary').click();
    await expect(page.locator('.px-peer-list li')).toHaveCount(8);
    await expect(page.locator('.px-peer-list')).toBeVisible();
    await page.locator('.px-trip-details summary').click();
    await expect(page.locator('.px-peer-list')).toBeHidden();
  });
}

test('solo routing uses the same direction and matrix metrics after geometry loads', async ({
  page,
}) => {
  const routes: string[] = [];
  await page.route('https://router.project-osrm.org/**', (route) => {
    const url = new URL(route.request().url());
    const coordinates = url.pathname
      .split('/')
      .at(-1)!
      .split(';')
      .map((pair) => pair.split(',').map(Number));
    if (url.pathname.includes('/table/')) {
      expect(url.searchParams.get('sources')).toBe('0');
      expect(url.searchParams.get('destinations')).toBe('1;2');
      return route.fulfill({
        json: { code: 'Ok', durations: [[60, 120]], distances: [[1000, 2000]] },
      });
    }
    routes.push(url.pathname);
    return route.fulfill({
      json: { code: 'Ok', routes: [{ duration: 600, distance: 5000, geometry: { coordinates } }] },
    });
  });
  await page.goto('/#px=-6.92,107.61,Start|-6.9,107.6,HubA;-6.91,107.58,HubB|');
  await page.reload();
  await drive(page);
  await expect.poll(() => routes.length).toBe(2);
  await expect(page.locator('.px-edge-routed')).not.toHaveCount(0);
  expect(routes.every((path) => path.includes('/107.61,-6.92;'))).toBe(true);
  await expect(rows(page).nth(0)).toContainText('HubA');
  await expect(rows(page).nth(0)).toContainText('1 min · 1.0 km');
  await expect(rows(page).nth(1)).toContainText('2 min · 2.0 km');
});
