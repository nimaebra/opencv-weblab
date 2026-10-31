import { test, expect, type Page } from '@playwright/test';
import { newNode } from '../../packages/pipeline/src/index';
async function ready(page: Page) {
  await expect(page.locator('.status-dot.ready')).toBeVisible({ timeout: 30000 });
}
async function noise(page: Page) {
  await page.goto('/');
  await ready(page);
  await page.getByLabel('Example pipeline').selectOption('noise');
  await ready(page);
  await expect(page.locator('.frame-b .frame-heading')).toContainText('Gaussian blur');
  await expect(page.locator('.frame-b .frame-caption')).toContainText('192 × 192');
}
test('keeps optional prediction, hints and learner-confirmed progress through rename and reload', async ({
  page,
}) => {
  await noise(page);
  await expect(page.locator('.guided-experiment')).not.toHaveAttribute('open');
  await page.locator('.guided-experiment > summary').click();
  await page.getByLabel('Your prediction').fill('Median should reject the isolated bright dot.');
  await expect(
    page.getByRole('status').filter({ hasText: 'Progress saved on this device' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'I explored this step', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Try activity' })).toBeVisible();
  await page.locator('.guide-hint summary').click();
  await expect(page.locator('.guide-hint')).toContainText('middle value');
  await page.getByRole('button', { name: 'I explored this step', exact: true }).click();
  await page.getByRole('button', { name: 'I explored this step', exact: true }).click();
  await page
    .getByLabel('Your reflection')
    .fill('The median removed the dots; Gaussian spread them into neighboring pixels.');
  await page.getByRole('button', { name: 'I explored this step', exact: true }).click();
  await expect(page.locator('.guide-count')).toHaveText('4/4 explored');
  await expect(page.locator('.guide-footer')).toContainText('Progress saved on this device');
  await page.getByLabel('Project name').fill('My noise study');
  await expect(page.locator('.save-indicator')).toHaveAttribute('title', 'Saved on this device');
  await page.reload();
  await ready(page);
  await expect(page.locator('.guide-count')).toHaveText('4/4 explored');
  await page.locator('.guided-experiment > summary').click();
  await expect(page.getByLabel('Your prediction')).toHaveValue(
    'Median should reject the isolated bright dot.',
  );
  await page.getByRole('button', { name: '4. Reflect' }).click();
  await expect(page.getByLabel('Your reflection')).toHaveValue(/Gaussian spread/);
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
});
test('explains actual grayscale pixels and mirrored borders with keyboard inspection', async ({
  page,
}) => {
  await noise(page);
  await page.getByRole('button', { name: 'Explain a pixel', exact: true }).click();
  const output = page.locator('.frame-b .image-stage');
  await output.focus();
  await output.press('ArrowRight');
  await expect(page.locator('.kernel-grid button')).toHaveCount(9);
  await expect(page.locator('.kernel-grid button.reflected').first()).toBeVisible();
  await expect(page.locator('.calculation-result')).toContainText('OpenCV 8-bit output');
  await expect(page.locator('.pixel-explanation')).toContainText('BORDER_REFLECT_101');
  await page.getByRole('button', { name: 'Show this input in A', exact: true }).click();
  await expect(page.locator('.frame-a .frame-heading')).toContainText('Grayscale');
  await output.focus();
  await output.press('ArrowDown');
  await expect(page.locator('.calculation-result')).toContainText('output (1, 1)');
  await output.press('ArrowRight');
  await output.press('ArrowRight');
  await output.press('ArrowDown');
  await expect(page.locator('.calculation-result')).toContainText('output (3, 2)');
  await page.locator('.react-flow__node').filter({ hasText: 'Gaussian blur' }).click();
  await page.getByRole('spinbutton', { name: 'Kernel size value', exact: true }).fill('15');
  await ready(page);
  await expect(page.locator('.pixel-explanation')).toContainText('7 or smaller');
  await page.locator('.react-flow__node').filter({ hasText: 'Median blur' }).click();
  await ready(page);
  await expect(page.locator('.pixel-explanation')).toContainText(
    'Box blur, Gaussian blur and Sharpen',
  );
});
test('compares three real outputs, validates values and applies one undoable parameter edit', async ({
  page,
}) => {
  await noise(page);
  await page.locator('.react-flow__node').filter({ hasText: 'Gaussian blur' }).click();
  await page.getByRole('button', { name: 'Compare three values', exact: true }).click();
  await page.getByRole('button', { name: 'Generate comparisons', exact: true }).click();
  await expect(page.locator('.comparison-results canvas')).toHaveCount(3);
  await expect(page.locator('.comparison-results')).toContainText('192 × 192 preview px');
  await page.getByRole('button', { name: 'Apply 7', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Kernel size value', exact: true }),
  ).toHaveValue('7');
  await ready(page);
  await page.locator('.history-actions').getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('.react-flow__node').filter({ hasText: 'Gaussian blur' }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Kernel size value', exact: true }),
  ).toHaveValue('3');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await page.getByLabel('Comparison value 1').fill('4');
  await expect(
    page.getByRole('button', { name: 'Generate comparisons', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Comparison value 1').fill('5');
  await ready(page);
  await page.getByRole('button', { name: 'Generate comparisons', exact: true }).click();
  await page.getByRole('button', { name: 'Close parameter comparison', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Parameter comparison' })).toHaveCount(0);
  await ready(page);
});
test('worker cancels superseded comparisons, caps preview size and recovers from invalid settings', async ({
  page,
}) => {
  await page.goto('/');
  const results = await page.evaluate(async (node) => {
    const worker = new Worker('/engine-worker.js');
    const messages: any[] = [];
    const wait = (predicate: (data: any) => boolean) =>
      new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('worker timeout')), 20000);
        const listener = (event: MessageEvent) => {
          if (predicate(event.data)) {
            clearTimeout(timer);
            worker.removeEventListener('message', listener);
            resolve(event.data);
          }
        };
        worker.addEventListener('message', listener);
      });
    worker.addEventListener('message', (event) => messages.push(event.data));
    try {
      const ready = wait((d) => d.type === 'ready');
      worker.postMessage({ type: 'init' });
      await ready;
      const canvas = new OffscreenCanvas(2048, 512);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#777';
      ctx.fillRect(0, 0, 2048, 512);
      const send = (requestId: number, values: number[]) => {
        const bitmap = canvas.transferToImageBitmap();
        worker.postMessage(
          {
            type: 'compare',
            revision: 0,
            requestId,
            node,
            parameter: 'kernel',
            values,
            scale: 0.5,
            mode: 'gray',
            bitmap,
          },
          [bitmap],
        );
      };
      send(1, [3, 7, 15]);
      worker.postMessage({ type: 'cancel-study' });
      const invalid = wait((d) => d.type === 'study-error' && d.requestId === 2);
      send(2, [2, 7, 15]);
      await invalid;
      const valid = wait((d) => d.type === 'comparison' && d.requestId === 3);
      send(3, [3, 7, 15]);
      const output = await valid;
      const result = {
        superseded: messages.some((m) => m.type === 'comparison' && m.requestId === 1),
        variants: output.variants,
        images: output.frames.map((f: any) => [f.bitmap.width, f.bitmap.height]),
      };
      for (const message of messages) for (const f of message.frames ?? []) f.bitmap.close();
      return result;
    } finally {
      worker.terminate();
    }
  }, newNode('gaussian'));
  expect(results.superseded).toBe(false);
  expect(results.images).toEqual([
    [1024, 256],
    [1024, 256],
    [1024, 256],
  ]);
  expect(results.variants.every((v: any) => v.scale === 0.25)).toBe(true);
});
test('reveals comparisons from the Inspector trigger and moves keyboard focus on desktop and mobile', async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await noise(page);
    await page.getByRole('button', { name: 'Explain a pixel', exact: true }).click();
    await page.locator('.frame-b .image-stage').focus();
    await page.locator('.frame-b .image-stage').press('ArrowRight');
    await expect(page.locator('.kernel-grid button')).toHaveCount(9);
    await page.locator('.react-flow__node').filter({ hasText: 'Gaussian blur' }).click();
    if (width === 390) await page.getByRole('button', { name: 'Inspector', exact: true }).click();
    const button = page.getByRole('button', { name: 'Compare three values', exact: true });
    await button.focus();
    await button.press('Enter');
    const heading = page.getByRole('heading', { name: 'Compare Gaussian blur', exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    if (width === 390)
      await expect(page.getByRole('button', { name: 'Workspace', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    await expect(
      page.getByRole('button', { name: 'Generate comparisons', exact: true }),
    ).toBeInViewport();
    await page.getByRole('button', { name: 'Close parameter comparison', exact: true }).click();
  }
});
