export type View = { zoom: number | 'fit'; x: number; y: number };
export const origin: View = { zoom: 'fit', x: 0, y: 0 };
export type Size = { width: number; height: number };
export function imageTransform(image: Size, stage: Size, view: View) {
  const scale =
    view.zoom === 'fit'
      ? Math.min(stage.width / image.width, stage.height / image.height) * 0.92
      : view.zoom;
  return {
    scale,
    left: (stage.width - image.width * scale) / 2 + view.x,
    top: (stage.height - image.height * scale) / 2 + view.y,
  };
}
export function screenToPixel(image: Size, stage: Size, view: View, x: number, y: number) {
  const t = imageTransform(image, stage, view),
    px = Math.floor((x - t.left) / t.scale),
    py = Math.floor((y - t.top) / t.scale);
  return px < 0 || py < 0 || px >= image.width || py >= image.height ? null : { x: px, y: py };
}
export function zoomAtPoint(
  image: Size,
  stage: Size,
  view: View,
  factor: number,
  x: number,
  y: number,
): View {
  const before = imageTransform(image, stage, view),
    zoom = Math.max(0.05, Math.min(32, before.scale * factor));
  const imageX = (x - before.left) / before.scale,
    imageY = (y - before.top) / before.scale;
  return {
    zoom,
    x: x - imageX * zoom - (stage.width - image.width * zoom) / 2,
    y: y - imageY * zoom - (stage.height - image.height * zoom) / 2,
  };
}
