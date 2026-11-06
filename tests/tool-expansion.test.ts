import { createRequire } from 'node:module';
import { beforeAll, expect, it } from 'vitest';
import { waitForOpenCv } from '../packages/engine/src/loader';
import { execute, executeResult, type CV } from '../packages/engine/src/operations';
import {
  connect,
  inferDimensions,
  makeExample,
  newNode,
  parseDocument,
  validateGraph,
} from '../packages/pipeline/src/index';

let cv: CV;
beforeAll(async () => {
  ({ cv } = await waitForOpenCv(
    createRequire(import.meta.url)('../apps/web/public/runtime/opencv.js'),
  ));
});

it('marks the known template location without changing either input', () => {
  const pixels = [0, 0, 3, 1, 0, 0, 8, 9, 4, 0, 2, 0, 5, 7, 0];
  const search = cv.matFromArray(3, 5, cv.CV_8UC1, pixels);
  const template = cv.matFromArray(2, 2, cv.CV_8UC1, [8, 9, 0, 5]);
  const node = newNode('template-match');
  const output = execute(cv, node, [search, template]);
  try {
    expect([output.cols, output.rows, output.channels()]).toEqual([5, 3, 4]);
    const greenPixels = Array.from({ length: 15 }, (_, i) => i).filter(
      (i) => output.data[i * 4] === 0 && output.data[i * 4 + 1] === 255,
    );
    expect(greenPixels).toEqual([6, 7, 11, 12]);
    expect([...output.data].filter((_, i) => i % 4 === 3)).toEqual(Array(15).fill(255));
    expect([...search.data]).toEqual(pixels);
    expect([...template.data]).toEqual([8, 9, 0, 5]);
    expect(() => execute(cv, node, [template, search])).toThrow(/Template must fit/);
    expect(() => execute(cv, node, [template, search], 0.5)).toThrow(/Full resolution/);
    expect(() => executeResult(cv, node, [search, template], 1, 1)).toThrow(/working memory/);
  } finally {
    output.delete();
    template.delete();
    search.delete();
  }
});

it('validates smaller templates, rejects an oversized branch, and infers new geometry', () => {
  let doc = parseDocument(makeExample('template-matching'));
  const crop = doc.nodes.find((node) => node.operation === 'crop')!;
  const match = doc.nodes.find((node) => node.operation === 'template-match')!;
  const search = doc.nodes.find((node) => node.operation === 'grayscale')!;
  const pad = newNode('pad');
  const spectrum = newNode('fourier-spectrum');
  pad.parameters.padding = 1;
  doc.nodes.push(pad, spectrum);
  doc = connect(doc, search.id, pad.id);
  doc = connect(doc, pad.id, spectrum.id);
  expect(inferDimensions(doc).get(pad.id)).toEqual({ width: 194, height: 194 });
  expect(inferDimensions(doc).get(spectrum.id)).toEqual({ width: 200, height: 200 });
  expect(validateGraph(doc)).toEqual([]);
  expect(() => connect(doc, pad.id, match.id, 1)).toThrow(/Template must fit/);
  doc.edges.find((edge) => edge.target === match.id && edge.input === 1)!.source = pad.id;
  expect(validateGraph(doc)).toContainEqual(
    expect.objectContaining({
      nodeId: match.id,
      message: expect.stringMatching(/Template must fit/),
    }),
  );
  doc.edges.find((edge) => edge.target === match.id && edge.input === 1)!.source = crop.id;
  spectrum.enabled = false;
  expect(inferDimensions(doc).get(spectrum.id)).toEqual({ width: 194, height: 194 });
  expect(validateGraph(doc)).toEqual([]);
});

it.each(['telea', 'navier-stokes'])(
  'repairs a nonzero mask using %s and preserves alpha',
  (method) => {
    const src = new cv.Mat(7, 7, cv.CV_8UC4, new cv.Scalar(70, 90, 110, 143));
    const mask = cv.Mat.zeros(7, 7, cv.CV_8UC1);
    const node = newNode('inpaint');
    node.parameters.method = method;
    const center = 24;
    src.data.set([255, 255, 255, 27], center * 4);
    mask.data[center] = 1;
    const original = [...src.data];
    const repaired = execute(cv, node, [src, mask]);
    try {
      for (const [index, value] of [70, 90, 110].entries())
        expect(Math.abs(repaired.data[center * 4 + index] - value)).toBeLessThanOrEqual(3);
      expect(repaired.data[center * 4 + 3]).toBe(27);
      expect([...repaired.data].slice(0, center * 4)).toEqual(original.slice(0, center * 4));
      expect([...src.data]).toEqual(original);
      expect(mask.data[center]).toBe(1);
      mask.data.fill(255);
      expect(() => execute(cv, node, [src, mask])).toThrow(/unmasked pixels/);
      mask.data.fill(0);
      const unchanged = execute(cv, node, [src, mask]);
      try {
        expect([...unchanged.data]).toEqual(original);
        unchanged.data[0] = 0;
        expect(src.data[0]).toBe(70);
      } finally {
        unchanged.delete();
      }
    } finally {
      repaired.delete();
      mask.delete();
      src.delete();
    }
  },
);

it('bounds inpaint neighborhood work and reports a wrong-sized mask', () => {
  const src = cv.Mat.zeros(250, 250, cv.CV_8UC1);
  const mask = new cv.Mat(250, 250, cv.CV_8UC1, new cv.Scalar(255));
  const small = cv.Mat.zeros(1, 1, cv.CV_8UC1);
  const node = newNode('inpaint');
  node.parameters.radius = 15;
  mask.data[0] = 0;
  try {
    expect(() => execute(cv, node, [src, mask])).toThrow(/smaller mask or radius/);
    expect(() => execute(cv, node, [src, small])).toThrow(/identical dimensions/);
  } finally {
    small.delete();
    mask.delete();
    src.delete();
  }
});

it('uses seed-relative tolerance and distinguishes four from eight connected neighbors', () => {
  const pixels = [10, 0, 0, 0, 17, 0, 0, 0, 24];
  const src = cv.matFromArray(3, 3, cv.CV_8UC1, pixels);
  const node = newNode('flood-selection');
  node.parameters = { seedX: 0, seedY: 0, tolerance: 7, connectivity: '4' };
  const four = execute(cv, node, [src]);
  node.parameters.connectivity = '8';
  const eight = execute(cv, node, [src]);
  try {
    expect([...four.data]).toEqual([255, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...eight.data]).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 0]);
    expect([...src.data]).toEqual(pixels);
  } finally {
    eight.delete();
    four.delete();
    src.delete();
  }
});

it('pads with opaque black, replicated edges, or reflected edges and scales preview padding', () => {
  const src = cv.matFromArray(1, 2, cv.CV_8UC4, [10, 10, 10, 31, 20, 20, 20, 32]);
  const node = newNode('pad');
  node.parameters.padding = 2;
  try {
    for (const [border, first] of [
      ['constant', [0, 0, 0, 255]],
      ['replicate', [10, 10, 10, 31]],
      ['reflect', [20, 20, 20, 32]],
    ] as const) {
      node.parameters.border = border;
      const result = execute(cv, node, [src], 0.5);
      try {
        expect([result.cols, result.rows]).toEqual([4, 3]);
        expect([...result.data.slice(0, 4)]).toEqual(first);
        expect([...result.data.slice(20, 28)]).toEqual([...src.data]);
      } finally {
        result.delete();
      }
    }
    expect([...src.data]).toEqual([10, 10, 10, 31, 20, 20, 20, 32]);
    node.parameters.padding = 512;
    expect(() => executeResult(cv, node, [src], 1, 1_000_000)).toThrow(/working memory/);
  } finally {
    src.delete();
  }
});

it('centers DC on an odd-height grid, preserves the source, and maps zeros to black', () => {
  const src = new cv.Mat(3, 7, cv.CV_8UC1, new cv.Scalar(100));
  const node = newNode('fourier-spectrum');
  const spectrum = execute(cv, node, [src]);
  try {
    expect([spectrum.cols, spectrum.rows, spectrum.type()]).toEqual([8, 3, cv.CV_8UC1]);
    expect([...spectrum.data].flatMap((value, i) => (value === 255 ? [i] : []))).toEqual([12]);
    expect([...src.data]).toEqual(Array(21).fill(100));
    src.data.fill(0);
    const blank = execute(cv, node, [src]);
    try {
      expect([...blank.data]).toEqual(Array(24).fill(0));
    } finally {
      blank.delete();
    }
    expect(() => executeResult(cv, node, [src], 1, 1)).toThrow(/working memory/);
  } finally {
    spectrum.delete();
    src.delete();
  }
});
