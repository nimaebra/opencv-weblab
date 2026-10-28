import { beforeAll, describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { execute } from '../packages/engine/src/operations';
import { waitForOpenCv } from '../packages/engine/src/loader';
import { newNode, operations } from '../packages/pipeline/src/index';
let cv: any;
beforeAll(async () => {
  const factory = createRequire(import.meta.url)(resolve('apps/web/public/runtime/opencv.js'));
  ({ cv } = await waitForOpenCv(factory));
}, 30000);
function fixture(gray = false) {
  const mat = new cv.Mat(24, 32, gray ? cv.CV_8UC1 : cv.CV_8UC4);
  const channels = gray ? 1 : 4;
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 32; x++)
      for (let c = 0; c < channels; c++)
        mat.data[(y * 32 + x) * channels + c] =
          c === 3 ? (x % 3 === 0 ? 80 : 255) : (x * 7 + y * 11 + c * 43) % 256;
  return mat;
}
describe('real OpenCV WebAssembly operations', () => {
  it.each(operations.filter((o) => o.id !== 'source').map((o) => [o.id, o.accepts] as const))(
    'executes %s on controlled pixels',
    (id, accepts) => {
      const source = fixture(accepts === 'gray'),
        second = source.clone();
      let output: any;
      try {
        output = execute(cv, newNode(id), [source, second]);
        expect(output.empty()).toBe(false);
        expect(output.depth()).toBe(cv.CV_8U);
        expect(output.rows).toBeGreaterThan(0);
      } finally {
        output?.delete();
        source.delete();
        second.delete();
      }
    },
  );
  it.each(['brightness', 'gamma', 'hue', 'invert', 'bilateral'])('preserves alpha for %s', (id) => {
    const source = fixture();
    const node = newNode(id);
    if (id === 'brightness') node.parameters.brightness = 30;
    if (id === 'gamma') node.parameters.gamma = 0.5;
    if (id === 'hue') node.parameters.hue = 40;
    const output = execute(cv, node, [source]);
    try {
      for (let i = 3; i < source.data.length; i += 4) expect(output.data[i]).toBe(source.data[i]);
    } finally {
      source.delete();
      output.delete();
    }
  });
  it('bypasses without mutating or aliasing the source', () => {
    const source = fixture();
    const node = newNode('invert');
    node.enabled = false;
    const output = execute(cv, node, [source]);
    try {
      expect([...output.data]).toEqual([...source.data]);
      output.data[0] = 255;
      expect(source.data[0]).toBe(0);
    } finally {
      source.delete();
      output.delete();
    }
  });
  it('rejects color input to a threshold and mismatched merge shapes', () => {
    const source = fixture(),
      gray = fixture(true);
    try {
      expect(() => execute(cv, newNode('threshold'), [source])).toThrow(/Grayscale/);
      expect(() => execute(cv, newNode('blend'), [source, gray])).toThrow(/identical/);
    } finally {
      source.delete();
      gray.delete();
    }
  });
  it('handles valid kernel boundaries and preview scaling', () => {
    const source = fixture(true);
    try {
      for (const id of ['gaussian', 'box', 'median', 'adaptive', 'sobel', 'laplacian', 'erode']) {
        const node = newNode(id);
        node.parameters.kernel = id === 'adaptive' ? 3 : 1;
        const output = execute(cv, node, [source], 0.1);
        expect(output.rows).toBe(source.rows);
        output.delete();
      }
    } finally {
      source.delete();
    }
  });
});
