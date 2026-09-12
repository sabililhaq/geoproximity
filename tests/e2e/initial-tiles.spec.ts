import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`loads comparison tiles on the preconnected origin at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const tileUrls: string[] = [];
    await page.route(/basemaps\.cartocdn\.com/, (route) => {
      tileUrls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    });
    await page.goto('/');
    await expect(page.getByText('Jalan Braga')).toBeVisible();
    await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
    const zooms = tileUrls.map((url) => Number(new URL(url).pathname.split('/')[2]));
    const origins = [...new Set(tileUrls.map((url) => new URL(url).origin))];
    expect(origins).toEqual(['https://a.basemaps.cartocdn.com']);
    await expect(page.locator('link[rel="preconnect"]')).toHaveAttribute('href', origins[0]);
    expect(zooms.length).toBeGreaterThan(0);
    // The bundled comparison is in Bandung; zoom 2 belongs to the discarded world view.
    expect(zooms).not.toContain(2);

    // The world view must still load when the user explicitly clears the comparison.
    tileUrls.length = 0;
    await page.getByRole('button', { name: 'Clear all locations' }).click();
    await expect
      .poll(() => tileUrls.some((url) => new URL(url).pathname.split('/')[2] === '2'))
      .toBe(true);
  });
}
