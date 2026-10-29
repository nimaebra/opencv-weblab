import { beforeAll, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { waitForOpenCv } from '../packages/engine/src/loader';
import { execute } from '../packages/engine/src/operations';
import {
  explainPixel,
  explanationRegion,
  explanationKernel,
  reflect101,
} from '../packages/engine/src/learning';
import {
  newNode,
  operations,
  comparisonValues,
  parameterSchema,
} from '../packages/pipeline/src/index';
let cv: any;
beforeAll(async () => {
  ({ cv } = await waitForOpenCv(
    createRequire(import.meta.url)('../apps/web/public/runtime/opencv.js'),
  ));
});
it('mirrors borders without repeating edge pixels, including tiny images', () => {
  expect(Array.from({ length: 8 }, (_, i) => reflect101(i - 2, 3))).toEqual([
    2, 1, 0, 1, 2, 1, 0, 1,
  ]);
  expect(reflect101(-99, 1)).toBe(0);
});
for (const operation of ['box', 'gaussian', 'sharpen']) {
  it(`${operation} explains actual WASM pixels at borders and inside the image`, () => {
    for (const [width, height] of [
      [1, 1],
      [2, 3],
      [9, 7],
    ]) {
      for (const scale of [1, 0.5]) {
        const source = cv.matFromArray(
          height,
          width,
          cv.CV_8UC1,
          Array.from({ length: width * height }, (_, i) => (i * 137 + 23) % 256),
        );
        for (const setting of [0, 1, 2]) {
          const node = newNode(operation);
          if (operation === 'sharpen') node.parameters.strength = setting * 1.5;
          else {
            node.parameters.kernel = [3, 5, 7][setting]!;
            if (operation === 'gaussian') node.parameters.sigma = setting * 0.7;
          }
          const output = execute(cv, node, [source], scale);
          try {
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) {
                const region = explanationRegion(node, scale, x, y, width, height);
                const data = new Uint8ClampedArray(region.width * region.height * 4);
                for (let py = 0; py < region.height; py++)
                  for (let px = 0; px < region.width; px++) {
                    const offset = (py * region.width + px) * 4;
                    data.fill(
                      source.data[(py + region.top) * width + px + region.left],
                      offset,
                      offset + 3,
                    );
                    data[offset + 3] = 255;
                  }
                const result = explainPixel(
                  cv,
                  node,
                  scale,
                  x,
                  y,
                  { width, height },
                  { data, width: region.width, left: region.left, top: region.top },
                  output.data[y * width + x],
                );
                expect(
                  Math.abs(Math.max(0, Math.min(255, result.sum)) - result.output),
                ).toBeLessThanOrEqual(0.50001);
                expect(result.cells).toHaveLength(result.kernel ** 2);
                expect(
                  result.cells.every((c) => Number.isFinite(c.value) && Number.isFinite(c.weight)),
                ).toBe(true);
                if (width > 1 && x === 0 && result.kernel > 1)
                  expect(result.cells.some((c) => c.reflected)).toBe(true);
              }
          } finally {
            output.delete();
          }
        }
        source.delete();
      }
    }
  });
}
it('does not pretend nonlinear or bypassed operations are weighted kernels', () => {
  expect(() => explanationKernel(newNode('median'), 1)).toThrow(/available/);
  const node = newNode('box');
  node.enabled = false;
  expect(() => explanationKernel(node, 1)).toThrow(/Enable/);
  node.enabled = true;
  node.parameters.kernel = 15;
  expect(() => explanationKernel(node, 1)).toThrow(/7 or smaller/);
});
it('suggests valid comparison settings without mutating operation parameters', () => {
  for (const operation of operations.filter((o) => o.inputs === 1 && o.id !== 'resize')) {
    const node = newNode(operation.id),
      before = JSON.stringify(node);
    for (const parameter of operation.parameters.filter((p) => !p.options)) {
      const values = comparisonValues(node, parameter.key);
      expect(values, `${operation.id}.${parameter.key}`).toHaveLength(3);
      expect(new Set(values).size).toBe(3);
      for (const value of values)
        expect(
          parameterSchema(node.operation).safeParse({ ...node.parameters, [parameter.key]: value })
            .success,
        ).toBe(true);
    }
    expect(JSON.stringify(node)).toBe(before);
  }
  expect(comparisonValues(newNode('gaussian'), 'kernel')).toEqual([3, 7, 15]);
});
