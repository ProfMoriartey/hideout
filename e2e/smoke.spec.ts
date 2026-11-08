import { expect, test } from '@playwright/test';

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
