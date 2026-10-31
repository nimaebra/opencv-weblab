export type GeometryParameters = Record<string, number | string>;
export const cornerNames = ['tl', 'tr', 'br', 'bl'] as const;
export function perspectiveCorners(p: GeometryParameters, width = 101, height = 101) {
  return cornerNames.map((key) => ({
    x: (Number(p[`${key}X`]) * (width - 1)) / 100,
    y: (Number(p[`${key}Y`]) * (height - 1)) / 100,
  }));
}
export function validPerspective(p: GeometryParameters) {
  const points = perspectiveCorners(p);
  // Clockwise in image coordinates, with a nonzero turn at every corner.
  return (
    points.every((a, i) => {
      const b = points[(i + 1) % 4]!,
        c = points[(i + 2) % 4]!;
      return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0.000001;
    }) &&
    points[0]!.y + points[1]!.y < points[2]!.y + points[3]!.y &&
    points[0]!.x + points[3]!.x < points[1]!.x + points[2]!.x
  );
}
export function cropBounds(p: GeometryParameters, width: number, height: number) {
  const x = Math.floor((Number(p.left) * width) / 100);
  const y = Math.floor((Number(p.top) * height) / 100);
  return {
    x,
    y,
    width: Math.ceil((Number(p.right) * width) / 100) - x,
    height: Math.ceil((Number(p.bottom) * height) / 100) - y,
  };
}
