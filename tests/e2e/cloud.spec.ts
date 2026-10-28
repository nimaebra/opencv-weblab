import { test, expect } from '@playwright/test';
import type { PipelineDocument } from '../../packages/pipeline/src/index';
test('cloud UI preserves opt-in, skips unchanged image uploads, handles conflicts and restores its binding', async ({
  page,
}) => {
  const projects = new Map<
    string,
    {
      id: string;
      document: PipelineDocument;
      revision: number;
      syncImages: boolean;
      updatedAt: string;
    }
  >();
  let imageUploads = 0;
  let creates = 0;
  let updates = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (path === '/api/config')
      return route.fulfill({ json: { cloud: true, providers: ['google', 'github'] } });
    if (path === '/api/auth/get-session')
      return route.fulfill({
        json: { user: { id: 'student', name: 'Student', email: 'student@example.invalid' } },
      });
    if (path.includes('/assets/')) {
      imageUploads++;
      return route.fulfill({ status: 201, json: { bytes: request.postDataBuffer()?.length } });
    }
    if (path === '/api/v1/projects' && request.method() === 'POST') {
      const body = request.postDataJSON();
      const project = {
        id: body.document.id,
        document: body.document,
        revision: 1,
        syncImages: body.syncImages,
        updatedAt: new Date().toISOString(),
      };
      projects.set(project.id, project);
      creates++;
      return route.fulfill({ status: 201, json: project });
    }
    if (path.startsWith('/api/v1/projects/') && request.method() === 'PUT') {
      const body = request.postDataJSON();
      const current = projects.get(path.split('/').at(-1)!)!;
      if (current.revision !== body.revision)
        return route.fulfill({ status: 409, json: { message: 'Conflict' } });
      const next = {
        ...current,
        document: body.document,
        syncImages: body.syncImages,
        revision: current.revision + 1,
      };
      projects.set(next.id, next);
      updates++;
      return route.fulfill({ json: next });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
  await expect(page.locator('.status-dot.ready')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Cloud save', exact: true }).click();
  await page.getByRole('button', { name: 'Save to cloud', exact: true }).click();
  await expect.poll(() => creates).toBe(1);
  expect(imageUploads).toBe(0);
  await expect(page.getByText('Cloud revision 1')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Include original images' }).check();
  await page.getByRole('button', { name: 'Save to cloud', exact: true }).click();
  await expect.poll(() => imageUploads).toBe(1);
  await expect(page.getByRole('button', { name: 'Save to cloud', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('.react-flow__node').filter({ hasText: 'Gaussian blur' }).click();
  await page.getByRole('spinbutton', { name: 'Kernel size value' }).fill('9');
  await page.getByRole('spinbutton', { name: 'Kernel size value' }).press('Enter');
  await expect.poll(() => updates).toBeGreaterThanOrEqual(2);
  expect(imageUploads).toBe(1);
  for (const project of projects.values()) project.revision++;
  await page.getByRole('spinbutton', { name: 'Kernel size value' }).fill('11');
  await page.getByRole('spinbutton', { name: 'Kernel size value' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Save as a new copy', exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole('button', { name: 'Save as a new copy', exact: true }).click();
  await expect.poll(() => creates).toBe(2);
  await expect(page.getByRole('button', { name: 'Save to cloud', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue(
    'Finding the edges copy',
  );
  await expect(page.locator('.save-indicator')).toHaveAttribute('title', 'Saved on this device');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cloud save', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cloud save', exact: true }).click();
  await expect(page.getByText(/Cloud revision/)).toBeVisible();
  expect(creates).toBe(2);
});
