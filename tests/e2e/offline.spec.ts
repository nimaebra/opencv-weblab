import { test, expect } from '@playwright/test';
for (const url of ['http://localhost:4173/', 'http://127.0.0.1:4174/lab/'])
  test(`reopens the production lab offline at ${new URL(url).pathname}`, async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 45000 });
    await expect(
      page.getByRole('button', { name: 'Export full-resolution PNG', exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await page.getByLabel('Project name').fill('My offline experiment');
    await expect(page.locator('.save-indicator')).toHaveAttribute('title', 'Saved on this device');
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Export full-resolution PNG', exact: true }),
    ).toBeEnabled();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByLabel('Project name')).toHaveValue('My offline experiment');
    await expect(
      page.getByRole('button', { name: 'Export full-resolution PNG', exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    expect(errors).toEqual([]);
  });
test('saves pending edits before activating a real service-worker update', async ({ page }) => {
  await page.goto('http://localhost:4173/');
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 45000 });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Export full-resolution PNG', exact: true }),
  ).toBeEnabled();
  await page.request.post('http://localhost:4173/__test__/sw-version');
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await expect(page.getByText('An update is ready', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByLabel('Project name').fill('Saved before update');
  const reloaded = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame());
  await page.getByRole('button', { name: 'Save and update', exact: true }).click();
  await reloaded;
  await expect(page.getByLabel('Project name')).toHaveValue('Saved before update');
  await expect(
    page.getByRole('button', { name: 'Export full-resolution PNG', exact: true }),
  ).toBeEnabled();
});
test('waits for a portable backup when an update cannot persist edits', async ({ page }) => {
  await page.goto('http://localhost:4173/');
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 45000 });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Export full-resolution PNG', exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'projects') throw new DOMException('Full', 'QuotaExceededError');
      return put.apply(this, args as [any, IDBValidKey?]);
    };
  });
  await page.request.post('http://localhost:4173/__test__/sw-version');
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await expect(page.getByRole('button', { name: 'Save and update', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByLabel('Project name').fill('Needs a backup');
  await page.getByRole('button', { name: 'Save and update', exact: true }).click();
  await expect(page.getByText('The update is waiting.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Project name')).toHaveValue('Needs a backup');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup', exact: true }).click();
  expect((await pending).suggestedFilename()).toMatch(/\.roveran\.zip$/);
  await expect(
    page.getByRole('button', { name: 'Reload after backup', exact: true }),
  ).toBeVisible();
});
