import { test, expect } from '@playwright/test';

test('mobile drawers focus their content, dismiss from an input, and block covered controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const tools = page.getByRole('button', { name: 'Tools', exact: true });
  const search = page.getByRole('searchbox', { name: 'Find an operation' });
  await tools.click();
  await expect(tools).toHaveAttribute('aria-expanded', 'true');
  await expect(search).toBeFocused();
  await expect(page.locator('.workbench')).toHaveAttribute('inert', '');
  await page.locator('.tool-group summary').first().click();
  await search.fill('  gamma  ');
  await expect(page.locator('.tool')).toHaveCount(1);
  await expect(page.locator('.tool')).toBeVisible();
  await expect(page.locator('.tool')).toContainText('Gamma correction');
  await search.press('Escape');
  await expect(tools).toBeFocused();
  await expect(tools).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.workbench')).not.toHaveAttribute('inert');
  await tools.click();
  // Browsers may clear a native search input as part of Escape's default action.
  await search.fill('gamma');
  await page.getByRole('button', { name: 'Clear tool search' }).click();
  await expect(search).toBeFocused();
  await expect(page.locator('.tool')).toHaveCount(47);
  await page.getByRole('button', { name: 'Close tools panel' }).click();
  await expect(tools).toBeFocused();

  const inspector = page.getByRole('button', { name: 'Inspector', exact: true });
  await inspector.click();
  await expect(page.getByRole('complementary', { name: 'Node inspector' })).toBeFocused();
  // The uncovered left strip dismisses the drawer without activating the graph.
  await page.locator('.panel-backdrop').click({ position: { x: 5, y: 30 } });
  await expect(inspector).toBeFocused();
});

test('panel separators resize in keyboard steps and expose their actual dimensions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const separator = page.getByRole('separator', { name: 'Resize tools panel' });
  await expect(separator).toHaveAttribute('aria-valuenow', '224');
  await separator.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', '234');
  await separator.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', '244');
  await separator.press('Shift+ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow', '204');
  await separator.press('Home');
  await expect(separator).toHaveAttribute('aria-valuenow', '190');
  await separator.press('End');
  await expect(separator).toHaveAttribute('aria-valuenow', '340');
  const inspector = page.getByRole('separator', { name: 'Resize inspector panel' });
  await inspector.press('ArrowLeft');
  await expect(inspector).toHaveAttribute('aria-valuenow', '294');
  await expect(inspector).toHaveAttribute('aria-controls', 'inspector-panel');
});

test('project titles can be cleared and replaced, and dialogs restore keyboard focus', async ({
  page,
}) => {
  await page.goto('/');
  const title = page.getByRole('textbox', { name: 'Project name' });
  await title.fill('');
  await expect(title).toHaveValue('');
  await title.fill('  My image study  ');
  await title.press('Enter');
  await expect(title).toHaveValue('My image study');
  await title.fill('');
  await title.press('Tab');
  await expect(title).toHaveValue('Untitled experiment');

  const exportButton = page.getByRole('button', { name: 'Export', exact: true });
  await exportButton.focus();
  await exportButton.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(exportButton).toBeFocused();
  await expect(page.locator('.save-indicator')).toContainText(
    /Saved on this device|Saving locally/,
  );
});

test('numeric corrections are explained and field help is connected to both input methods', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.react-flow__node').filter({ hasText: 'Gaussian blur' }).click();
  const field = page.getByRole('spinbutton', { name: 'Kernel size value' });
  await expect(field).toHaveAccessibleDescription(/Odd values: 1–/);
  await expect(
    page.getByRole('slider', { name: 'Kernel size', exact: true }),
  ).toHaveAccessibleDescription(/Odd values/);
  await field.fill('8');
  await field.press('Enter');
  await expect(field).toHaveValue('9');
  await expect(page.locator('.parameter-feedback').first()).toContainText('Adjusted to 9');
});

test('expanded image viewer keeps keyboard focus inside and restores its trigger', async ({
  page,
}) => {
  await page.goto('/');
  const expand = page.getByRole('button', { name: 'Expand image viewer' });
  await expand.click();
  const viewer = page.getByRole('dialog', { name: 'Image comparison' });
  await expect(viewer).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByRole('button', { name: 'Collapse image viewer' })).toBeFocused();
  await expect(page.locator('.app-header')).toHaveAttribute('inert', '');
  await page.getByRole('button', { name: 'Fit images', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(viewer.getByRole('button', { name: 'Side-by-side comparison' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(viewer).not.toBeVisible();
  await expect(expand).toBeFocused();
  await expect(page.locator('.app-header')).not.toHaveAttribute('inert');
});

test('touch controls and long project names fit phone and landscape layouts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Project name' }).fill('A'.repeat(100));
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.project-row strong')).toContainText('A'.repeat(100));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  for (const size of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const bounds = await page.getByRole('button', { name: 'Tools', exact: true }).boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    const graph = await page.locator('.react-flow').boundingBox();
    expect(graph!.height).toBeGreaterThan(100);
  }
});
