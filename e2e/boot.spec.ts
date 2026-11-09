import { expect, sceneReady, test } from './support/fixtures';

// Ticket 1: the inline loading screen and the WebGL error state.
const boot = (page: import('@playwright/test').Page) => page.getByRole('status');

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the loading screen is in the HTML itself', async ({ page }) => {
    await page.goto('./');
    await expect(boot(page)).toBeVisible();
    await expect(boot(page)).toHaveText('Entering the Hideout...');
  });
});

test('the loading screen stays until the scene is ready, then goes', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/App-*.js', async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('./');
  await expect(boot(page)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-scene', /.+/);

  release();
  await sceneReady(page);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#boot')).toHaveCount(0);
});

test('no WebGL: the loading screen turns into an error message', async ({
  page,
  consoleErrors,
}) => {
  consoleErrors.allow(/WebGL/);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    const stub = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type.startsWith('webgl')) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...args);
    };
    HTMLCanvasElement.prototype.getContext = stub as typeof original;
  });

  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'error');
  await expect(page.getByRole('alert')).toHaveText(/could not open here/);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('scene chunk fails to load: an error is shown, not an endless loader', async ({
  page,
  consoleErrors,
}) => {
  consoleErrors.allow(/ERR_FAILED|dynamically imported module/);
  await page.route('**/assets/App-*.js', (route) => route.abort());

  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'error');
  await expect(page.getByRole('alert')).not.toHaveText('Entering the Hideout...');
});
