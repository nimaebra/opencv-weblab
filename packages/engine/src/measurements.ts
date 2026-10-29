import type { CV } from './operations';

export const MAX_OBJECTS = 10000;
export const WORKING_BYTES = 256 * 1024 * 1024;
export type Bounds = { x: number; y: number; width: number; height: number };
type BaseRow = { id: number; bounds: Bounds; centroid: { x: number; y: number } | null };
export type ComponentRow = BaseRow & { pixelArea: number };
export type ContourRow = BaseRow & { contourArea: number; perimeter: number };
export type Measurements = { width: number; height: number } & (
  { kind: 'components'; rows: ComponentRow[] } | { kind: 'contours'; rows: ContourRow[] }
);
export type OperationResult = { mat: CV; measurements?: Measurements };
const limitMessage =
  'More than 10,000 objects. Reduce noise with smoothing or use a smaller image.';
export function analysisBudget(pixels: number, available: number, contours = false) {
  // Conservative scratch allowance: labels/scan buffers or contour points, output,
  // rasterization and bounded row accumulators. Check before entering synchronous WASM.
  if (pixels * (contours ? 48 : 32) + MAX_OBJECTS * 128 > available)
    throw new Error(
      'Object analysis needs too much working memory. Use a smaller image or fewer branches.',
    );
}
export function labelColor(id: number): number[] {
  return id === 0
    ? [0, 0, 0, 255]
    : [64 + ((id * 73) % 192), 64 + ((id * 151) % 192), 64 + ((id * 199) % 192), 255];
}
export function componentOperation(
  cv: CV,
  src: CV,
  connectivity: number,
  range?: [number, number],
): OperationResult {
  const labels = new cv.Mat();
  let output: CV;
  try {
    const count = cv.connectedComponents(src, labels, connectivity, cv.CV_32S) - 1;
    if (count > MAX_OBJECTS) throw new Error(limitMessage);
    const canonical = new Int32Array(count + 1);
    const rows: ComponentRow[] = [];
    const sumsX = new Float64Array(count + 1),
      sumsY = new Float64Array(count + 1);
    // Canonical IDs follow the first foreground pixel in raster order, independent
    // of the native connected-component labeling algorithm.
    for (let i = 0; i < labels.data32S.length; i++) {
      const label = labels.data32S[i];
      if (!label) continue;
      const x = i % src.cols,
        y = Math.floor(i / src.cols);
      if (!canonical[label]) {
        canonical[label] = rows.length + 1;
        rows.push({
          id: rows.length + 1,
          pixelArea: 0,
          bounds: { x, y, width: 1, height: 1 },
          centroid: null,
        });
      }
      const row = rows[canonical[label] - 1]!;
      const right = Math.max(row.bounds.x + row.bounds.width, x + 1);
      row.bounds.x = Math.min(row.bounds.x, x);
      row.bounds.width = right - row.bounds.x;
      row.bounds.height = y - row.bounds.y + 1;
      row.pixelArea++;
      sumsX[row.id]! += x;
      sumsY[row.id]! += y;
    }
    for (const row of rows)
      row.centroid = { x: sumsX[row.id]! / row.pixelArea, y: sumsY[row.id]! / row.pixelArea };
    const colors = rows.map((row) => labelColor(row.id));
    output = cv.Mat.zeros(src.rows, src.cols, range ? cv.CV_8UC1 : cv.CV_8UC4);
    const background = labelColor(0);
    for (let i = 0; i < labels.data32S.length; i++) {
      const id = canonical[labels.data32S[i]]!;
      if (range)
        output.data[i] =
          id && rows[id - 1]!.pixelArea >= range[0] && rows[id - 1]!.pixelArea <= range[1]
            ? 255
            : 0;
      else {
        const color = id ? colors[id - 1]! : background;
        for (let c = 0; c < 4; c++) output.data[i * 4 + c] = color[c];
      }
    }
    return {
      mat: output,
      measurements: range
        ? undefined
        : { kind: 'components', width: src.cols, height: src.rows, rows },
    };
  } catch (error) {
    output?.delete();
    throw error;
  } finally {
    labels.delete();
  }
}
export function contourOperation(cv: CV, src: CV): OperationResult {
  const contours = new cv.MatVector(),
    hierarchy = new cv.Mat(),
    output = new cv.Mat();
  try {
    cv.findContours(src, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    if (contours.size() > MAX_OBJECTS) throw new Error(limitMessage);
    const entries: { row: ContourRow; first: number }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      try {
        const bounds = cv.boundingRect(contour),
          moments = cv.moments(contour, false);
        let first = Infinity;
        for (let j = 0; j < contour.data32S.length; j += 2)
          first = Math.min(first, contour.data32S[j + 1] * src.cols + contour.data32S[j]);
        entries.push({
          first,
          row: {
            id: 0,
            bounds,
            contourArea: cv.contourArea(contour, false),
            perimeter: cv.arcLength(contour, true),
            centroid:
              moments.m00 === 0
                ? null
                : { x: moments.m10 / moments.m00, y: moments.m01 / moments.m00 },
          },
        });
      } finally {
        contour.delete();
      }
    }
    entries.sort((a, b) => a.first - b.first);
    const rows = entries.map(({ row }, index) => ({ ...row, id: index + 1 }));
    cv.cvtColor(src, output, cv.COLOR_GRAY2RGBA);
    cv.drawContours(
      output,
      contours,
      -1,
      new cv.Scalar(80, 210, 110, 255),
      1,
      cv.LINE_8,
      hierarchy,
      0,
    );
    return {
      mat: output,
      measurements: { kind: 'contours', width: src.cols, height: src.rows, rows },
    };
  } catch (error) {
    output.delete();
    throw error;
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}
export function measurementsCsv(measurements: Measurements): string {
  const area = measurements.kind === 'components' ? 'pixel_area' : 'contour_area';
  const header = [
    'id',
    area,
    ...(measurements.kind === 'contours' ? ['perimeter'] : []),
    'centroid_x',
    'centroid_y',
    'x',
    'y',
    'width',
    'height',
    'image_width',
    'image_height',
  ];
  const rows = measurements.rows.map((row) =>
    [
      row.id,
      'pixelArea' in row ? row.pixelArea : row.contourArea,
      ...('perimeter' in row ? [row.perimeter] : []),
      row.centroid?.x ?? '',
      row.centroid?.y ?? '',
      row.bounds.x,
      row.bounds.y,
      row.bounds.width,
      row.bounds.height,
      measurements.width,
      measurements.height,
    ].join(','),
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}
