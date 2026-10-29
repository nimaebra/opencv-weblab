import { test, expect } from '@playwright/test';
import { makeExample, newNode, connect } from '../../packages/pipeline/src/index';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
async function ready(page: any) {
  await expect(
    page.getByRole('button', { name: 'Export full-resolution PNG', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await expect(page.locator('.status-dot.ready')).toBeVisible();
}
test('runs the real WASM pipeline, edits only downstream nodes, and restores local work', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await ready(page);
  await expect(page.locator('.node-meta').first()).toContainText('512 × 480');
  await page.locator('.react-flow__node').filter({ hasText: 'Gaussian blur' }).click();
  await expect(page.getByRole('heading', { name: 'Gaussian blur', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Kernel size value' }).fill('9');
  await page.getByRole('spinbutton', { name: 'Kernel size value' }).press('Enter');
  await expect(page.locator('.status-stats')).toContainText('2 computed');
  await expect(page.locator('.status-stats')).toContainText('2 cached');
  await page.getByRole('textbox', { name: 'Project name' }).fill('My recovered experiment');
  await expect(page.locator('.save-indicator')).toHaveAttribute('title', 'Saved on this device');
  await page.reload();
  await ready(page);
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue(
    'My recovered experiment',
  );
  await page.locator('.react-flow__node').filter({ hasText: 'Gaussian blur' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Kernel size value' })).toHaveValue('9');
  expect(errors).toEqual([]);
});
test('adds, duplicates, bypasses, undoes, and connects from the inspector', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: /5 Invert/ }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Invert', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Enable operation' }).uncheck();
  await expect(page.locator('.operation-node.bypassed')).toHaveCount(1);
  await page.getByRole('button', { name: 'Duplicate node', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await page.locator('.history-actions').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await page.locator('.react-flow__node').filter({ hasText: 'Invert' }).click();
  const from = page.getByLabel('From node');
  await from.selectOption({ label: 'Grayscale' });
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await ready(page);
  await expect(page.locator('.node-meta').last()).toContainText('GRAY');
});
test('imports a graph, reconnects an image, and exports PNG, JSON and Python', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const doc = makeExample();
  doc.sources[0]!.id = 'missing-source';
  doc.sources[0]!.name = 'fruits.jpg';
  delete doc.sources[0]!.builtin;
  doc.nodes[0]!.sourceId = 'missing-source';
  await page.locator('#json-input').setInputFiles({
    name: 'import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.locator('.operation-node.has-error').first()).toBeVisible();
  await page.locator('.react-flow__node').filter({ hasText: 'Image source' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Reconnect image' }).click();
  await (await chooser).setFiles(resolve('apps/web/public/samples/fruits.jpg'));
  await ready(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.code-preview')).toContainText('cv.GaussianBlur');
  let downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Python' }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.py$/);
  await page.getByRole('button', { name: 'Pipeline JSON' }).click();
  downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.json$/);
  downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full-resolution PNG', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.png$/);
});
test('prevents invalid cycles and leaves disconnected errors visible', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.locator('.react-flow__node').filter({ hasText: 'Grayscale' }).click();
  await page.getByLabel('From node').selectOption({ label: 'Canny edges' });
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('cycles');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
});
test('supports a branch merge and full-resolution preview without errors', async ({ page }) => {
  let doc = makeExample('branches');
  const blend = newNode('blend', 750, 250);
  doc.nodes.push(blend);
  doc = connect(doc, doc.nodes[2]!.id, blend.id);
  doc = connect(doc, doc.nodes[4]!.id, blend.id, 1);
  doc.preview.b = blend.id;
  await page.goto('/');
  await ready(page);
  await page.locator('#json-input').setInputFiles({
    name: 'branches.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await ready(page);
  await expect(page.locator('.has-error')).toHaveCount(0);
  await page.getByLabel('Preview quality').selectOption('full');
  await ready(page);
  await expect(page.getByText('Full-resolution preview · exact parameters')).toBeVisible();
  await page.getByRole('button', { name: 'Wipe comparison', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Comparison wipe position' })).toBeVisible();
});
test('keeps the editor functional when the API is offline', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: /5 Invert/ }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
});
test('renders the desktop and mobile workspace without horizontal overflow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await ready(page);
  await page.locator('.react-flow__node').filter({ hasText: 'Gaussian blur' }).click();
  await expect(page.getByRole('heading', { name: 'Gaussian blur', exact: true })).toBeVisible();
  if (testInfo.project.name === 'chromium') {
    await mkdir('.impeccable/review', { recursive: true });
    await page.screenshot({ path: '.impeccable/review/desktop.png', fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('navigation', { name: 'Workspace panels' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  if (testInfo.project.name === 'chromium')
    await page.screenshot({ path: '.impeccable/review/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Find an operation' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find an operation' }).fill('gamma');
  await page.getByRole('button', { name: /Gamma correction/ }).click();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gamma correction', exact: true })).toBeVisible();
});
