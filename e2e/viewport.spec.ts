import { expect, sceneReady, test } from './support/fixtures';

// Ticket 1: the canvas follows the viewport; reduced motion is respected.
async function expectCanvasFillsViewport(page: import('@playwright/test').Page) {
  const size = page.viewportSize();
  if (!size) throw new Error('no viewport');
  await expect
    .poll(async () => {
      const box = await page.locator('canvas').boundingBox();
      return box && [Math.round(box.width), Math.round(box.height)];
    })
    .toEqual([size.width, size.height]);
  const scroll = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.scrollHeight,
  ]);
  expect(scroll).toEqual([size.width, size.height]);
}

test('canvas follows resizes and orientation changes without scrollbars', async ({ page }) => {
  await page.goto('./');
  await sceneReady(page);
  const start = page.viewportSize();
  if (!start) throw new Error('no viewport');
  await expectCanvasFillsViewport(page);

  await page.setViewportSize({ width: start.height, height: start.width });
  await expectCanvasFillsViewport(page);

  await page.setViewportSize({ width: 320, height: 480 });
  await expectCanvasFillsViewport(page);

  await page.setViewportSize(start);
  await expectCanvasFillsViewport(page);
});

test('drawing buffer is capped at 1.5x DPR', async ({ page }) => {
  await page.goto('./');
  await sceneReady(page);
  const { ratio, dpr } = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    return {
      ratio: canvas.width / canvas.getBoundingClientRect().width,
      dpr: devicePixelRatio,
    };
  });
  expect(ratio).toBeCloseTo(Math.min(dpr, 1.5), 1);
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the lantern does not flicker and the loader still goes away', async ({ page }) => {
    await page.route('**/assets/App-*.js', async (route) => {
      // Keep the loader up long enough to inspect it.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });
    await page.goto('./');
    const animation = await page
      .locator('#boot .lantern')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
    await sceneReady(page);
    await expect(page.locator('#boot')).toHaveCount(0);
  });
});
