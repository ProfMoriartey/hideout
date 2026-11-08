import { expect, test } from './support/fixtures';

// Budget from docs/ARCHITECTURE.md: under ~60 draw calls for the whole scene.
const DRAW_CALL_BUDGET = 60;

type Stats = { calls: number; triangles: number; frames: number; voxelTriangles: number };

test('hideout structure renders within the draw-call budget', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');

  // Wait for a few rendered frames so gl.info reflects the full scene.
  await page.waitForFunction(() => (window.__hideoutStats?.frames ?? 0) > 3);
  const stats = await page.evaluate(() => window.__hideoutStats as Stats);

  expect(stats.calls).toBeGreaterThan(10);
  expect(stats.calls).toBeLessThan(DRAW_CALL_BUDGET);
  expect(stats.triangles).toBeGreaterThan(1000);
  expect(stats.voxelTriangles).toBeGreaterThan(1000);
  testInfo.annotations.push({
    type: 'stats',
    description: `calls=${stats.calls} triangles=${stats.triangles}`,
  });
  console.log(`[${testInfo.project.name}] draw calls ${stats.calls}, triangles ${stats.triangles}`);

  await page.screenshot({ path: `e2e/screenshots/structure-${testInfo.project.name}.png` });
  expect(errors).toEqual([]);
});

test('the scene is not blank: lit pixels across the default view', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => (window.__hideoutStats?.frames ?? 0) > 3);
  const png = await page.locator('canvas').screenshot();
  // Count distinct coarse colours in the screenshot by decoding it in the page.
  const distinct = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 97)
      seen.add(
        ((data[i] ?? 0) >> 4) * 256 + ((data[i + 1] ?? 0) >> 4) * 16 + ((data[i + 2] ?? 0) >> 4),
      );
    return seen.size;
  }, png.toString('base64'));
  expect(distinct).toBeGreaterThan(40);
});
