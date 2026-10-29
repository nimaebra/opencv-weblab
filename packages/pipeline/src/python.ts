import { registry } from './registry';
import { topologicalOrder, validateGraph, type PipelineDocument } from './index';
import { analysisPython } from './python-analysis';
/** Executable source, never eval'd. Only validated numbers/enums reach expressions. */
export function generatePython(doc: PipelineDocument): string {
  const issues = validateGraph(doc);
  if (issues.length) throw new Error(issues.map((i) => i.message).join('\n'));
  const lines = [
    `# ${doc.name.replace(/[\r\n]/g, ' ')} — exported by OpenCV WebLab`,
    `# OpenCV 4.13.x; pip install 'opencv-python>=4.13,<4.14' numpy`,
    `# Use 8-bit sRGB inputs. Browser ICC/orientation decoding may differ from cv.imread.`,
    `import cv2 as cv`,
    `import numpy as np`,
    `from pathlib import Path`,
    ``,
    'def load_rgba(path):',
    '    image = cv.imread(str(path), cv.IMREAD_UNCHANGED)',
    '    if image is None: raise ValueError(f"Cannot read image: {path}")',
    '    if image.dtype != np.uint8: raise ValueError("Use 8-bit sRGB input images")',
    '    if image.ndim == 2: return cv.cvtColor(image, cv.COLOR_GRAY2RGBA)',
    '    return cv.cvtColor(image, cv.COLOR_BGRA2RGBA if image.shape[2] == 4 else cv.COLOR_BGR2RGBA)',
    '',
    'def color_only(image, fn):',
    '    if image.ndim == 2: return fn(image)',
    '    rgb = cv.cvtColor(image, cv.COLOR_RGBA2RGB)',
    '    output = cv.cvtColor(fn(rgb), cv.COLOR_RGB2RGBA)',
    '    output[:, :, 3] = image[:, :, 3]',
    '    return output',
    '',
    'def hue_sat(image, hue, saturation):',
    '    def adjust(rgb):',
    '        hsv = cv.cvtColor(rgb, cv.COLOR_RGB2HSV)',
    '        hsv[:, :, 0] = (hsv[:, :, 0].astype(np.float64) + hue / 2 + 180).astype(np.int32) % 180',
    '        hsv[:, :, 1] = np.minimum(255, np.floor(hsv[:, :, 1].astype(np.float64) * saturation + 0.5)).astype(np.uint8)',
    '        return cv.cvtColor(hsv, cv.COLOR_HSV2RGB)',
    '    return color_only(image, adjust)',
    '',
    'def merge_images(a, b, fn):',
    '    if a.shape != b.shape: raise ValueError("Merge inputs must have identical dimensions and color mode")',
    '    return fn(a, b)',
    '',
    'def hsv_mask(image, h_min, h_max, s_min, s_max, v_min, v_max):',
    '    hsv = cv.cvtColor(cv.cvtColor(image, cv.COLOR_RGBA2RGB), cv.COLOR_RGB2HSV)',
    '    def mask(lo, hi): return cv.inRange(hsv, (lo, s_min, v_min), (hi, s_max, v_max))',
    '    return mask(h_min, h_max) if h_min <= h_max else cv.bitwise_or(mask(h_min, 179), mask(0, h_max))',
    '',
    'def difference(a, b, fn):',
    '    output = merge_images(a, b, fn)',
    '    if output.ndim == 3: output[:, :, 3] = a[:, :, 3]',
    '    return output',
    '',
    'def save_image(path, image):',
    '    if image.ndim == 3: image = cv.cvtColor(image, cv.COLOR_RGBA2BGRA)',
    '    if not cv.imwrite(str(path), image): raise ValueError(f"Cannot save {path}")',
    '',
  ];
  if (
    doc.nodes.some((n) =>
      ['components', 'contours', 'filter-objects', 'apply-mask'].includes(n.operation),
    )
  )
    lines.push(analysisPython, '');
  const names = new Map<string, string>();
  const ordered = topologicalOrder(doc);
  ordered.forEach((n, i) => names.set(n.id, `image_${i}`));
  for (const n of ordered) {
    const name = names.get(n.id)!;
    const def = registry[n.operation]!;
    const inputs = doc.edges
      .filter((e) => e.target === n.id)
      .sort((a, b) => a.input - b.input)
      .map((e) => names.get(e.source)!);
    const [a, b] = inputs;
    const p = n.parameters;
    let expr = '';
    lines.push(`# ${n.label.replace(/[\r\n]/g, ' ')} — ${def.fn}`);
    if (n.operation === 'source') {
      const source = doc.sources.find((s) => s.id === n.sourceId)!;
      expr = `load_rgba(Path(${JSON.stringify(source.name)}))`;
    } else if (!n.enabled) expr = `${a}.copy()  # bypassed; input A passes through`;
    else
      switch (n.operation) {
        case 'components':
          expr = `component_image(${a}, ${p.connectivity})`;
          break;
        case 'contours':
          expr = `contour_image(${a})`;
          break;
        case 'filter-objects':
          expr = `filter_objects(${a}, ${p.connectivity}, ${p.minArea}, ${p.maxArea})`;
          break;
        case 'apply-mask':
          expr = `apply_mask(${a}, ${b})`;
          break;
        case 'grayscale':
          expr = `cv.cvtColor(${a}, cv.COLOR_RGBA2GRAY) if ${a}.ndim == 3 else ${a}.copy()`;
          break;
        case 'channel':
          expr = `cv.split(${a})[${['red', 'green', 'blue', 'alpha'].indexOf(String(p.channel))}]`;
          break;
        case 'hsv-mask':
          expr = `hsv_mask(${a}, ${p.hMin}, ${p.hMax}, ${p.sMin}, ${p.sMax}, ${p.vMin}, ${p.vMax})`;
          break;
        case 'equalize':
          expr = `cv.equalizeHist(${a})`;
          break;
        case 'normalize':
          expr = `cv.normalize(${a}, None, 0, 255, cv.NORM_MINMAX)`;
          break;
        case 'sharpen': {
          const v = Number(p.strength);
          expr = `color_only(${a}, lambda rgb: cv.filter2D(rgb, -1, np.array([[0, ${-v}, 0], [${-v}, ${1 + 4 * v}, ${-v}], [0, ${-v}, 0]], dtype=np.float32), borderType=cv.BORDER_DEFAULT))`;
          break;
        }
        case 'absdiff':
          expr = `difference(${a}, ${b}, cv.absdiff)`;
          break;
        case 'xor':
          expr = `difference(${a}, ${b}, cv.bitwise_xor)`;
          break;
        case 'brightness':
          expr = `color_only(${a}, lambda rgb: np.clip(np.rint(rgb.astype(np.float64) * ${p.contrast} + ${p.brightness}), 0, 255).astype(np.uint8))`;
          break;
        case 'gamma':
          expr = `color_only(${a}, lambda rgb: cv.LUT(rgb, np.floor(np.power(np.arange(256) / 255.0, ${p.gamma}) * 255 + 0.5).astype(np.uint8)))`;
          break;
        case 'hue':
          expr = `hue_sat(${a}, ${p.hue}, ${p.saturation})`;
          break;
        case 'invert':
          expr = `color_only(${a}, lambda rgb: cv.bitwise_not(rgb))`;
          break;
        case 'gaussian':
          expr = `cv.GaussianBlur(${a}, (${p.kernel}, ${p.kernel}), ${p.sigma}, borderType=cv.BORDER_DEFAULT)`;
          break;
        case 'box':
          expr = `cv.blur(${a}, (${p.kernel}, ${p.kernel}), borderType=cv.BORDER_DEFAULT)`;
          break;
        case 'median':
          expr = `cv.medianBlur(${a}, ${p.kernel})`;
          break;
        case 'bilateral':
          expr = `color_only(${a}, lambda rgb: cv.bilateralFilter(rgb, ${p.diameter}, ${p.sigmaColor}, ${p.sigmaSpace}, borderType=cv.BORDER_DEFAULT))`;
          break;
        case 'threshold':
          expr = `cv.threshold(${a}, ${p.threshold}, 255, cv.${({ binary: 'THRESH_BINARY', 'binary-inverse': 'THRESH_BINARY_INV', truncate: 'THRESH_TRUNC', 'to-zero': 'THRESH_TOZERO' } as Record<string, string>)[p.method!]})[1]`;
          break;
        case 'adaptive':
          expr = `cv.adaptiveThreshold(${a}, 255, cv.ADAPTIVE_THRESH_${p.method === 'gaussian' ? 'GAUSSIAN_C' : 'MEAN_C'}, cv.THRESH_BINARY, ${p.kernel}, ${p.constant})`;
          break;
        case 'otsu':
          expr = `cv.threshold(${a}, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU)[1]`;
          break;
        case 'canny':
          expr = `cv.Canny(${a}, ${p.low}, ${p.high}, apertureSize=3, L2gradient=False)`;
          break;
        case 'sobel':
          expr = `cv.convertScaleAbs(cv.Sobel(${a}, cv.CV_16S, ${p.axis === 'x' ? 1 : 0}, ${p.axis === 'y' ? 1 : 0}, ksize=${p.kernel}, borderType=cv.BORDER_DEFAULT))`;
          break;
        case 'laplacian':
          expr = `cv.convertScaleAbs(cv.Laplacian(${a}, cv.CV_16S, ksize=${p.kernel}, borderType=cv.BORDER_DEFAULT))`;
          break;
        case 'erode':
        case 'dilate':
        case 'open':
        case 'close':
        case 'morph-gradient': {
          const k = `cv.getStructuringElement(cv.MORPH_${String(p.shape).toUpperCase()}, (${p.kernel}, ${p.kernel}))`;
          expr =
            n.operation === 'erode' || n.operation === 'dilate'
              ? `cv.${n.operation}(${a}, ${k}, iterations=${p.iterations})`
              : `cv.morphologyEx(${a}, cv.MORPH_${n.operation === 'morph-gradient' ? 'GRADIENT' : n.operation.toUpperCase()}, ${k}, iterations=${p.iterations})`;
          break;
        }
        case 'resize':
          expr = `cv.resize(${a}, (${p.width}, ${p.height}), interpolation=cv.INTER_${p.interpolation === 'linear' ? 'LINEAR_EXACT' : String(p.interpolation).toUpperCase()})`;
          break;
        case 'rotate':
          expr = `cv.warpAffine(${a}, cv.getRotationMatrix2D((${a}.shape[1]/2, ${a}.shape[0]/2), ${p.angle}, 1), (${a}.shape[1], ${a}.shape[0]), flags=cv.INTER_LINEAR, borderMode=cv.BORDER_CONSTANT)`;
          break;
        case 'flip':
          expr = `cv.flip(${a}, ${p.axis === 'horizontal' ? 1 : p.axis === 'vertical' ? 0 : -1})`;
          break;
        case 'blend':
          expr = `merge_images(${a}, ${b}, lambda a, b: cv.addWeighted(a, ${p.weight}, b, 1 - ${p.weight}, 0))`;
          break;
        case 'and':
        case 'or':
          expr = `merge_images(${a}, ${b}, lambda a, b: cv.bitwise_${n.operation}(a, b))`;
          break;
        default:
          throw new Error(`No Python generator for ${n.operation}`);
      }
    if (n.enabled && ['components', 'contours'].includes(n.operation)) {
      const measurementName = `objects_${names.get(n.id)!.slice(6)}`;
      lines.push(
        `${name}, ${measurementName} = ${expr}`,
        `save_measurements("measurements_${names.get(n.id)!.slice(6)}.csv", ${measurementName}, "${n.operation}")`,
        '',
      );
    } else lines.push(`${name} = ${expr}`, '');
  }
  const output = doc.preview.b ?? ordered.at(-1)?.id;
  if (output && names.has(output)) lines.push(`save_image("output.png", ${names.get(output)})`);
  return lines.join('\n') + '\n';
}

export function generateNodePython(doc: PipelineDocument, nodeId: string): string {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return '';
  const source = generatePython(doc);
  const index = topologicalOrder(doc).findIndex((n) => n.id === nodeId);
  const lines = source.split('\n');
  const start = lines.findIndex(
    (line) => line.startsWith(`image_${index} = `) || line.startsWith(`image_${index}, `),
  );
  const expression = start < 0 ? '' : lines.slice(start, lines.indexOf('', start)).join('\n');
  return `# ${node.label.replace(/[\r\n]/g, ' ')} — ${registry[node.operation]!.fn}\n${expression}`;
}
