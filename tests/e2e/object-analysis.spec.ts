import { test, expect, type Page } from '@playwright/test';
import { makeExample, newNode } from '../../packages/pipeline/src/index';
import { readFile } from 'node:fs/promises';
async function example(page: Page, kind: string) {
  await page.goto('/');
  await expect(page.locator('.status-dot.ready')).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Example pipeline').selectOption(kind);
  await expect(page.locator('.status-dot.ready')).toBeVisible();
}
test('measures components at full resolution, exports CSV, and restores the experiment', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await example(page, 'counting');
  await expect(page.locator('.frame-b .frame-heading')).toContainText('Connected components');
  await page.locator('.measurements-panel > summary').click();
  await expect(page.locator('.measurement-table caption')).toContainText('2 objects');
  const row = page.getByRole('button', { name: 'Select object 1', exact: true });
  await row.focus();
  await expect(row).toBeFocused();
  await page.getByRole('button', { name: 'Measure full resolution / CSV', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Full-resolution measurements' });
  await expect(dialog.locator('caption')).toContainText('2 objects · full-resolution');
  await page.screenshot({ path: '.impeccable/review/object-analysis-desktop.png' });
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download full-resolution CSV' }).click();
  const file = await (await pending).path();
  const csv = await readFile(file!, 'utf8');
  expect(csv).toContain('pixel_area');
  expect(csv.trim().split('\n')).toHaveLength(3);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('.react-flow__node').filter({ hasText: 'Connected components' }).click();
  await page.getByLabel('Connectivity', { exact: true }).selectOption('4');
  await expect(page.locator('.measurements-panel > summary')).toContainText('3 objects');
  await expect(page.locator('.save-indicator')).toHaveAttribute('title', 'Saved on this device');
  await page.reload();
  await expect(page.locator('.measurements-panel > summary')).toContainText('3 objects');
});
test('shows contour measurements, supports narrow layouts and repeated full calculations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await example(page, 'shape-area');
  await page.locator('.measurements-panel > summary').click();
  await expect(page.locator('.measurement-table tbody tr').first()).toContainText('36');
  await expect(page.locator('.measurement-table tbody tr').first()).toContainText('24');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Measure full resolution / CSV', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Full-resolution measurements' });
    await expect(dialog.locator('caption')).toContainText('2 external contours · full-resolution');
    await dialog.getByRole('button', { name: 'Select contour 1', exact: true }).focus();
    if (i === 0) await page.screenshot({ path: '.impeccable/review/object-analysis-mobile.png' });
    await dialog.getByRole('group', { name: /Full-resolution measurement image/ }).focus();
    await page.keyboard.press('ArrowRight');
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('worker keeps cached metadata, rejects stale full results, cancels, and isolates target dependencies', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(
    async (document) => {
      const worker = new Worker('/engine-worker.js');
      const messages: any[] = [];
      worker.addEventListener('message', (event) => {
        messages.push(event.data);
        for (const frame of event.data.frames ?? []) frame.bitmap.close();
      });
      const wait = (type: string, requestId?: number) =>
        new Promise<any>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Timed out: ${type}`)), 15000);
          const listener = (event: MessageEvent) => {
            if (
              event.data.type === type &&
              (requestId === undefined || event.data.requestId === requestId)
            ) {
              clearTimeout(timer);
              worker.removeEventListener('message', listener);
              resolve(event.data);
            }
          };
          worker.addEventListener('message', listener);
        });
      try {
        let received = wait('ready');
        worker.postMessage({ type: 'init' });
        await received;
        const canvas = new OffscreenCanvas(2048, 512),
          ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 2048, 512);
        ctx.fillStyle = 'white';
        ctx.fillRect(20, 20, 7, 7);
        ctx.fillRect(100, 100, 8, 8);
        worker.postMessage({
          type: 'sources',
          sources: [{ id: document.sources[0]!.id, blob: await canvas.convertToBlob() }],
        });
        received = wait('result');
        worker.postMessage({ type: 'evaluate', revision: 10, document });
        const first = await received;
        received = wait('result');
        worker.postMessage({ type: 'evaluate', revision: 11, document });
        const cached = await received;
        const nodeId = document.preview.b!;
        worker.postMessage({ type: 'measure', revision: 10, requestId: 1, nodeId, document });
        worker.postMessage({ type: 'measure', revision: 11, requestId: 2, nodeId, document });
        worker.postMessage({ type: 'cancel-measure' });
        received = wait('measured', 3);
        worker.postMessage({ type: 'measure', revision: 11, requestId: 3, nodeId, document });
        const full = await received;
        const rows = full.measurements.rows;
        full.bitmap.close();
        received = wait('result');
        worker.postMessage({ type: 'evaluate', revision: 12, document });
        const after = await received;
        return {
          first: first.nodes.find((n: any) => n.nodeId === nodeId),
          cached: cached.nodes.find((n: any) => n.nodeId === nodeId),
          rows,
          fullWidth: full.measurements.width,
          previewWidth: first.nodes[0].width,
          cacheBefore: cached.stats.cacheBytes,
          cacheAfter: after.stats.cacheBytes,
          stale: messages.some((m) => m.type === 'measured' && m.requestId < 3),
        };
      } finally {
        worker.terminate();
      }
    },
    (() => {
      const doc = makeExample('counting');
      doc.nodes.push(newNode('threshold')); // An incomplete unrelated branch must not block target measurements.
      doc.sources[0]!.width = 2048;
      doc.sources[0]!.height = 512;
      return doc;
    })(),
  );
  expect(result.cached.cached).toBe(true);
  expect(result.cached.measurements).toEqual(result.first.measurements);
  expect(result.rows.map((r: any) => r.pixelArea)).toEqual([49, 64]);
  expect(result.fullWidth).toBe(2048);
  expect(result.previewWidth).toBe(1024);
  expect(result.cacheAfter).toBe(result.cacheBefore);
  expect(result.stale).toBe(false);
});
test('paginates objects and keeps bounds aligned through zoom, pan and resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await example(page, 'counting');
  await page.locator('.measurements-panel > summary').click();
  await page.getByRole('button', { name: 'Select object 1', exact: true }).focus();
  const output = page.locator('.frame-b .image-stage');
  await output.focus();
  await output.press('1');
  async function yellowAtBounds(pan: number) {
    return page.locator('.frame-b canvas').evaluate((canvas: HTMLCanvasElement, shift) => {
      const rect = canvas.getBoundingClientRect(),
        dpr = canvas.width / rect.width;
      const x = Math.round(((rect.width - 192) / 2 + 25 + shift) * dpr);
      const y = Math.round(((rect.height - 192) / 2 + 45) * dpr);
      const pixels = canvas.getContext('2d')!.getImageData(x - 2, y - 2, 5, 5).data;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i]! > 220 && pixels[i + 1]! > 180 && pixels[i + 2]! < 170) return true;
      return false;
    }, pan);
  }
  await expect.poll(() => yellowAtBounds(0)).toBe(true);
  await output.press('ArrowRight');
  await expect.poll(() => yellowAtBounds(-30)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 960 });
  await expect.poll(() => yellowAtBounds(-30)).toBe(true);
  await page.getByLabel('Example pipeline').selectOption('isolate-objects');
  await expect(page.locator('.frame-b .frame-heading')).toContainText('Apply mask');
  await page.locator('.react-flow__node').filter({ hasText: 'Global threshold' }).click();
  await page.getByRole('button', { name: '1 Connected components', exact: true }).click();
  await page.locator('.measurements-panel > summary').click();
  await expect(page.locator('.measurements-panel tbody tr')).toHaveCount(50);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.measurement-pagination')).toContainText('Page 2 of 2');
  await expect(page.locator('.measurements-panel tbody tr')).toHaveCount(5);
});
