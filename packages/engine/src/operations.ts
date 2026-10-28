import { registry, parameterSchema, type PipelineNode } from '@roveran/pipeline';
// OpenCV's generated Embind surface has no official TS declarations. Keep it at this boundary.
export type CV = any;
export function scaledOdd(value: number, scale: number, min = 1): number {
  return Math.max(min, Math.round((value * scale - 1) / 2) * 2 + 1);
}
export function execute(cv: CV, node: PipelineNode, inputs: CV[], scale = 1): CV {
  const def = registry[node.operation];
  if (!def) throw new Error('Unsupported operation.');
  parameterSchema(node.operation).parse(node.parameters);
  const [src, b] = inputs;
  if (!src) throw new Error('Connect input A.');
  if (!node.enabled) return src.clone();
  const channels = src.channels();
  if (def.accepts === 'gray' && channels !== 1)
    throw new Error('Grayscale input required. Insert a Grayscale node.');
  if (def.accepts === 'rgba' && channels !== 4)
    throw new Error('Color input required. Connect a color source.');
  if (
    def.inputs === 2 &&
    (!b || b.rows !== src.rows || b.cols !== src.cols || b.type() !== src.type())
  )
    throw new Error('Inputs A and B must have identical dimensions and color mode.');
  const temp: CV[] = [];
  const mat = () => {
    const m = new cv.Mat();
    temp.push(m);
    return m;
  };
  const dst = new cv.Mat();
  const p = node.parameters;
  const n = (k: string) => Number(p[k]);
  const odd = (k: string, min = 1) => scaledOdd(n(k), scale, min);
  const colorOnly = (fn: (rgb: CV, out: CV) => void) => {
    if (channels === 1) {
      fn(src, dst);
      return;
    }
    const rgb = mat(),
      out = mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    fn(rgb, out);
    cv.cvtColor(out, dst, cv.COLOR_RGB2RGBA);
    for (let i = 3; i < dst.data.length; i += 4) dst.data[i] = src.data[i];
  };
  try {
    switch (node.operation) {
      case 'grayscale':
        if (channels === 1) src.copyTo(dst);
        else cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
        break;
      case 'brightness':
        colorOnly((rgb, out) => rgb.convertTo(out, -1, n('contrast'), n('brightness')));
        break;
      case 'gamma': {
        const lut = new cv.Mat(1, 256, cv.CV_8UC1);
        temp.push(lut);
        for (let i = 0; i < 256; i++) lut.data[i] = Math.round(Math.pow(i / 255, n('gamma')) * 255);
        colorOnly((rgb, out) => cv.LUT(rgb, lut, out));
        break;
      }
      case 'hue':
        colorOnly((rgb, out) => {
          const hsv = mat();
          cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
          for (let i = 0; i < hsv.data.length; i += 3) {
            hsv.data[i] = Math.trunc(hsv.data[i] + n('hue') / 2 + 180) % 180;
            hsv.data[i + 1] = Math.min(255, Math.round(hsv.data[i + 1] * n('saturation')));
          }
          cv.cvtColor(hsv, out, cv.COLOR_HSV2RGB);
        });
        break;
      case 'invert':
        colorOnly((rgb, out) => cv.bitwise_not(rgb, out));
        break;
      case 'gaussian':
        cv.GaussianBlur(
          src,
          dst,
          new cv.Size(odd('kernel'), odd('kernel')),
          n('sigma') * scale,
          n('sigma') * scale,
          cv.BORDER_DEFAULT,
        );
        break;
      case 'box':
        cv.blur(
          src,
          dst,
          new cv.Size(odd('kernel'), odd('kernel')),
          new cv.Point(-1, -1),
          cv.BORDER_DEFAULT,
        );
        break;
      case 'median': {
        const k = odd('kernel');
        if (k === 1) src.copyTo(dst);
        else cv.medianBlur(src, dst, k);
        break;
      }
      case 'bilateral':
        colorOnly((rgb, out) =>
          cv.bilateralFilter(
            rgb,
            out,
            odd('diameter'),
            n('sigmaColor'),
            n('sigmaSpace') * scale,
            cv.BORDER_DEFAULT,
          ),
        );
        break;
      case 'threshold':
        cv.threshold(
          src,
          dst,
          n('threshold'),
          255,
          (
            {
              binary: cv.THRESH_BINARY,
              'binary-inverse': cv.THRESH_BINARY_INV,
              truncate: cv.THRESH_TRUNC,
              'to-zero': cv.THRESH_TOZERO,
            } as Record<string, number>
          )[p.method!],
        );
        break;
      case 'adaptive':
        cv.adaptiveThreshold(
          src,
          dst,
          255,
          p.method === 'gaussian' ? cv.ADAPTIVE_THRESH_GAUSSIAN_C : cv.ADAPTIVE_THRESH_MEAN_C,
          cv.THRESH_BINARY,
          odd('kernel', 3),
          n('constant'),
        );
        break;
      case 'otsu':
        cv.threshold(src, dst, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
        break;
      case 'canny':
        cv.Canny(src, dst, n('low'), n('high'), 3, false);
        break;
      case 'sobel':
      case 'laplacian': {
        const gradient = mat();
        if (node.operation === 'sobel')
          cv.Sobel(
            src,
            gradient,
            cv.CV_16S,
            p.axis === 'x' ? 1 : 0,
            p.axis === 'y' ? 1 : 0,
            odd('kernel'),
            1,
            0,
            cv.BORDER_DEFAULT,
          );
        else cv.Laplacian(src, gradient, cv.CV_16S, odd('kernel'), 1, 0, cv.BORDER_DEFAULT);
        cv.convertScaleAbs(gradient, dst);
        break;
      }
      case 'erode':
      case 'dilate':
      case 'open':
      case 'close': {
        const kernel = cv.getStructuringElement(
          (
            { ellipse: cv.MORPH_ELLIPSE, rect: cv.MORPH_RECT, cross: cv.MORPH_CROSS } as Record<
              string,
              number
            >
          )[p.shape!],
          new cv.Size(odd('kernel'), odd('kernel')),
        );
        temp.push(kernel);
        const border = cv.morphologyDefaultBorderValue();
        if (node.operation === 'erode' || node.operation === 'dilate')
          cv[node.operation](
            src,
            dst,
            kernel,
            new cv.Point(-1, -1),
            n('iterations'),
            cv.BORDER_CONSTANT,
            border,
          );
        else
          cv.morphologyEx(
            src,
            dst,
            node.operation === 'open' ? cv.MORPH_OPEN : cv.MORPH_CLOSE,
            kernel,
            new cv.Point(-1, -1),
            n('iterations'),
            cv.BORDER_CONSTANT,
            border,
          );
        break;
      }
      case 'resize':
        cv.resize(
          src,
          dst,
          new cv.Size(
            Math.max(1, Math.round(n('width') * scale)),
            Math.max(1, Math.round(n('height') * scale)),
          ),
          0,
          0,
          (
            {
              linear: cv.INTER_LINEAR_EXACT,
              nearest: cv.INTER_NEAREST,
              area: cv.INTER_AREA,
              cubic: cv.INTER_CUBIC,
            } as Record<string, number>
          )[p.interpolation!],
        );
        break;
      case 'rotate': {
        const transform = cv.getRotationMatrix2D(
          new cv.Point(src.cols / 2, src.rows / 2),
          n('angle'),
          1,
        );
        temp.push(transform);
        cv.warpAffine(
          src,
          dst,
          transform,
          new cv.Size(src.cols, src.rows),
          cv.INTER_LINEAR,
          cv.BORDER_CONSTANT,
          new cv.Scalar(0, 0, 0, 0),
        );
        break;
      }
      case 'flip':
        cv.flip(src, dst, p.axis === 'horizontal' ? 1 : p.axis === 'vertical' ? 0 : -1);
        break;
      case 'blend':
        cv.addWeighted(src, n('weight'), b, 1 - n('weight'), 0, dst);
        break;
      case 'and':
      case 'or':
        cv[`bitwise_${node.operation}`](src, b, dst);
        break;
      default:
        throw new Error(`No implementation for ${node.operation}`);
    }
    return dst;
  } catch (error) {
    dst.delete();
    throw error;
  } finally {
    for (const m of temp) m.delete();
  }
}
