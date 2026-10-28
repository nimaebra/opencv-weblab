import { test, expect } from '@playwright/test';
test('browser provides the worker image primitives and reaches a valid preview', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('.status-dot.ready,.status-dot.error'), {
    timeout: 20000,
  });
  const diagnostic = await page.evaluate(() => ({
    status: document.querySelector('.status-bar')?.textContent,
    errors: [...document.querySelectorAll('.node-error')].map((e) => e.getAttribute('title')),
    preview: document.querySelector('.frame-caption')?.textContent,
  }));
  expect(diagnostic.errors, JSON.stringify(diagnostic)).toEqual([]);
  expect(errors).toEqual([]);
  await expect(
    page.getByRole('button', { name: 'Export full-resolution PNG', exact: true }),
  ).toBeEnabled();
});
