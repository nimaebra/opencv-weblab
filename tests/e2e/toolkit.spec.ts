import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const examples = [
  ['local-contrast', 'CLAHE', '192 × 192'],
  ['details', 'Black-hat', '192 × 192'],
  ['rectify', 'Perspective correction', '160 × 160'],
  ['geometry', 'Hough line segments', '192 × 192'],
  ['distances', 'Color map', '192 × 192'],
] as const;
test('runs all five new examples and restores their saved graph and original source', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  for (const [kind, label, dimensions] of examples) {
    await page.getByLabel('Example pipeline').selectOption(kind);
    await expect(page.locator('.frame-b .frame-heading')).toContainText(label);
    await expect(page.locator('.frame-b .frame-caption')).toContainText(dimensions);
    await expect(page.locator('.has-error')).toHaveCount(0);
    await expect(page.locator('.save-indicator')).toHaveAttribute('title', 'Saved on this device');
  }
  await page.reload();
  await expect(page.locator('.frame-b .frame-heading')).toContainText('Color map');
  await expect(page.locator('.frame-b .frame-caption')).toContainText('192 × 192');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  expect(errors).toEqual([]);
});
test('searches and adds Crop, edits coordinates with the keyboard, undoes and exports exact dimensions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await expect(page.locator('.status-dot.ready')).toBeVisible({ timeout: 30000 });
  await page.locator('.react-flow__node').filter({ hasText: 'Canny edges' }).click();
  const search = page.getByRole('searchbox', { name: 'Find an operation' });
  await search.fill('crop');
  await expect(page.locator('.tool')).toHaveCount(1);
  await page.locator('.tool').click();
  const right = page.getByRole('spinbutton', { name: 'Right (%) value', exact: true });
  await expect(right).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'Compare three values', exact: true })).toHaveCount(
    0,
  );
  await right.fill('50');
  await right.press('Enter');
  await expect(page.locator('.frame-b .frame-caption')).toContainText('256 × 480');
  await page.locator('.history-actions').getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('.react-flow__node').filter({ hasText: 'Crop / ROI' }).click();
  await expect(right).toHaveValue('100');
  await right.fill('50');
  await right.press('Enter');
  await expect(page.locator('.frame-b .frame-caption')).toContainText('256 × 480');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export full-resolution PNG', exact: true }).click();
  const file = await (await pending).path();
  const png = await readFile(file!);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 480]);
});
test('keeps perspective controls keyboard accessible on a narrow screen and exports reproducible Python', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Example pipeline').selectOption('rectify');
  await expect(page.locator('.frame-b .frame-caption')).toContainText('160 × 160');
  await page.locator('.react-flow__node').filter({ hasText: 'Perspective correction' }).click();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  const corner = page.getByRole('spinbutton', { name: 'Top-left X (%) value', exact: true });
  await expect(corner).toHaveValue('19.9');
  await corner.focus();
  await expect(corner).toBeFocused();
  await expect(corner).toHaveAttribute('aria-describedby', /parameter-tlX-help/);
  await expect(page.getByRole('button', { name: 'Compare three values', exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({ path: '.impeccable/review/toolkit-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close inspector panel' }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('.code-preview')).toContainText('cv.getPerspectiveTransform');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Python' }).click();
  const python = await readFile((await (await pending).path())!, 'utf8');
  expect(python).toContain('rectify(');
  expect(python).toContain('crop_roi(');
});
