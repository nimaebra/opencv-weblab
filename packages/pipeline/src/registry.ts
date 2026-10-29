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
  inputContracts?: { label: string; accepts: 'any' | ImageMode }[];
  matchingModes?: boolean;
  parameters: Parameter[];
  inputHelp: string;
  outputHelp: string;
  experiment: string;
  documentationUrl: string;
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
  return {
    id,
    version: 1,
    label,
    category,
    description,
    fn,
    inputs,
    accepts,
    output,
    parameters,
    inputHelp:
      inputs === 0
        ? 'A PNG, JPEG or still WebP image from your device.'
        : `${inputs === 2 ? 'Two images with matching dimensions and color mode' : accepts === 'gray' ? 'An 8-bit grayscale image' : accepts === 'rgba' ? 'An RGBA color image' : 'An RGBA or grayscale image'}.`,
    outputHelp:
      output === 'same'
        ? 'The input color mode is preserved.'
        : output === 'gray'
          ? 'An 8-bit grayscale image.'
          : 'An 8-bit RGBA color image.',
    experiment: parameters.length
      ? `Change ${parameters[0]!.label.toLowerCase()} and compare this output with its input. ${parameters[0]!.description}`
      : `Pin the input to A and this output to B, then compare. ${description}`,
    documentationUrl: `https://docs.opencv.org/4.13.0/${id === 'equalize' ? 'd2/d74/tutorial_js_histogram_equalization.html' : id === 'canny' ? 'd7/de1/tutorial_js_canny.html' : id === 'channel' || id === 'source' || id === 'normalize' ? 'de/d06/tutorial_js_basic_ops.html' : (({ Color: 'db/d64/tutorial_js_colorspaces.html', Smoothing: 'dd/d6a/tutorial_js_filtering.html', Thresholding: 'd7/dd0/tutorial_js_thresholding.html', Morphology: 'd4/d76/tutorial_js_morphological_ops.html', Geometry: 'dd/d52/tutorial_js_geometric_transformations.html', Edges: 'da/d85/tutorial_js_gradients.html', Combining: 'dd/d4d/tutorial_js_image_arithmetics.html' } as Record<string, string>)[category] ?? 'd5/d10/tutorial_js_root.html')}`,
  };
}
export const operations: OperationDefinition[] = [
  op(
    'source',
    'Image source',
    'Input',
    'Load an image from your device. Pixels and projects stay on this device. Export a portable backup to keep a separate copy.',
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
  op(
    'channel',
    'Channel extraction',
    'Color',
    'Inspect red, green, blue or alpha as grayscale. Alpha measures opacity, not brightness.',
    'cv.split',
    [
      choice(
        'channel',
        'Channel',
        'red',
        ['red', 'green', 'blue', 'alpha'],
        'Choose the RGBA channel to inspect.',
      ),
    ],
    'rgba',
    'gray',
  ),
  op(
    'hsv-mask',
    'HSV range mask',
    'Color',
    'Select colors by hue, saturation and value. A hue minimum above its maximum wraps through red at zero. White pixels match; black pixels do not.',
    'cv.cvtColor / cv.inRange',
    [
      number('hMin', 'Hue minimum', 0, 0, 179, 'OpenCV hue units: 0–179 represent 0–358 degrees.'),
      number(
        'hMax',
        'Hue maximum',
        179,
        0,
        179,
        'A maximum below the minimum selects across the red boundary.',
      ),
      number(
        'sMin',
        'Saturation minimum',
        0,
        0,
        255,
        'Exclude pale or gray pixels by increasing this value.',
      ),
      number('sMax', 'Saturation maximum', 255, 0, 255, 'Upper bound on color intensity.'),
      number('vMin', 'Value minimum', 0, 0, 255, 'Exclude dark pixels by increasing this value.'),
      number('vMax', 'Value maximum', 255, 0, 255, 'Upper bound on brightness.'),
    ],
    'rgba',
    'gray',
  ),
  op(
    'equalize',
    'Histogram equalization',
    'Color',
    'Redistribute grayscale intensities using their cumulative histogram. Low-contrast detail becomes easier to see; noise may also become stronger.',
    'cv.equalizeHist',
    [],
    'gray',
    'gray',
  ),
  op(
    'normalize',
    'Intensity normalization',
    'Color',
    'Stretch the darkest intensity to zero and the brightest to 255. Constant images become black.',
    'cv.normalize',
    [],
    'gray',
    'gray',
  ),
  op(
    'sharpen',
    'Sharpen',
    'Smoothing',
    'Emphasize local differences with a 3×3 cross kernel. Excess strength can amplify noise and clip highlights. Alpha is preserved.',
    'cv.filter2D',
    [
      number(
        'strength',
        'Strength',
        1,
        0,
        3,
        'Zero leaves the image unchanged. One uses a center weight of 5 and neighbor weights of −1.',
        0.1,
      ),
    ],
  ),
  op(
    'morph-gradient',
    'Morphological gradient',
    'Morphology',
    'Subtract erosion from dilation to reveal the boundaries of bright shapes.',
    'cv.morphologyEx',
    morphology,
    'gray',
    'gray',
  ),
  op(
    'absdiff',
    'Absolute difference',
    'Combining',
    'Show how much two matching images differ at each pixel. Identical colors become black. RGBA output keeps input A’s alpha.',
    'cv.absdiff',
    [],
    'any',
    'same',
    2,
  ),
  op(
    'xor',
    'Bitwise XOR',
    'Combining',
    'Keep bits that differ between two matching images. With binary masks, white marks pixels present in only one input. RGBA output keeps input A’s alpha.',
    'cv.bitwise_xor',
    [],
    'any',
    'same',
    2,
  ),
];
operations.push(
  {
    ...op(
      'components',
      'Connected components',
      'Analysis',
      'Count connected nonzero regions. Black is background; every other intensity is foreground. Label colors are a visualization, not intensities or object identities across edits.',
      'cv.connectedComponents',
      [
        choice(
          'connectivity',
          'Connectivity',
          '8',
          ['4', '8'],
          'Four connects shared sides; eight also connects diagonal neighbors.',
        ),
      ],
      'gray',
      'rgba',
    ),
    outputHelp:
      'An opaque RGBA label image with black background, plus pixel area, centroid and bounding box for each object.',
    experiment:
      'Compare 4 and 8 connectivity on diagonally touching squares. Pin the mask to A and inspect the object table for B.',
    documentationUrl: 'https://docs.opencv.org/4.13.0/d3/dc0/group__imgproc__shape.html',
  },
  {
    ...op(
      'contours',
      'Contour analysis',
      'Analysis',
      'Find external boundaries of nonzero grayscale regions. Only outer contours are retrieved: holes are not separate rows. Contour area measures the outer polygon, including enclosed holes, and differs from foreground pixel area.',
      'cv.findContours / cv.contourArea',
      [],
      'gray',
      'rgba',
    ),
    outputHelp:
      'An RGBA copy of the grayscale input with green outer boundaries, plus contour area, perimeter, centroid and bounding box.',
    experiment:
      'Compare a filled 7×7 square: its pixel area is 49, contour area is 36 and perimeter is 24. A line or point has no area centroid.',
    documentationUrl: 'https://docs.opencv.org/4.13.0/dd/d49/tutorial_js_contour_features.html',
  },
  {
    ...op(
      'filter-objects',
      'Filter objects by area',
      'Analysis',
      'Keep connected foreground objects within an inclusive pixel-area range. Nonzero input is foreground. Preview thresholds scale with image area; small objects can disappear when downsampled.',
      'cv.connectedComponents',
      [
        number(
          'minArea',
          'Minimum area',
          25,
          0,
          16777216,
          'Smallest retained area in full-resolution input pixels squared.',
        ),
        number(
          'maxArea',
          'Maximum area',
          16777216,
          0,
          16777216,
          'Largest retained area in full-resolution input pixels squared.',
        ),
        choice(
          'connectivity',
          'Connectivity',
          '8',
          ['4', '8'],
          'Four connects shared sides; eight also connects diagonal neighbors.',
        ),
      ],
      'gray',
      'gray',
    ),
    outputHelp: 'A binary grayscale mask: retained objects are 255; everything else is zero.',
    experiment:
      'Increase the minimum area to remove small specks, then use Apply mask to isolate the retained objects.',
    documentationUrl: 'https://docs.opencv.org/4.13.0/d3/dc0/group__imgproc__shape.html',
  },
  {
    ...op(
      'apply-mask',
      'Apply mask',
      'Combining',
      'Keep image A wherever grayscale mask B is nonzero. All other pixels become black, or transparent for RGBA. Mask brightness does not multiply opacity.',
      'cv.Mat.copyTo',
      [],
      'any',
      'same',
      2,
    ),
    inputContracts: [
      { label: 'Image', accepts: 'any' },
      { label: 'Mask', accepts: 'gray' },
    ],
    matchingModes: false,
    inputHelp:
      'A: grayscale or RGBA image. B: grayscale mask with the same dimensions. Nonzero mask pixels are included.',
    experiment:
      'Connect the original image to A and a threshold or filtered mask to B. Inspect the alpha channel of the isolated output.',
  },
);
export function inputContract(def: OperationDefinition, input: number) {
  return def.inputContracts?.[input] ?? { label: input === 0 ? 'A' : 'B', accepts: def.accepts };
}
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
      if (id === 'filter-objects' && Number(values.minArea) > Number(values.maxArea))
        ctx.addIssue({
          code: 'custom',
          path: ['maxArea'],
          message: 'Maximum area must be at least the minimum area.',
        });
      if (id === 'hsv-mask') {
        for (const key of ['s', 'v'])
          if (Number(values[`${key}Min`]) > Number(values[`${key}Max`]))
            ctx.addIssue({
              code: 'custom',
              path: [`${key}Max`],
              message: 'Saturation and value maximums must be at least their minimums.',
            });
      }
      if (id === 'canny' && Number(values.low) > Number(values.high))
        ctx.addIssue({
          code: 'custom',
          path: ['high'],
          message: 'High threshold must be at least the low threshold.',
        });
    });
}
