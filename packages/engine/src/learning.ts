import { parameterSchema, type PipelineDocument, type PipelineNode } from '@roveran/pipeline';
import { scaledOdd, type CV } from './operations';

export type PixelExplanation = {
  nodeId: string;
  x: number;
  y: number;
  kernel: number;
  scale: number;
  sigma?: number;
  sum: number;
  output: number;
  cells: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    value: number;
    weight: number;
    reflected: boolean;
  }[];
};
export function previewScale(doc: PipelineDocument): number {
  const longest = Math.max(1, ...doc.sources.flatMap((s) => [s.width, s.height]));
  return doc.preview.quality === 'full' ? 1 : Math.min(1, 1024 / longest);
}
export function explanationKernel(node: PipelineNode, scale: number): number {
  if (!node.enabled) throw new Error('Enable this operation to explain its calculation.');
  if (!['box', 'gaussian', 'sharpen'].includes(node.operation))
    throw new Error('Pixel calculations are available for Box blur, Gaussian blur and Sharpen.');
  parameterSchema(node.operation).parse(node.parameters);
  const size = node.operation === 'sharpen' ? 3 : scaledOdd(Number(node.parameters.kernel), scale);
  if (size > 7) throw new Error('Choose a preview kernel of 7 or smaller to inspect its weights.');
  return size;
}
/** BORDER_REFLECT_101: mirror across the edge without repeating the edge pixel. */
export function reflect101(position: number, length: number): number {
  if (length === 1) return 0;
  const period = 2 * (length - 1);
  const n = ((position % period) + period) % period;
  return n < length ? n : period - n;
}
export function explanationRegion(
  node: PipelineNode,
  scale: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const radius = (explanationKernel(node, scale) - 1) / 2;
  // Reflected coordinates can reach radius pixels inward even on tiny images.
  const xs = Array.from({ length: radius * 2 + 1 }, (_, i) => reflect101(x + i - radius, width));
  const ys = Array.from({ length: radius * 2 + 1 }, (_, i) => reflect101(y + i - radius, height));
  const left = Math.min(...xs),
    top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left + 1, height: Math.max(...ys) - top + 1 };
}
/** Arithmetic uses original grayscale matrix values, represented losslessly in the preview bitmap. */
export function explainPixel(
  cv: CV,
  node: PipelineNode,
  scale: number,
  x: number,
  y: number,
  size: { width: number; height: number },
  patch: { data: Uint8ClampedArray; width: number; left: number; top: number },
  output: number,
): PixelExplanation {
  const kernel = explanationKernel(node, scale),
    radius = (kernel - 1) / 2;
  let weights: number[];
  const sigma = node.operation === 'gaussian' ? Number(node.parameters.sigma) * scale : undefined;
  if (node.operation === 'gaussian') {
    // getGaussianKernel is not exported by the pinned JS build. Its floating-point
    // Gaussian response to an isolated unit impulse exposes the same 1D weights.
    const impulse = cv.Mat.zeros(1, kernel * 2 + 1, cv.CV_64F);
    const response = new cv.Mat();
    try {
      impulse.data64F[kernel] = 1;
      cv.GaussianBlur(impulse, response, new cv.Size(kernel, 1), sigma, 0, cv.BORDER_CONSTANT);
      const floating = Array.from(
        response.data64F.slice(kernel - radius, kernel + radius + 1),
      ) as number[];
      // Model the pinned runtime's 8-bit Gaussian coefficients: symmetric 1/256
      // weights, with error carried inward and the center completing a unit sum.
      // Reference: OpenCV 4.13 smooth.dispatch.cpp, getGaussianKernelFixedPoint_ED.
      const g = Array<number>(kernel).fill(0);
      let carry = 0,
        sideTotal = 0;
      for (let i = 0; i < radius; i++) {
        const adjusted = floating[i]! * 256 + carry;
        const floor = Math.floor(adjusted),
          fraction = adjusted - floor;
        const rounded = fraction === 0.5 ? floor + (floor % 2) : Math.round(adjusted);
        carry = adjusted - rounded;
        g[i] = g[kernel - i - 1] = rounded / 256;
        sideTotal += rounded;
      }
      g[radius] = (256 - 2 * sideTotal) / 256;
      weights = g.flatMap((a) => g.map((b) => a * b));
    } finally {
      impulse.delete();
      response.delete();
    }
  } else if (node.operation === 'box') weights = Array(kernel * kernel).fill(1 / (kernel * kernel));
  else {
    const strength = Number(node.parameters.strength);
    weights = [0, -strength, 0, -strength, 1 + 4 * strength, -strength, 0, -strength, 0].map(
      Math.fround,
    );
  }
  const cells = weights.map((weight, i) => {
    const px = x + (i % kernel) - radius,
      py = y + Math.floor(i / kernel) - radius;
    const sx = reflect101(px, size.width),
      sy = reflect101(py, size.height);
    const value = patch.data[((sy - patch.top) * patch.width + sx - patch.left) * 4]!;
    return {
      x: sx,
      y: sy,
      dx: px - x,
      dy: py - y,
      value,
      weight,
      reflected: sx !== px || sy !== py,
    };
  });
  return {
    nodeId: node.id,
    x,
    y,
    kernel,
    scale,
    sigma,
    sum: cells.reduce((s, c) => s + c.value * c.weight, 0),
    output,
    cells,
  };
}
