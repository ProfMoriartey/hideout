import { expect, test } from './support/fixtures';

// Ticket 12: a working member's ticket shows in the desktop label and in the
// tap panel (all sizes); the phone keeps the compact name-only label.
const ORIGIN = Date.parse('2026-11-08T12:00:00Z');
const CORS = { 'access-control-allow-origin': '*' };

test('shows "ticket 3 · structure" in the label (desktop) and the panel', async ({
  page,
}, testInfo) => {
  const doc = {
    version: 1,
    updatedAt: new Date(ORIGIN).toISOString(),
    missions: [],
    members: {
      kortopi: {
        state: 'working',
        since: new Date(ORIGIN - 60_000).toISOString(),
        updatedAt: new Date(ORIGIN).toISOString(),
        verb: 'building',
        ticket: { n: 3, title: 'structure' },
      },
    },
    events: [],
  };
  await page.route('**/api.github.com/**', (r) =>
    r.fulfill({ status: 200, headers: CORS, body: 'b'.repeat(40) }),
  );
  await page.route('**/raw.githubusercontent.com/**', (r) =>
    r.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify(doc),
    }),
  );
  await page.clock.install({ time: ORIGIN });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
  const label = page.locator('[data-room="kortopi"]');
  await expect(label.locator('.room-ticket')).toHaveText('ticket 3 · structure');
  if (testInfo.project.name === 'desktop') {
    await expect(label.locator('.room-ticket')).toBeVisible();
  } else {
    const box = await label.boundingBox();
    expect(box?.height ?? 99).toBeLessThan(30); // one compact line
  }
  await label.dispatchEvent('click');
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('ticket 3 · structure');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e/screenshots/ticket-${testInfo.project.name}.png` });
});
