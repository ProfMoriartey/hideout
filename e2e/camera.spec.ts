import type { CDPSession, Page } from '@playwright/test';
import { expect, sceneReady, test } from './support/fixtures';

// Ticket 3: default view, camera limits and gestures. The camera is not
// exposed to the page, so every check looks at the rendered canvas.

type Lit = { x0: number; y0: number; x1: number; y1: number; count: number; w: number; h: number };

// Waits until the loader is gone and the canvas has stopped changing, then
// measures the "lit" pixels (rooms and lanterns; the dark rock stays below the threshold).
async function settle(page: Page): Promise<{ png: string; lit: Lit }> {
  await sceneReady(page);
  await expect(page.locator('#boot')).toHaveCount(0);
  let prev = '';
  await expect
    .poll(
      async () => {
        const cur = (await page.locator('canvas').screenshot()).toString('base64');
        const same = cur === prev;
        prev = cur;
        return same;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const lit = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const at = (i: number) => d[i] ?? 0;
    const r = { x0: c.width, y0: c.height, x1: -1, y1: -1, count: 0, w: c.width, h: c.height };
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const k = (y * c.width + x) * 4;
        if (Math.abs(at(k) - 11) + Math.abs(at(k + 1) - 10) + Math.abs(at(k + 2) - 16) < 60)
          continue;
        r.count++;
        r.x0 = Math.min(r.x0, x);
        r.x1 = Math.max(r.x1, x);
        r.y0 = Math.min(r.y0, y);
        r.y1 = Math.max(r.y1, y);
      }
    return r;
  }, prev);
  return { png: prev, lit };
}

const center = (page: Page) => {
  const s = page.viewportSize();
  if (!s) throw new Error('no viewport');
  return { x: s.width / 2, y: s.height / 2 };
};

async function mouseDrag(page: Page, dx: number, dy: number, button: 'left' | 'right') {
  const { x, y } = center(page);
  // Centred on the viewport so the pointer stays inside it (|d| < viewport size).
  await page.mouse.move(x - dx / 2, y - dy / 2);
  await page.mouse.down({ button });
  await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.up({ button });
}

type Pt = { x: number; y: number };
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })),
  });
}
/** Moves one or two fingers from `from` to `to` in a few steps. */
async function touchGesture(page: Page, from: Pt[], to: Pt[]) {
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', from);
  for (let i = 1; i <= 10; i++)
    await touch(
      cdp,
      'touchMove',
      from.map((p, n) => ({
        x: p.x + (((to[n]?.x ?? p.x) - p.x) * i) / 10,
        y: p.y + (((to[n]?.y ?? p.y) - p.y) * i) / 10,
      })),
    );
  await touch(cdp, 'touchEnd', []);
}

const VIEWPORTS = [
  { width: 412, height: 915 },
  { width: 915, height: 412 },
  { width: 320, height: 480 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
];

test.describe('default view', () => {
  for (const vp of VIEWPORTS)
    test(`fits the whole hideout at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('./');
      const { lit } = await settle(page);
      expect(lit.count).toBeGreaterThan(1000);
      // Rooms are fully inside the canvas ...
      expect([lit.x0 > 0, lit.y0 > 0, lit.x1 < lit.w - 1, lit.y1 < lit.h - 1]).toEqual([
        true,
        true,
        true,
        true,
      ]);
      // ... and fill most of the limiting dimension (not tiny).
      const fill = Math.max((lit.x1 - lit.x0) / lit.w, (lit.y1 - lit.y0) / lit.h);
      expect(fill).toBeGreaterThan(0.7);
    });

  test('refits after an orientation change', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto('./');
    await settle(page);
    await page.setViewportSize({ width: 915, height: 412 });
    await expect(async () => {
      const { lit } = await settle(page);
      expect(lit.x0).toBeGreaterThan(0);
      expect(lit.y0).toBeGreaterThan(0);
      expect(lit.x1).toBeLessThan(lit.w - 1);
      expect(lit.y1).toBeLessThan(lit.h - 1);
      expect((lit.y1 - lit.y0) / lit.h).toBeGreaterThan(0.7);
    }).toPass();
  });
});

test.describe('mouse', () => {
  test.slow(); // software GL: every screenshot costs a second
  test('wheel zoom is bounded at both ends', async ({ page }) => {
    await page.goto('./');
    const start = await settle(page);
    const { x, y } = center(page);
    await page.mouse.move(x, y);
    for (let i = 0; i < 50; i++) await page.mouse.wheel(0, -1500);
    const inMax = await settle(page);
    expect(inMax.png).not.toBe(start.png);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -1500);
    expect((await settle(page)).png, 'zoom-in max reached').toBe(inMax.png);

    for (let i = 0; i < 70; i++) await page.mouse.wheel(0, 1500);
    const outMin = await settle(page);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 1500);
    expect((await settle(page)).png, 'zoom-out min reached').toBe(outMin.png);
    // Zoomed out the hideout is smaller than by default, but never lost.
    expect(outMin.lit.x1 - outMin.lit.x0).toBeLessThan(start.lit.x1 - start.lit.x0);
    expect(outMin.lit.count).toBeGreaterThan(500);
  });

  test('right-drag rotation is clamped on both sides', async ({ page }) => {
    await page.goto('./');
    const start = await settle(page);
    const w = Math.round(center(page).x * 1.6);
    await mouseDrag(page, -w, 0, 'right');
    const a = await settle(page);
    expect(a.png).not.toBe(start.png);
    await mouseDrag(page, -w, 0, 'right');
    expect((await settle(page)).png, 'left limit').toBe(a.png);
    await mouseDrag(page, w, 0, 'right');
    await mouseDrag(page, w, 0, 'right');
    const b = await settle(page);
    expect(b.png).not.toBe(a.png);
    await mouseDrag(page, w, 0, 'right');
    expect((await settle(page)).png, 'right limit').toBe(b.png);
  });

  test('vertical rotation is clamped', async ({ page }) => {
    await page.goto('./');
    await settle(page);
    const h = Math.round(center(page).y * 1.6);
    await mouseDrag(page, 0, -h, 'right');
    const a = await settle(page);
    await mouseDrag(page, 0, -h, 'right');
    expect((await settle(page)).png).toBe(a.png);
    await mouseDrag(page, 0, h, 'right');
    await mouseDrag(page, 0, h, 'right');
    const b = await settle(page);
    expect(b.png).not.toBe(a.png);
    await mouseDrag(page, 0, h, 'right');
    expect((await settle(page)).png).toBe(b.png);
  });

  test('left-drag pans, and cannot lose the hideout', async ({ page }) => {
    await page.goto('./');
    const start = await settle(page);
    await mouseDrag(page, -60, 0, 'left');
    expect((await settle(page)).png).not.toBe(start.png);
    const { x, y } = center(page);
    for (const [dx, dy] of [
      [-1.6 * x, 0],
      [0, -1.6 * y],
      [1.6 * x, 0],
      [0, 1.6 * y],
    ] as const)
      for (let i = 0; i < 4; i++) await mouseDrag(page, dx, dy, 'left');
    const far = await settle(page);
    expect(far.lit.count).toBeGreaterThan(500);
  });
});

test.describe('touch', () => {
  test('one finger pans without rotating', async ({ page }) => {
    await page.goto('./');
    const start = await settle(page);
    const { x, y } = center(page);
    await touchGesture(page, [{ x, y }], [{ x, y: y - 40 }]);
    const { lit } = await settle(page);
    expect(lit.y0).toBeLessThan(start.lit.y0 - 10);
    expect(Math.abs(lit.y1 - lit.y0 - (start.lit.y1 - start.lit.y0))).toBeLessThan(
      start.lit.h * 0.02,
    );
  });

  test('two fingers pinch-zoom', async ({ page }) => {
    await page.goto('./');
    const start = await settle(page);
    const { x, y } = center(page);
    const gap = Math.min(x, y) / 4;
    await touchGesture(
      page,
      [
        { x: x - gap, y },
        { x: x + gap, y },
      ],
      [
        { x: x - 2 * gap, y },
        { x: x + 2 * gap, y },
      ],
    );
    const zoomedIn = await settle(page);
    expect(zoomedIn.lit.count).toBeGreaterThan(start.lit.count * 1.3);
    await touchGesture(
      page,
      [
        { x: x - 2 * gap, y },
        { x: x + 2 * gap, y },
      ],
      [
        { x: x - gap / 4, y },
        { x: x + gap / 4, y },
      ],
    );
    const zoomedOut = await settle(page);
    expect(zoomedOut.lit.count).toBeLessThan(start.lit.count);
  });

  test('two fingers moving together rotate, inside the clamp', async ({ page }) => {
    await page.goto('./');
    await settle(page);
    const { x, y } = center(page);
    const f = (dx: number) => [
      { x: x - 30 + dx, y },
      { x: x + 30 + dx, y },
    ];
    const angles = () => page.evaluate(() => window.__hideoutStats);
    await touchGesture(page, f(0), f(60));
    await expect.poll(async () => (await angles())?.azimuth).toBeLessThan(0.42 - 0.01);
    // A huge drag the same way stops at the azimuth limit (0.42 - 0.55), never past it.
    await touchGesture(page, f(-150), f(150));
    await expect.poll(async () => (await angles())?.azimuth).toBeCloseTo(0.42 - 0.55, 1);
    expect((await angles())?.azimuth).toBeGreaterThanOrEqual(0.42 - 0.55 - 1e-6);
  });
});

test('zoom is re-clamped when the phone is rotated after zooming in', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('./');
  await settle(page);
  for (let i = 0; i < 80; i++) await page.mouse.wheel(0, -600);
  const stats = () => page.evaluate(() => window.__hideoutStats);
  await expect
    .poll(async () => (await stats())?.zoom)
    .toBeCloseTo((await stats())?.maxZoom ?? 0, 3);
  const portraitMax = (await stats())?.maxZoom ?? 0;
  await page.setViewportSize({ width: 915, height: 412 });
  await expect.poll(async () => (await stats())?.maxZoom).not.toBeCloseTo(portraitMax, 3);
  const s = await stats();
  expect(s?.zoom).toBeLessThanOrEqual((s?.maxZoom ?? 0) + 1e-6);
  expect(s?.zoom).toBeGreaterThanOrEqual((s?.minZoom ?? 0) - 1e-6);
});

test.describe('motion and console', () => {
  test.use({ reducedMotion: 'reduce' });
  test('reduced motion: the camera never moves on its own', async ({ page }) => {
    await page.goto('./');
    const a = await settle(page);
    // 120 animation frames, no timers.
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          let n = 0;
          const tick = () => (++n > 120 ? done() : requestAnimationFrame(tick));
          tick();
        }),
    );
    expect((await settle(page)).png).toBe(a.png);
  });
});

test('no console warnings besides the known THREE.Clock deprecation', async ({ page }) => {
  const seen: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') seen.push(m.text());
  });
  await page.goto('./');
  await settle(page);
  await mouseDrag(page, 100, 50, 'right');
  await page.mouse.wheel(0, -300);
  await settle(page);
  expect(seen.filter((t) => !/THREE\.Clock/.test(t))).toEqual([]);
});
