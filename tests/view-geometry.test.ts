import { it, expect } from 'vitest';
import { imageTransform, screenToPixel, zoomAtPoint, origin } from '../apps/web/src/viewGeometry';
it('distinguishes fit from one image pixel per CSS pixel', () => {
  expect(
    imageTransform({ width: 1000, height: 500 }, { width: 500, height: 300 }, origin).scale,
  ).toBeCloseTo(0.46);
  expect(
    imageTransform(
      { width: 1000, height: 500 },
      { width: 500, height: 300 },
      { zoom: 1, x: 0, y: 0 },
    ).scale,
  ).toBe(1);
});
it('inverts zoom and panning for pixel coordinates and rejects the outside area', () => {
  const image = { width: 100, height: 100 },
    stage = { width: 400, height: 300 },
    view = { zoom: 2, x: 30, y: -10 };
  const t = imageTransform(image, stage, view);
  expect(screenToPixel(image, stage, view, t.left + 21, t.top + 41)).toEqual({ x: 10, y: 20 });
  expect(screenToPixel(image, stage, view, t.left - 1, t.top)).toBeNull();
});
it('keeps the same pixel under the cursor when zooming', () => {
  const image = { width: 512, height: 480 },
    stage = { width: 400, height: 300 },
    point = { x: 240, y: 170 };
  const before = screenToPixel(image, stage, origin, point.x, point.y),
    after = zoomAtPoint(image, stage, origin, 2, point.x, point.y);
  expect(screenToPixel(image, stage, after, point.x, point.y)).toEqual(before);
});
