import { test, expect } from '@playwright/test';
import { makeExample, newNode, connect } from '../../packages/pipeline/src/index';
import { writeFile, mkdir } from 'node:fs/promises';
import { cpus } from 'node:os';
test('worker discards superseded jobs, isolates errors, exports full resolution and bounds memory', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto('/');
  const doc = makeExample();
  doc.sources[0] = { ...doc.sources[0]!, width: 2048, height: 1536 };
  const result = await page.evaluate(async (document) => {
    const worker = new Worker('/engine-worker.js');
    const receive = (type: string, revision?: number) =>
      new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Worker timed out: ${type}`)), 30000);
        const handler = (event: MessageEvent) => {
          if (event.data.type === 'error') {
            clearTimeout(timeout);
            worker.removeEventListener('message', handler);
            reject(new Error(event.data.message));
          }
          if (
            event.data.type === type &&
            (revision === undefined || event.data.revision === revision)
          ) {
            clearTimeout(timeout);
            worker.removeEventListener('message', handler);
            resolve(event.data);
          }
        };
        worker.addEventListener('message', handler);
      });
    try {
      const initialized = receive('ready');
      worker.postMessage({ type: 'init' });
      await initialized;
      const canvas = new OffscreenCanvas(2048, 1536),
        ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, 2048, 1536);
      gradient.addColorStop(0, '#121d42');
      gradient.addColorStop(1, '#dbb774');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 2048, 1536);
      for (let y = 0; y < 1536; y += 64) {
        ctx.fillStyle = y % 128 ? 'white' : 'black';
        ctx.fillRect(500, y, 300, 32);
      }
      const blob = await canvas.convertToBlob();
      worker.postMessage({ type: 'sources', sources: [{ id: document.sources[0]!.id, blob }] });
      const final = receive('result', 40);
      for (let revision = 1; revision <= 40; revision++) {
        document.nodes[3]!.parameters.low = revision;
        worker.postMessage({ type: 'evaluate', revision, document: structuredClone(document) });
      }
      const latest = await final;
      const previewWidth = latest.nodes[0].width;
      for (const frame of latest.frames) frame.bitmap.close();
      const times: number[] = [];
      let stats = latest.stats;
      for (let revision = 41; revision <= 240; revision++) {
        document.nodes[3]!.parameters.low = revision % 150;
        const next = receive('result', revision);
        const start = performance.now();
        worker.postMessage({ type: 'evaluate', revision, document });
        const output = await next;
        times.push(performance.now() - start);
        stats = output.stats;
        for (const frame of output.frames) frame.bitmap.close();
      }
      const exported = receive('exported', 241);
      worker.postMessage({
        type: 'export',
        revision: 241,
        document,
        target: document.nodes[3]!.id,
      });
      const output = await exported;
      const bitmap = await createImageBitmap(output.blob);
      const fullWidth = bitmap.width;
      bitmap.close();
      const pipelineTimes: number[] = [];
      for (let revision = 242; revision < 262; revision++) {
        worker.postMessage({ type: 'sources', sources: [{ id: document.sources[0]!.id, blob }] });
        const next = receive('result', revision);
        const start = performance.now();
        worker.postMessage({ type: 'evaluate', revision, document });
        const output = await next;
        pipelineTimes.push(performance.now() - start);
        for (const frame of output.frames) frame.bitmap.close();
      }
      pipelineTimes.sort((a, b) => a - b);
      times.sort((a, b) => a - b);
      return {
        previewWidth,
        fullWidth,
        cacheBytes: stats.cacheBytes,
        liveMatrices: stats.liveMatrices,
        heapBytes: stats.heapBytes,
        incrementalP95: times[Math.floor(times.length * 0.95)],
        fullPipelineP95: pipelineTimes[Math.floor(pipelineTimes.length * 0.95)],
        samples: times.length,
        fullPipelineSamples: pipelineTimes.length,
      };
    } finally {
      worker.terminate();
    }
  }, doc);
  expect(result.previewWidth).toBe(1024);
  expect(result.fullWidth).toBe(2048);
  expect(result.cacheBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
  expect(result.liveMatrices).toBeLessThan(200);
  // Absolute timings depend on the CPU/browser. Shared CI runners report them;
  // a controlled benchmark can opt into a hardware-specific latency budget.
  const budget = process.env.OPENCV_WEBLAB_PERFORMANCE_BUDGET_MS;
  await mkdir('tests/reports', { recursive: true });
  await writeFile(
    `tests/reports/performance-${info.project.name}.json`,
    JSON.stringify(
      {
        ...result,
        hardware: cpus()[0]?.model,
        browser: info.project.name,
        date: new Date().toISOString(),
        performanceBudgetMs: budget === undefined ? null : Number(budget),
      },
      null,
      2,
    ) + '\n',
  );
  if (budget !== undefined) {
    expect(Number.isFinite(Number(budget)) && Number(budget) > 0).toBe(true);
    expect(result.fullPipelineP95).toBeLessThan(Number(budget));
  }
});
test('a failing color branch does not block an independent edge branch', async ({ page }) => {
  let doc = makeExample();
  const bad = newNode('hue', 450, 250);
  doc.nodes.push(bad);
  doc = connect(doc, doc.nodes[0]!.id, bad.id);
  doc.edges = doc.edges.map((edge) =>
    edge.target === bad.id ? { ...edge, source: doc.nodes[1]!.id } : edge,
  );
  await page.goto('/');
  await page.locator('#json-input').setInputFiles({
    name: 'error-branch.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.locator('.operation-node.has-error')).toHaveCount(1);
  await expect(
    page.locator('.react-flow__node').filter({ hasText: 'Canny edges' }).locator('.node-meta'),
  ).toContainText('512 × 480');
});
