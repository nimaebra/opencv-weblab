import { beforeAll, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { waitForOpenCv } from '../packages/engine/src/loader';
import { execute } from '../packages/engine/src/operations';
import {
  newNode,
  parameterSchema,
  lessons,
  makeExample,
  validateGraph,
} from '../packages/pipeline/src/index';
let cv: any;
beforeAll(async () => {
  ({ cv } = await waitForOpenCv(
    createRequire(import.meta.url)('../apps/web/public/runtime/opencv.js'),
  ));
});
it('extracts the requested channel, including nonopaque alpha', () => {
  const source = cv.matFromArray(1, 2, cv.CV_8UC4, [10, 20, 30, 40, 50, 60, 70, 80]);
  try {
    for (const [index, channel] of ['red', 'green', 'blue', 'alpha'].entries()) {
      const n = newNode('channel');
      n.parameters.channel = channel;
      const result = execute(cv, n, [source]);
      try {
        expect([...result.data]).toEqual([10 + index * 10, 50 + index * 10]);
      } finally {
        result.delete();
      }
    }
  } finally {
    source.delete();
  }
});
it('wraps HSV hue bounds through red, and accepts inclusive boundaries', () => {
  const source = cv.matFromArray(
      1,
      3,
      cv.CV_8UC4,
      [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
    ),
    node = newNode('hsv-mask');
  node.parameters = { hMin: 170, hMax: 10, sMin: 255, sMax: 255, vMin: 255, vMax: 255 };
  const result = execute(cv, node, [source]);
  try {
    expect([...result.data]).toEqual([255, 0, 0]);
  } finally {
    source.delete();
    result.delete();
  }
  expect(
    parameterSchema('hsv-mask').safeParse({ ...node.parameters, sMin: 10, sMax: 9 }).success,
  ).toBe(false);
});
it('normalizes a ramp and maps a constant image to black', () => {
  for (const [pixels, expected] of [
    [
      [50, 100, 150],
      [0, 128, 255],
    ],
    [
      [75, 75, 75],
      [0, 0, 0],
    ],
  ]) {
    const source = cv.matFromArray(1, 3, cv.CV_8UC1, pixels),
      result = execute(cv, newNode('normalize'), [source]);
    try {
      expect([...result.data]).toEqual(expected);
    } finally {
      source.delete();
      result.delete();
    }
  }
});
it('makes sharpen strength zero an identity without changing alpha', () => {
  const source = cv.matFromArray(1, 2, cv.CV_8UC4, [10, 20, 30, 40, 200, 150, 100, 90]),
    node = newNode('sharpen');
  node.parameters.strength = 0;
  const result = execute(cv, node, [source]);
  try {
    expect([...result.data]).toEqual([...source.data]);
  } finally {
    source.delete();
    result.delete();
  }
});
it.each(['absdiff', 'xor'])(
  '%s compares pixels without making identical RGBA images transparent',
  (id) => {
    const source = cv.matFromArray(1, 1, cv.CV_8UC4, [10, 20, 30, 80]),
      result = execute(cv, newNode(id), [source, source]);
    try {
      expect([...result.data]).toEqual([0, 0, 0, 80]);
    } finally {
      source.delete();
      result.delete();
    }
  },
);
it('computes a morphological gradient as dilation minus erosion', () => {
  const source = cv.matFromArray(3, 3, cv.CV_8UC1, [0, 0, 0, 0, 255, 0, 0, 0, 0]),
    node = newNode('morph-gradient');
  node.parameters.shape = 'rect';
  const result = execute(cv, node, [source]);
  try {
    expect([...result.data]).toEqual(Array(9).fill(255));
  } finally {
    source.delete();
    result.delete();
  }
});
it.each(lessons.map((l) => [l.id] as const))(
  'ships a valid, executable %s teaching graph',
  (id) => {
    expect(validateGraph(makeExample(id))).toEqual([]);
  },
);
