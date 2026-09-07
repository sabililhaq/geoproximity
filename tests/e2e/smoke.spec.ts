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
