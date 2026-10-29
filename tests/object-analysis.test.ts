import { beforeAll, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { waitForOpenCv } from '../packages/engine/src/loader';
import { executeResult } from '../packages/engine/src/operations';
import { analysisBudget, measurementsCsv } from '../packages/engine/src/measurements';
import {
  connect,
  emptyDocument,
  generateNodePython,
  generatePython,
  newNode,
  parameterSchema,
  validateGraph,
} from '../packages/pipeline/src/index';
let cv: any;
beforeAll(async () => {
  ({ cv } = await waitForOpenCv(
    createRequire(import.meta.url)('../apps/web/public/runtime/opencv.js'),
  ));
});
function mask(size = 24) {
  return cv.Mat.zeros(size, size, cv.CV_8UC1);
}
function rect(src: any, x: number, y: number, width: number, height: number, value = 255) {
  for (let j = y; j < y + height; j++)
    for (let i = x; i < x + width; i++) src.data[j * src.cols + i] = value;
}
it('distinguishes component pixel area from contour geometry, with spatial IDs', () => {
  const src = mask();
  rect(src, 2, 2, 7, 7);
  rect(src, 12, 12, 8, 8, 1);
  const components = executeResult(cv, newNode('components'), [src]);
  const contours = executeResult(cv, newNode('contours'), [src]);
  try {
    expect(components.measurements?.rows).toEqual([
      {
        id: 1,
        pixelArea: 49,
        bounds: { x: 2, y: 2, width: 7, height: 7 },
        centroid: { x: 5, y: 5 },
      },
      {
        id: 2,
        pixelArea: 64,
        bounds: { x: 12, y: 12, width: 8, height: 8 },
        centroid: { x: 15.5, y: 15.5 },
      },
    ]);
    expect(contours.measurements?.rows[0]).toMatchObject({
      id: 1,
      contourArea: 36,
      perimeter: 24,
      centroid: { x: 5, y: 5 },
    });
    expect([...components.mat.data.slice((2 * 24 + 2) * 4, (2 * 24 + 2) * 4 + 4)]).toEqual([
      137, 215, 71, 255,
    ]);
    expect(measurementsCsv(components.measurements!)).toContain('1,49,5,5,2,2,7,7,24,24');
  } finally {
    src.delete();
    components.mat.delete();
    contours.mat.delete();
  }
});
it('treats diagonal contacts according to connectivity', () => {
  const src = mask();
  rect(src, 1, 1, 2, 2);
  rect(src, 3, 3, 2, 2);
  try {
    for (const [connectivity, count] of [
      ['4', 2],
      ['8', 1],
    ] as const) {
      const node = newNode('components');
      node.parameters.connectivity = connectivity;
      const result = executeResult(cv, node, [src]);
      try {
        expect(result.measurements?.rows).toHaveLength(count);
      } finally {
        result.mat.delete();
      }
    }
  } finally {
    src.delete();
  }
});
it('retrieves only outer contours and keeps degenerate centroids unavailable', () => {
  const src = mask();
  rect(src, 2, 2, 7, 7);
  rect(src, 3, 3, 5, 5, 0);
  rect(src, 15, 15, 1, 1);
  const result = executeResult(cv, newNode('contours'), [src]);
  try {
    expect(result.measurements?.rows).toHaveLength(2);
    expect(result.measurements?.rows[0]).toMatchObject({ contourArea: 36 });
    expect(result.measurements?.rows[1]).toMatchObject({
      contourArea: 0,
      perimeter: 0,
      centroid: null,
    });
    expect(measurementsCsv(result.measurements!)).toContain('2,0,0,,,15,15,1,1,24,24');
  } finally {
    src.delete();
    result.mat.delete();
  }
});
it('handles an empty mask for both measurement tools', () => {
  const src = mask();
  try {
    for (const id of ['components', 'contours']) {
      const result = executeResult(cv, newNode(id), [src]);
      try {
        expect(result.measurements?.rows).toEqual([]);
        expect(measurementsCsv(result.measurements!).trim().split('\n')).toHaveLength(1);
      } finally {
        result.mat.delete();
      }
    }
  } finally {
    src.delete();
  }
});
it('filters inclusive pixel areas and scales thresholds with preview area', () => {
  const src = mask();
  rect(src, 2, 2, 2, 2);
  rect(src, 12, 12, 3, 3);
  const node = newNode('filter-objects');
  node.parameters.minArea = 16;
  node.parameters.maxArea = 36;
  const result = executeResult(cv, node, [src], 0.5);
  try {
    expect([...result.mat.data].filter((n) => n === 255)).toHaveLength(13);
    expect(result.measurements).toBeUndefined();
  } finally {
    result.mat.delete();
  }
  node.parameters.minArea = 5;
  node.parameters.maxArea = 9;
  const exact = executeResult(cv, node, [src]);
  try {
    expect([...exact.mat.data].filter((n) => n === 255)).toHaveLength(9);
  } finally {
    exact.mat.delete();
    src.delete();
  }
  expect(
    parameterSchema('filter-objects').safeParse({ ...node.parameters, minArea: 10 }).success,
  ).toBe(false);
});
it('copies selected gray and RGBA pixels with nonzero masks and clears alpha outside', () => {
  const selection = cv.matFromArray(1, 3, cv.CV_8UC1, [0, 1, 255]);
  for (const channels of [1, 4]) {
    const pixels =
      channels === 1 ? [11, 22, 33] : [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const src = cv.matFromArray(1, 3, channels === 1 ? cv.CV_8UC1 : cv.CV_8UC4, pixels);
    const result = executeResult(cv, newNode('apply-mask'), [src, selection]);
    try {
      expect([...result.mat.data]).toEqual([...Array(channels).fill(0), ...pixels.slice(channels)]);
    } finally {
      src.delete();
      result.mat.delete();
    }
  }
  selection.delete();
});
it('bypasses analysis without leaking derived rows and rejects wrong mask modes', () => {
  const src = mask(),
    color = cv.Mat.zeros(24, 24, cv.CV_8UC4);
  try {
    const node = newNode('components');
    node.enabled = false;
    const result = executeResult(cv, node, [src]);
    try {
      expect(result.measurements).toBeUndefined();
      expect(result.mat.channels()).toBe(1);
    } finally {
      result.mat.delete();
    }
    expect(() => executeResult(cv, newNode('apply-mask'), [src, color])).toThrow(/Mask/);
    expect(() => executeResult(cv, newNode('blend'), [src, color])).toThrow(/identical/);
  } finally {
    src.delete();
    color.delete();
  }
});
it('bounds objects and scratch allocations before returning a partial result', () => {
  const src = mask(202);
  for (let y = 0; y < 202; y += 2) for (let x = 0; x < 202; x += 2) src.data[y * 202 + x] = 255;
  try {
    expect(() => executeResult(cv, newNode('components'), [src])).toThrow(/10,000/);
    expect(() => executeResult(cv, newNode('contours'), [src])).toThrow(/10,000/);
  } finally {
    src.delete();
  }
  expect(() => analysisBudget(16777216, 256 * 1024 * 1024)).toThrow(/memory/);
});
it('validates heterogeneous ports and emits complete Python snippets with CSV output', () => {
  let doc = emptyDocument();
  doc.sources = [{ id: 'image', name: 'test.png', mime: 'image/png', width: 24, height: 24 }];
  const source = { ...newNode('source'), sourceId: 'image' },
    gray = newNode('grayscale'),
    apply = newNode('apply-mask'),
    components = newNode('components');
  doc.nodes = [source, gray, apply, components];
  doc = connect(doc, source.id, gray.id);
  doc = connect(doc, source.id, apply.id);
  doc = connect(doc, gray.id, apply.id, 1);
  doc = connect(doc, gray.id, components.id);
  expect(validateGraph(doc)).toEqual([]);
  expect(() => connect(doc, source.id, apply.id, 1)).toThrow(/Mask/);
  expect(generatePython(doc)).toContain('save_measurements("measurements_3.csv"');
  expect(generateNodePython(doc, components.id)).toContain('image_3, objects_3 = component_image');
  expect(generateNodePython(doc, components.id)).toContain('save_measurements(');
});
