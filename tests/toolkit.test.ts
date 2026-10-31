import { beforeAll, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { waitForOpenCv } from '../packages/engine/src/loader';
import { execute, executeResult } from '../packages/engine/src/operations';
import { compareVariants } from '../packages/engine/src/comparison';
import {
  connect,
  cropBounds,
  defaults,
  inferDimensions,
  inferModes,
  makeExample,
  newNode,
  parameterSchema,
  parseDocument,
  validPerspective,
} from '../packages/pipeline/src/index';
let cv: any;
beforeAll(async () => {
  ({ cv } = await waitForOpenCv(
    createRequire(import.meta.url)('../apps/web/public/runtime/opencv.js'),
  ));
});
const tools = [
  'clahe',
  'crop',
  'perspective',
  'hough-lines',
  'hough-circles',
  'top-hat',
  'black-hat',
  'shi-tomasi',
  'distance-transform',
  'color-map',
];
it.each([
  'clahe',
  'hough-lines',
  'hough-circles',
  'top-hat',
  'black-hat',
  'shi-tomasi',
  'distance-transform',
  'color-map',
])('%s rejects a color input with a recoverable conversion message', (id) => {
  const source = new cv.Mat(2, 2, cv.CV_8UC4, new cv.Scalar(100, 100, 100, 255));
  try {
    expect(() => execute(cv, newNode(id), [source])).toThrow(/Insert a Grayscale/);
  } finally {
    source.delete();
  }
});
it.each(['resize', 'crop', 'perspective'])(
  '%s is rejected by the worker comparison guard',
  async (id) => {
    await expect(
      compareVariants(
        cv,
        {
          type: 'compare',
          revision: 1,
          requestId: 1,
          node: newNode(id),
          parameter: 'width',
          values: [10, 20, 30],
          scale: 1,
          mode: 'gray',
          bitmap: {} as ImageBitmap,
        },
        () => false,
      ),
    ).rejects.toThrow(/keeps image dimensions/);
  },
);
function gray() {
  const src = new cv.Mat(192, 192, cv.CV_8UC1, new cv.Scalar(0));
  cv.rectangle(src, new cv.Point(10, 10), new cv.Point(60, 60), new cv.Scalar(220), -1);
  cv.circle(src, new cv.Point(125, 110), 30, new cv.Scalar(240), 2, cv.LINE_8);
  return src;
}
it.each(tools)('%s respects the grayscale contract and does not change its input', (id) => {
  const src = gray(),
    original = [...src.data],
    node = newNode(id);
  const output = execute(cv, node, [src]);
  try {
    expect(output.depth()).toBe(cv.CV_8U);
    expect(output.channels()).toBe(
      ['hough-lines', 'hough-circles', 'shi-tomasi', 'color-map'].includes(id) ? 4 : 1,
    );
    expect([...src.data]).toEqual(original);
    if (output.channels() === 4)
      expect([...output.data].filter((_, i) => i % 4 === 3).every((a) => a === 255)).toBe(true);
  } finally {
    output.delete();
    src.delete();
  }
});
it('crops with floor/ceil bounds, preserves alpha, and returns independent storage', () => {
  const src = cv.matFromArray(
      2,
      3,
      cv.CV_8UC4,
      Array.from({ length: 24 }, (_, i) => i * 10),
    ),
    node = newNode('crop');
  node.parameters = { left: 34, top: 0, right: 67, bottom: 50 };
  const output = execute(cv, node, [src]);
  try {
    expect(cropBounds(node.parameters, 3, 2)).toEqual({ x: 1, y: 0, width: 2, height: 1 });
    expect([...output.data]).toEqual([...src.data].slice(4, 12));
    output.data[0] = 0;
    expect(src.data[4]).toBe(40);
    node.parameters = { left: 99.9, top: 99.9, right: 100, bottom: 100 };
    const last = execute(cv, node, [src]);
    try {
      expect([...last.data]).toEqual([...src.data].slice(-4));
    } finally {
      last.delete();
    }
  } finally {
    output.delete();
    src.delete();
  }
});
it('rectifies an identity RGBA transform without changing alpha, including preview dimensions', () => {
  const src = cv.matFromArray(
      3,
      4,
      cv.CV_8UC4,
      Array.from({ length: 48 }, (_, i) => i * 5),
    ),
    node = newNode('perspective');
  node.parameters.width = 4;
  node.parameters.height = 3;
  node.parameters.interpolation = 'nearest';
  const output = execute(cv, node, [src]);
  const preview = execute(cv, node, [src], 0.5);
  try {
    expect([...output.data]).toEqual([...src.data]);
    expect([preview.cols, preview.rows]).toEqual([2, 2]);
  } finally {
    src.delete();
    output.delete();
    preview.delete();
  }
});
it('rejects crossed, reversed, repeated or collinear corners, and invalid crops/radii', () => {
  const p = defaults('perspective');
  expect(validPerspective(p)).toBe(true);
  for (const patch of [
    { trX: 0, trY: 100, blX: 100, blY: 0 },
    { trX: 0 },
    { brY: 0 },
    { tlX: 100, trX: 0, brX: 0, blX: 100 },
  ])
    expect(parameterSchema('perspective').safeParse({ ...p, ...patch }).success).toBe(false);
  expect(parameterSchema('crop').safeParse({ ...defaults('crop'), left: 100 }).success).toBe(false);
  expect(
    parameterSchema('crop').safeParse({ ...defaults('crop'), top: 90, bottom: 80 }).success,
  ).toBe(false);
  expect(
    parameterSchema('hough-circles').safeParse({
      ...defaults('hough-circles'),
      minRadius: 10,
      maxRadius: 5,
    }).success,
  ).toBe(false);
  const tiny = new cv.Mat(1, 1, cv.CV_8UC1, new cv.Scalar(0));
  try {
    expect(() => execute(cv, newNode('perspective'), [tiny])).toThrow(/2×2/);
  } finally {
    tiny.delete();
  }
});
it('propagates geometry dimensions and modes into merges, bypasses and portable graphs', () => {
  let doc = makeExample('rectify');
  const crop = doc.nodes.find((n) => n.operation === 'crop')!,
    perspective = doc.nodes.find((n) => n.operation === 'perspective')!;
  expect(inferDimensions(doc).get(crop.id)).toEqual({ width: 162, height: 160 });
  expect(inferDimensions(doc).get(perspective.id)).toEqual({ width: 160, height: 160 });
  expect(inferModes(doc).get(crop.id)).toBe('rgba');
  const blend = newNode('blend');
  doc.nodes.push(blend);
  doc = connect(doc, crop.id, blend.id);
  expect(() => connect(doc, perspective.id, blend.id, 1)).toThrow(/identical/);
  expect(parseDocument(JSON.parse(JSON.stringify(doc))).schemaVersion).toBe(1);
  crop.enabled = false;
  perspective.enabled = false;
  expect(inferDimensions(doc).get(crop.id)).toEqual({ width: 192, height: 192 });
  expect(inferDimensions(doc).get(perspective.id)).toEqual({ width: 192, height: 192 });
});
it.each(['hough-lines', 'hough-circles', 'shi-tomasi'])(
  '%s produces real green detections and handles an empty image',
  (id) => {
    const src = gray(),
      node = newNode(id);
    if (id === 'hough-circles') node.parameters.accumulator = 20;
    const output = execute(cv, node, [src]);
    const blank = new cv.Mat(32, 32, cv.CV_8UC1, new cv.Scalar(0));
    const empty = execute(cv, node, [blank]);
    try {
      expect(
        Array.from(
          { length: src.rows * src.cols },
          (_, i) =>
            output.data[i * 4] === 0 &&
            output.data[i * 4 + 1] === 255 &&
            output.data[i * 4 + 2] === 0,
        ).some(Boolean),
      ).toBe(true);
      for (let i = 0; i < empty.data.length; i += 4)
        expect([...empty.data.slice(i, i + 4)]).toEqual([0, 0, 0, 255]);
    } finally {
      src.delete();
      output.delete();
      blank.delete();
      empty.delete();
    }
  },
);
it('shows bright and dark detail separately and scales morphological kernels', () => {
  const src = new cv.Mat(21, 21, cv.CV_8UC1, new cv.Scalar(100));
  src.ucharPtr(5, 5)[0] = 220;
  src.ucharPtr(15, 15)[0] = 20;
  for (const [id, index, value] of [
    ['top-hat', 5 * 21 + 5, 120],
    ['black-hat', 15 * 21 + 15, 80],
  ] as const) {
    const node = newNode(id);
    const output = execute(cv, node, [src]);
    try {
      expect(output.data[index]).toBe(value);
      expect(output.data[10 * 21 + 10]).toBe(0);
    } finally {
      output.delete();
    }
    node.parameters.kernel = 5;
    const scaled = execute(cv, node, [src], 0.5);
    node.parameters.kernel = 3;
    const unscaled = execute(cv, node, [src]);
    try {
      expect([...scaled.data]).toEqual([...unscaled.data]);
    } finally {
      scaled.delete();
      unscaled.delete();
    }
  }
  src.delete();
});
it('normalizes distances, keeps the background zero and handles constant masks explicitly', () => {
  const src = new cv.Mat(7, 7, cv.CV_8UC1, new cv.Scalar(0));
  cv.rectangle(src, new cv.Point(1, 1), new cv.Point(5, 5), new cv.Scalar(255), -1);
  for (const metric of ['euclidean', 'manhattan', 'chessboard']) {
    const node = newNode('distance-transform');
    node.parameters.metric = metric;
    const output = execute(cv, node, [src]);
    try {
      expect(output.data[0]).toBe(0);
      expect(output.data[24]).toBe(255);
      expect(output.data[8]).toBeLessThan(output.data[24]);
    } finally {
      output.delete();
    }
  }
  src.setTo(new cv.Scalar(255));
  expect(() => execute(cv, newNode('distance-transform'), [src])).toThrow(/zero background/);
  src.setTo(new cv.Scalar(0));
  const output = execute(cv, newNode('distance-transform'), [src]);
  try {
    expect([...output.data].every((x) => x === 0)).toBe(true);
  } finally {
    src.delete();
    output.delete();
  }
});
it('keeps CLAHE tile counts independent of preview scale and maps every palette from BGR to RGBA', () => {
  const src = gray(),
    node = newNode('clahe');
  const full = execute(cv, node, [src]),
    preview = execute(cv, node, [src], 0.5);
  try {
    expect([...full.data]).toEqual([...preview.data]);
  } finally {
    full.delete();
    preview.delete();
  }
  for (const palette of ['viridis', 'cividis', 'turbo']) {
    const node = newNode('color-map');
    node.parameters.palette = palette;
    const result = execute(cv, node, [src]),
      bgr = new cv.Mat();
    cv.applyColorMap(src, bgr, cv[`COLORMAP_${palette.toUpperCase()}`]);
    try {
      expect([...result.data.slice(0, 4)]).toEqual([bgr.data[2], bgr.data[1], bgr.data[0], 255]);
    } finally {
      result.delete();
      bgr.delete();
    }
  }
  src.delete();
});
it.each(tools)('%s rejects insufficient scratch memory before allocating', (id) => {
  const src = gray();
  try {
    expect(() => executeResult(cv, newNode(id), [src], 1, 1)).toThrow(/working memory/);
  } finally {
    src.delete();
  }
});
it('scales spatial detection controls but leaves intensity controls unchanged', () => {
  const src = gray(),
    lines = vi.spyOn(cv, 'HoughLinesP'),
    circles = vi.spyOn(cv, 'HoughCircles'),
    corners = vi.spyOn(cv, 'goodFeaturesToTrack');
  try {
    for (const id of ['hough-lines', 'hough-circles', 'shi-tomasi'])
      execute(cv, newNode(id), [src], 0.5).delete();
    expect(lines.mock.calls[0]!.slice(4)).toEqual([25, 25, 5]);
    expect(circles.mock.calls[0]!.slice(3)).toEqual([1, 10, 100, 30, 0, 0]);
    expect(corners.mock.calls[0]!.slice(2)).toEqual([100, 0.01, 5]);
  } finally {
    vi.restoreAllMocks();
    src.delete();
  }
});
it('includes CLAHE tile storage in scratch estimates even for tiny inputs', () => {
  const source = new cv.Mat(8, 8, cv.CV_8UC1, new cv.Scalar(100));
  const node = newNode('clahe');
  node.parameters.tilesX = node.parameters.tilesY = 32;
  try {
    expect(() => executeResult(cv, node, [source], 1, 64 * 1024)).toThrow(/working memory/);
  } finally {
    source.delete();
  }
});
it('releases CLAHE on failure and bounds detector results without mutating the input', () => {
  const src = gray(),
    dispose = vi.fn(),
    clahe = vi.spyOn(cv, 'CLAHE').mockImplementation(function () {
      return {
        apply() {
          throw new Error('fixture failure');
        },
        delete: dispose,
      };
    });
  expect(() => execute(cv, newNode('clahe'), [src])).toThrow(/fixture failure/);
  expect(dispose).toHaveBeenCalledOnce();
  clahe.mockRestore();
  const detector = vi
    .spyOn(cv, 'HoughLinesP')
    .mockImplementation((_input: any, lines: any) => lines.create(10001, 1, cv.CV_32SC4));
  try {
    expect(() => execute(cv, newNode('hough-lines'), [src])).toThrow(/10,000/);
  } finally {
    detector.mockRestore();
    src.delete();
  }
});
it('reuses the WASM heap during repeated success and error cleanup', () => {
  const src = gray();
  const run = () => {
    for (const id of tools) execute(cv, newNode(id), [src]).delete();
  };
  for (let i = 0; i < 3; i++) run();
  const heap = cv.HEAPU8.buffer.byteLength;
  for (let i = 0; i < 12; i++) run();
  expect(cv.HEAPU8.buffer.byteLength).toBe(heap);
  src.delete();
});
