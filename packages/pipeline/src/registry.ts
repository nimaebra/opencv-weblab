import { z } from 'zod';
export type ImageMode = 'rgba' | 'gray';
export type Parameter = {
  key: string;
  label: string;
  description: string;
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
  odd?: boolean;
  options?: readonly string[];
};
export type OperationDefinition = {
  id: string;
  version: 1;
  label: string;
  category: string;
  description: string;
  fn: string;
  inputs: number;
  accepts: 'any' | ImageMode;
  output: 'same' | ImageMode;
  parameters: Parameter[];
};
const number = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  description: string,
  step = 1,
  odd = false,
): Parameter => ({ key, label, default: value, min, max, description, step, odd });
const choice = (
  key: string,
  label: string,
  value: string,
  options: string[],
  description: string,
): Parameter => ({ key, label, default: value, options, description });
const kernel = number(
  'kernel',
  'Kernel size',
  5,
  1,
  31,
  'Width and height of the neighborhood, in full-resolution pixels.',
  2,
  true,
);
const morphology = [
  number(
    'kernel',
    'Kernel size',
    3,
    1,
    31,
    'Size of the structuring element in full-resolution pixels.',
    2,
    true,
  ),
  number('iterations', 'Iterations', 1, 1, 10, 'Number of times to apply the operation.'),
  choice(
    'shape',
    'Kernel shape',
    'ellipse',
    ['ellipse', 'rect', 'cross'],
    'The shape of the neighborhood.',
  ),
];
function op(
  id: string,
  label: string,
  category: string,
  description: string,
  fn: string,
  parameters: Parameter[] = [],
  accepts: OperationDefinition['accepts'] = 'any',
  output: OperationDefinition['output'] = 'same',
  inputs = 1,
): OperationDefinition {
  return { id, version: 1, label, category, description, fn, inputs, accepts, output, parameters };
}
export const operations: OperationDefinition[] = [
  op(
    'source',
    'Image source',
    'Input',
    'Load an image from your device. Pixels stay in this browser unless you explicitly include images in a cloud project.',
    'cv.matFromImageData',
    [],
    'any',
    'rgba',
    0,
  ),
  op(
    'grayscale',
    'Grayscale',
    'Color',
    'Combine red, green, and blue using perceptual luminance weights. Useful before thresholding or edge detection.',
    'cv.cvtColor',
    [],
    'any',
    'gray',
  ),
  op(
    'brightness',
    'Brightness / contrast',
    'Color',
    'Scale pixel intensities and add an offset. Values outside 0–255 are clipped.',
    'cv.Mat.convertTo',
    [
      number('contrast', 'Contrast', 1, 0, 3, 'Multiply each color channel by this factor.', 0.05),
      number('brightness', 'Brightness', 0, -100, 100, 'Add this offset after multiplying.'),
    ],
  ),
  op(
    'gamma',
    'Gamma correction',
    'Color',
    'Apply a nonlinear brightness curve. Gamma below 1 lifts shadows; gamma above 1 darkens them.',
    'cv.LUT',
    [number('gamma', 'Gamma', 1, 0.1, 4, 'Exponent applied to normalized color values.', 0.05)],
  ),
  op(
    'hue',
    'Hue / saturation',
    'Color',
    'Shift hue and scale saturation in HSV space, then return to color. Alpha is preserved.',
    'cv.cvtColor',
    [
      number('hue', 'Hue shift', 0, -180, 180, 'Hue rotation in degrees.'),
      number(
        'saturation',
        'Saturation',
        1,
        0,
        2,
        'Scale color intensity; zero removes saturation.',
        0.05,
      ),
    ],
    'rgba',
    'rgba',
  ),
  op(
    'invert',
    'Invert',
    'Color',
    'Subtract each intensity from 255. Black becomes white and colors become their complements.',
    'cv.bitwise_not',
  ),
  op(
    'gaussian',
    'Gaussian blur',
    'Smoothing',
    'Smooth with a bell-shaped kernel. Larger neighborhoods remove more detail and noise.',
    'cv.GaussianBlur',
    [
      kernel,
      number(
        'sigma',
        'Sigma',
        0,
        0,
        10,
        'Standard deviation. Zero lets OpenCV derive it from the kernel.',
        0.1,
      ),
    ],
  ),
  op(
    'box',
    'Box blur',
    'Smoothing',
    'Average every pixel in a square neighborhood. Each neighboring pixel contributes equally.',
    'cv.blur',
    [kernel],
  ),
  op(
    'median',
    'Median blur',
    'Smoothing',
    'Replace each pixel with its neighborhood median. Especially useful for salt-and-pepper noise.',
    'cv.medianBlur',
    [kernel],
  ),
  op(
    'bilateral',
    'Bilateral filter',
    'Smoothing',
    'Smooth similar neighboring colors while preserving strong boundaries. More expensive than Gaussian blur.',
    'cv.bilateralFilter',
    [
      number(
        'diameter',
        'Diameter',
        5,
        1,
        15,
        'Neighborhood diameter in full-resolution pixels.',
        2,
        true,
      ),
      number('sigmaColor', 'Color sigma', 75, 1, 150, 'Larger values mix more different colors.'),
      number('sigmaSpace', 'Space sigma', 75, 1, 150, 'Larger values mix more distant pixels.'),
    ],
  ),
  op(
    'threshold',
    'Global threshold',
    'Thresholding',
    'Split a grayscale image at one intensity value. Pixels above the threshold become white.',
    'cv.threshold',
    [
      number('threshold', 'Threshold', 127, 0, 255, 'Intensity separating black from white.'),
      choice(
        'method',
        'Method',
        'binary',
        ['binary', 'binary-inverse', 'truncate', 'to-zero'],
        'How values on each side of the threshold are replaced.',
      ),
    ],
    'gray',
    'gray',
  ),
  op(
    'adaptive',
    'Adaptive threshold',
    'Thresholding',
    'Calculate a separate threshold around each pixel. Useful for uneven lighting.',
    'cv.adaptiveThreshold',
    [
      number(
        'kernel',
        'Block size',
        11,
        3,
        51,
        'Odd neighborhood size in full-resolution pixels.',
        2,
        true,
      ),
      number('constant', 'Constant', 2, -20, 20, 'Subtract this value from each local threshold.'),
      choice(
        'method',
        'Neighborhood',
        'gaussian',
        ['gaussian', 'mean'],
        'Weighted Gaussian or simple neighborhood average.',
      ),
    ],
    'gray',
    'gray',
  ),
  op(
    'otsu',
    'Otsu threshold',
    'Thresholding',
    'Choose a global threshold automatically by separating the intensity histogram into two groups.',
    'cv.threshold',
    [],
    'gray',
    'gray',
  ),
  op(
    'canny',
    'Canny edges',
    'Edges',
    'Find thin edges with gradient filtering, suppression, and connected weak-edge selection.',
    'cv.Canny',
    [
      number(
        'low',
        'Low threshold',
        50,
        0,
        255,
        'Weak edges connected to strong edges can survive.',
      ),
      number('high', 'High threshold', 150, 0, 255, 'Gradients above this value are strong edges.'),
    ],
    'gray',
    'gray',
  ),
  op(
    'sobel',
    'Sobel gradient',
    'Edges',
    'Measure intensity changes along an axis. The displayed result is the absolute 8-bit gradient.',
    'cv.Sobel',
    [
      choice(
        'axis',
        'Direction',
        'x',
        ['x', 'y'],
        'Measure horizontal or vertical intensity changes.',
      ),
      number(
        'kernel',
        'Kernel size',
        3,
        1,
        7,
        'Odd derivative neighborhood in full-resolution pixels.',
        2,
        true,
      ),
    ],
    'gray',
    'gray',
  ),
  op(
    'laplacian',
    'Laplacian',
    'Edges',
    'Measure second-order intensity changes. The displayed result is the absolute 8-bit response.',
    'cv.Laplacian',
    [
      number(
        'kernel',
        'Kernel size',
        3,
        1,
        7,
        'Odd derivative neighborhood in full-resolution pixels.',
        2,
        true,
      ),
    ],
    'gray',
    'gray',
  ),
  op(
    'erode',
    'Erode',
    'Morphology',
    'Shrink bright regions by taking a neighborhood minimum. Useful for removing small bright noise.',
    'cv.erode',
    morphology,
  ),
  op(
    'dilate',
    'Dilate',
    'Morphology',
    'Expand bright regions by taking a neighborhood maximum. Useful for joining small gaps.',
    'cv.dilate',
    morphology,
  ),
  op(
    'open',
    'Opening',
    'Morphology',
    'Erode, then dilate. Removes small bright details while keeping larger shapes.',
    'cv.morphologyEx',
    morphology,
  ),
  op(
    'close',
    'Closing',
    'Morphology',
    'Dilate, then erode. Fills small dark holes and gaps in bright regions.',
    'cv.morphologyEx',
    morphology,
  ),
  op(
    'resize',
    'Resize',
    'Geometry',
    'Resize to explicit dimensions. Preview dimensions are scaled; full-resolution export uses these exact values.',
    'cv.resize',
    [
      number('width', 'Width', 640, 1, 4096, 'Output width in pixels.'),
      number('height', 'Height', 480, 1, 4096, 'Output height in pixels.'),
      choice(
        'interpolation',
        'Interpolation',
        'linear',
        ['linear', 'nearest', 'area', 'cubic'],
        'How new pixel values are sampled. Linear uses the bit-exact OpenCV variant.',
      ),
    ],
  ),
  op(
    'rotate',
    'Rotate',
    'Geometry',
    'Rotate around the image center while retaining the canvas dimensions. Empty areas become transparent or black.',
    'cv.warpAffine',
    [number('angle', 'Angle', 0, -180, 180, 'Counterclockwise rotation in degrees.')],
  ),
  op(
    'flip',
    'Flip',
    'Geometry',
    'Reflect an image horizontally, vertically, or along both axes.',
    'cv.flip',
    [
      choice(
        'axis',
        'Axis',
        'horizontal',
        ['horizontal', 'vertical', 'both'],
        'Which axis to reflect.',
      ),
    ],
  ),
  op(
    'blend',
    'Weighted blend',
    'Combining',
    'Mix two images with identical dimensions and color mode. The weight controls the contribution of input A.',
    'cv.addWeighted',
    [number('weight', 'Weight of A', 0.5, 0, 1, 'A × weight + B × (1 − weight).', 0.01)],
    'any',
    'same',
    2,
  ),
  op(
    'and',
    'Bitwise AND',
    'Combining',
    'Keep the bits shared by both images. Often used to intersect binary masks. Inputs must match.',
    'cv.bitwise_and',
    [],
    'any',
    'same',
    2,
  ),
  op(
    'or',
    'Bitwise OR',
    'Combining',
    'Keep bits present in either image. Often used to combine binary masks. Inputs must match.',
    'cv.bitwise_or',
    [],
    'any',
    'same',
    2,
  ),
];
export const registry = Object.assign(
  Object.create(null),
  Object.fromEntries(operations.map((o) => [o.id, o])),
) as Record<string, OperationDefinition>;
export const categories = [
  ...new Set(operations.filter((o) => o.id !== 'source').map((o) => o.category)),
];
export function defaults(id: string): Record<string, number | string> {
  const def = registry[id];
  if (!def) throw new Error(`Unknown operation: ${id}`);
  return Object.fromEntries(def.parameters.map((p) => [p.key, p.default]));
}
export function parameterSchema(id: string) {
  const def = registry[id];
  if (!def) throw new Error(`Unknown operation: ${id}`);
  const shape: Record<string, z.ZodType> = {};
  for (const p of def.parameters) {
    if (p.options) shape[p.key] = z.enum(p.options as [string, ...string[]]);
    else {
      let s = z.number().finite().min(p.min!).max(p.max!);
      if (p.step === 1 || p.odd) s = s.int();
      shape[p.key] = p.odd ? s.refine((v) => v % 2 === 1, 'Must be an odd number') : s;
    }
  }
  return z
    .object(shape)
    .strict()
    .superRefine((values, ctx) => {
      if (id === 'canny' && Number(values.low) > Number(values.high))
        ctx.addIssue({
          code: 'custom',
          path: ['high'],
          message: 'High threshold must be at least the low threshold.',
        });
    });
}
