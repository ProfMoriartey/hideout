import { expect, test } from './support/fixtures';

test('page loads, canvas renders, no console errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./');
  await expect(page).toHaveTitle('The Hideout');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
  await expect(page.locator('#boot')).toHaveCount(0);

  const box = await canvas.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width).toBe(viewport?.width);
  expect(box?.height).toBe(viewport?.height);

  await page.screenshot({ path: `e2e/screenshots/smoke-${testInfo.project.name}.png` });
  expect(errors).toEqual([]);
});

test('scene chunk fails: neutral message with a working Retry', async ({ page, consoleErrors }) => {
  consoleErrors.allow(
    /ChunkLoadError|Failed to load resource|Failed to fetch|ERR_FAILED|dynamically imported module/,
  );
  let fail = true;
  await page.route('**/assets/App-*.js', (route) => (fail ? route.abort() : route.continue()));

  await page.goto('./');
  const boot = page.getByRole('alert');
  await expect(boot).toContainText('The Hideout could not load. Check your connection.');
  await expect(boot).not.toContainText('WebGL');
  const lantern = page.locator('#boot .lantern');
  expect(await lantern.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');

  fail = false;
  await boot.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
  await expect(page.locator('canvas')).toBeVisible();
});
