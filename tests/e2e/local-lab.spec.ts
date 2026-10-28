import { test, expect, type Page } from '@playwright/test';
import { makeExample } from '../../packages/pipeline/src/index';
import { resolve } from 'node:path';
async function ready(page: Page) {
  await expect(page.locator('.status-dot.ready')).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole('button', { name: 'Export full-resolution PNG', exact: true }),
  ).toBeEnabled();
}
async function saved(page: Page) {
  await expect(page.locator('.save-indicator')).toHaveAttribute('title', 'Saved on this device');
}
async function stored(page: Page) {
  await saved(page);
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('roveran');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const read = (store: string, key: IDBValidKey) =>
      new Promise<any>((resolve, reject) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const id = await read('settings', 'lastProject'),
      doc = await read('projects', id);
    db.close();
    return doc;
  });
}
test('uses no API and restores a migrated v1 experiment with its original', async ({ page }) => {
  const api: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) api.push(r.url());
  });
  await page.route('**/migration-fixture', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<title>Migration fixture</title>' }),
  );
  await page.goto('/migration-fixture');
  const doc = makeExample();
  doc.name = 'Legacy experiment';
  await page.evaluate(async (document) => {
    const blob = await (await fetch('/samples/fruits.jpg')).blob();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('roveran', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('projects', { keyPath: 'id' });
        r.result.createObjectStore('assets');
        r.result.createObjectStore('settings');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const bytes = await blob.arrayBuffer(),
      tx = db.transaction(['projects', 'assets', 'settings'], 'readwrite');
    tx.objectStore('projects').put({ ...document, updatedAt: 1 });
    tx.objectStore('assets').put({ bytes, type: blob.type }, document.sources[0]!.id);
    tx.objectStore('settings').put(document.id, 'lastProject');
    tx.objectStore('settings').put({ revision: 2 }, `cloud:${document.id}`);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, doc);
  await page.goto('/');
  await ready(page);
  await expect(page.getByLabel('Project name')).toHaveValue('Legacy experiment');
  expect(api).toEqual([]);
  expect((await stored(page)).id).toBe(doc.id);
});
test('round-trips a portable backup and creates an independent project with originals', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const before = await stored(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Portable backup', exact: true }).click();
  const backup = await pending;
  expect(backup.suggestedFilename()).toMatch(/\.roveran\.zip$/);
  const path = await backup.path();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('#json-input').setInputFiles(path!);
  await expect(
    page.getByText('Portable experiment imported with its original images.', { exact: true }),
  ).toBeVisible();
  await ready(page);
  const after = await stored(page);
  expect(after.id).not.toBe(before.id);
  expect(after.sources[0].id).not.toBe(before.sources[0].id);
  expect(after.nodes[0].sourceId).toBe(after.sources[0].id);
  await page.reload();
  await ready(page);
  expect((await stored(page)).id).toBe(after.id);
});
test('duplicates, renames, searches and confirms project deletion without changing shared originals', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await page.getByLabel('Project name').fill('Original experiment');
  await saved(page);
  const original = await stored(page);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate Original experiment', exact: true }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Original experiment copy');
  await ready(page);
  await page.locator('.react-flow__node').filter({ hasText: 'Image source' }).click();
  const choose = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Reconnect image', exact: true }).click();
  await (await choose).setFiles(resolve('apps/web/public/samples/calibration.png'));
  await expect(page.locator('.node-meta').first()).not.toContainText('512 × 480');
  await saved(page);
  const replaced = await stored(page);
  expect(replaced.sources[0].id).not.toBe(original.sources[0].id);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Rename Original experiment copy', exact: true }).click();
  await page.getByRole('textbox', { name: 'New experiment name' }).fill('My copy');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an experiment' }).fill('Original experiment');
  await page
    .getByRole('button', { name: /Original experiment\s/ })
    .first()
    .click();
  await ready(page);
  await expect(page.locator('.node-meta').first()).toContainText('512 × 480');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an experiment' }).fill('My copy');
  await page.getByRole('button', { name: 'Delete local project My copy', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Confirm project deletion' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep experiment' }).click();
  await expect(
    page.getByRole('button', { name: 'Delete local project My copy', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete local project My copy', exact: true }).click();
  await page.getByRole('button', { name: 'Delete experiment', exact: true }).click();
  await expect(page.getByText('No experiments match your search.')).toBeVisible();
});
test('drops an independent tool, inserts on a real edge and undoes each gesture atomically', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const canvas = page.locator('.graph-canvas');
  await page
    .getByRole('button', { name: /5 Invert/ })
    .dragTo(canvas, { targetPosition: { x: 80, y: 35 } });
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  await page.locator('.history-actions').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  const point = await page
    .locator('.react-flow__edge')
    .nth(1)
    .locator('.react-flow__edge-path')
    .evaluate((path: SVGPathElement) => {
      const p = path.getPointAtLength(path.getTotalLength() / 2),
        screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    });
  const bounds = await canvas.boundingBox();
  await page
    .getByRole('button', { name: /5 Invert/ })
    .dragTo(canvas, { targetPosition: { x: point.x - bounds!.x, y: point.y - bounds!.y } });
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  await ready(page);
  await page.locator('.history-actions').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
});
test('duplicates and deletes a real multiselection in a single undo step', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.locator('.react-flow__node').filter({ hasText: 'Grayscale' }).click();
  await page
    .locator('.react-flow__node')
    .filter({ hasText: 'Gaussian blur' })
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await page.getByRole('button', { name: 'Duplicate selection', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await page.locator('.history-actions').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await page.locator('.react-flow__node').filter({ hasText: 'Grayscale' }).click();
  await page
    .locator('.react-flow__node')
    .filter({ hasText: 'Gaussian blur' })
    .click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Delete selection', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.locator('.history-actions').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
});
test('inspects real pixels, shows a histogram and keeps an explicit B pin stable', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New experiment', exact: true }).click();
  const bytes = await page.evaluate(async () => {
    const c = new OffscreenCanvas(2, 2),
      ctx = c.getContext('2d')!;
    ctx.putImageData(
      new ImageData(
        new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
        2,
        2,
      ),
      0,
      0,
    );
    return Array.from(new Uint8Array(await (await c.convertToBlob()).arrayBuffer()));
  });
  await page
    .locator('#image-input')
    .setInputFiles({ name: 'colors.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  await ready(page);
  await page.getByRole('button', { name: 'Actual size images', exact: true }).click();
  await expect(page.locator('.zoom-controls>span')).toHaveText('100%');
  await page.getByRole('button', { name: 'Inspect output pixels', exact: true }).click();
  const stage = page.getByRole('group', { name: /Preview B:/ });
  await stage.focus();
  await stage.press('ArrowRight');
  await expect(page.locator('.pixel-readout')).toContainText('RGBA 0 / 255 / 0 / 255');
  await page.getByRole('button', { name: 'Toggle output histogram', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Output B pixel intensity histogram' })).toBeVisible();
  expect(await page.locator('.histogram polyline').count()).toBe(4);
  await page.getByLabel('B follows selection').uncheck();
  await page.getByRole('button', { name: /5 Invert/ }).click();
  await expect(page.locator('.frame-b .frame-heading')).toContainText('colors.png');
  await page.getByRole('button', { name: 'Fit images', exact: true }).click();
  await expect(page.locator('.zoom-controls>span')).toHaveText('Fit');
});
test('restores the saved graph viewport exactly', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.locator('.react-flow__controls-zoomin').click();
  await saved(page);
  const transform = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.reload();
  await ready(page);
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', transform!);
});
for (const failure of ['denied', 'quota'] as const)
  test(`keeps a recoverable session and never claims durable saving when storage is ${failure}`, async ({
    page,
  }) => {
    await page.addInitScript((kind) => {
      if (kind === 'denied')
        Object.defineProperty(window, 'indexedDB', {
          get() {
            throw new DOMException('Denied', 'SecurityError');
          },
        });
      else {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === 'projects') throw new DOMException('Full', 'QuotaExceededError');
          return put.apply(this, args as [any, IDBValidKey?]);
        };
      }
    }, failure);
    await page.goto('/');
    await ready(page);
    await expect(page.getByLabel('Storage and app updates')).toBeVisible();
    await expect(page.locator('.save-indicator')).not.toHaveAttribute(
      'title',
      'Saved on this device',
    );
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download backup', exact: true }).click();
    expect((await downloaded).suggestedFilename()).toMatch(/\.roveran\.zip$/);
  });

test('maps pointer inspection through zoom, pan and resize on a high-DPI canvas', async ({
  browser,
}) => {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 1440, height: 900 },
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await ready(page);
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('button', { name: 'New experiment', exact: true }).click();
    const bytes = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(2, 2);
      canvas
        .getContext('2d')!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray([
              255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
            ]),
            2,
            2,
          ),
          0,
          0,
        );
      return Array.from(new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer()));
    });
    await page
      .locator('#image-input')
      .setInputFiles({ name: 'pixels.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
    await ready(page);
    await page.getByRole('button', { name: 'Actual size images', exact: true }).click();
    for (let i = 0; i < 12; i++)
      await page.getByRole('button', { name: 'Zoom in images', exact: true }).click();
    const scale = 1.2 ** 12;
    const stage = page.locator('.frame-b .image-stage');
    let bounds = (await stage.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 31, bounds.y + bounds.height / 2 - 17, {
      steps: 5,
    });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Inspect output pixels', exact: true }).click();
    bounds = (await stage.boundingBox())!;
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 31 + scale / 2,
      bounds.y + bounds.height / 2 - 17 - scale / 2,
    );
    await expect(page.locator('.pixel-readout')).toContainText('RGBA 0 / 255 / 0 / 255');
    await page.setViewportSize({ width: 1280, height: 900 });
    bounds = (await stage.boundingBox())!;
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 31 + scale / 2,
      bounds.y + bounds.height / 2 - 17 - scale / 2,
    );
    await expect(page.locator('.pixel-readout')).toContainText('x 1 · y 0');
    expect(
      await stage
        .locator('canvas')
        .evaluate(
          (canvas) =>
            canvas.width === Math.round(canvas.getBoundingClientRect().width * devicePixelRatio),
        ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
