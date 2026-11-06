import { cropBounds, perspectiveCorners, type PipelineNode } from '@opencv-weblab/pipeline';
import type { CV } from './operations';
import { scaledOdd } from './spatial';
import { MAX_OBJECTS } from './measurements';

export const toolkitOperations = new Set([
  'clahe',
  'crop',
  'perspective',
  'hough-lines',
  'hough-circles',
  'top-hat',
  'black-hat',
  'shi-tomasi',
  'distance-transform',
  'color-map',
  'template-match',
  'inpaint',
  'flood-selection',
  'pad',
  'fourier-spectrum',
]);
const MAX_INPAINT_WORK = 50_000_000;
export function executeToolkit(
  cv: CV,
  node: PipelineNode,
  src: CV,
  second: CV,
  scale: number,
  available: number,
): CV {
  const p = node.parameters;
  const n = (key: string) => Number(p[key]);
  const pixels = src.rows * src.cols;
  const width = Math.max(1, Math.round(n('width') * scale));
  const height = Math.max(1, Math.round(n('height') * scale));
  const padding = node.operation === 'pad' ? Math.round(n('padding') * scale) : 0;
  const spectrumWidth = node.operation === 'fourier-spectrum' ? cv.getOptimalDFTSize(src.cols) : 0;
  const spectrumHeight = node.operation === 'fourier-spectrum' ? cv.getOptimalDFTSize(src.rows) : 0;
  const selected = node.operation === 'inpaint' ? cv.countNonZero(second) : 0;
  const radius = node.operation === 'inpaint' ? Math.max(1, Math.round(n('radius') * scale)) : 0;
  if (node.operation === 'inpaint') {
    if (selected === pixels)
      throw new Error('Inpaint needs some unmasked pixels. Reduce the mask coverage.');
    // Bound neighborhood visits before the synchronous WASM call.
    if (selected * (2 * radius + 1) ** 2 > MAX_INPAINT_WORK)
      throw new Error('Inpaint needs a smaller mask or radius for this image.');
  }
  // Allow for float maps, derivatives, accumulators, output and drawing buffers.
  // HoughLinesP also needs a rho/theta accumulator (one-degree theta bins).
  let scratch = 64 * 1024;
  if (node.operation === 'crop' || (node.operation === 'inpaint' && selected === 0)) {
    scratch = pixels * src.elemSize();
  } else if (node.operation === 'pad') {
    const paddedWidth = src.cols + 2 * padding;
    scratch += paddedWidth * (src.rows + 2 * padding + 4) * src.elemSize();
  } else if (node.operation === 'fourier-spectrum') {
    scratch += spectrumWidth * spectrumHeight * 48;
  } else {
    scratch +=
      pixels * (node.operation === 'hough-circles' ? 96 : 48) +
      (node.operation === 'clahe' ? n('tilesX') * n('tilesY') * 1024 : 0) +
      (node.operation === 'hough-lines'
        ? Math.ceil(Math.hypot(src.cols, src.rows)) * 2 * 180 * 4
        : 0) +
      (node.operation === 'perspective' ? width * height * src.elemSize() : 0) +
      (node.operation === 'template-match' ? second.rows * second.cols * 16 : 0) +
      (node.operation.startsWith('hough-') || node.operation === 'shi-tomasi'
        ? MAX_OBJECTS * 128
        : 0);
  }
  if (scratch > available)
    throw new Error(
      'This operation needs too much working memory. Use a smaller image or fewer branches.',
    );
  const temp: CV[] = [];
  const keep = (value: CV) => {
    temp.push(value);
    return value;
  };
  const mat = () => keep(new cv.Mat());
  const dst = new cv.Mat();
  const point = (x: number, y: number) => new cv.Point(Math.floor(x + 0.5), Math.floor(y + 0.5));
  const green = new cv.Scalar(0, 255, 0, 255);
  const limit = (count: number) => {
    if (count > MAX_OBJECTS)
      throw new Error('More than 10,000 detections. Reduce noise or use a smaller image.');
  };
  try {
    switch (node.operation) {
      case 'clahe': {
        const clahe = keep(new cv.CLAHE(n('clipLimit'), new cv.Size(n('tilesX'), n('tilesY'))));
        clahe.apply(src, dst);
        break;
      }
      case 'crop': {
        const rect = cropBounds(p, src.cols, src.rows);
        const roi = keep(src.roi(new cv.Rect(rect.x, rect.y, rect.width, rect.height)));
        roi.copyTo(dst);
        break;
      }
      case 'perspective': {
        if (src.cols < 2 || src.rows < 2)
          throw new Error(
            'Perspective correction needs an input at least 2×2 pixels. Use full-resolution preview for very small images.',
          );
        const corners = perspectiveCorners(p, src.cols, src.rows);
        const from = keep(
          cv.matFromArray(
            4,
            1,
            cv.CV_32FC2,
            corners.flatMap(({ x, y }) => [x, y]),
          ),
        );
        const to = keep(
          cv.matFromArray(4, 1, cv.CV_32FC2, [
            0,
            0,
            width - 1,
            0,
            width - 1,
            height - 1,
            0,
            height - 1,
          ]),
        );
        const transform = keep(cv.getPerspectiveTransform(from, to));
        cv.warpPerspective(
          src,
          dst,
          transform,
          new cv.Size(width, height),
          p.interpolation === 'nearest' ? cv.INTER_NEAREST : cv.INTER_LINEAR,
          cv.BORDER_CONSTANT,
          new cv.Scalar(0, 0, 0, 0),
        );
        break;
      }
      case 'top-hat':
      case 'black-hat': {
        const kernel = keep(
          cv.getStructuringElement(
            (
              { ellipse: cv.MORPH_ELLIPSE, rect: cv.MORPH_RECT, cross: cv.MORPH_CROSS } as Record<
                string,
                number
              >
            )[String(p.shape)],
            new cv.Size(scaledOdd(n('kernel'), scale), scaledOdd(n('kernel'), scale)),
          ),
        );
        cv.morphologyEx(
          src,
          dst,
          node.operation === 'top-hat' ? cv.MORPH_TOPHAT : cv.MORPH_BLACKHAT,
          kernel,
          new cv.Point(-1, -1),
          n('iterations'),
          cv.BORDER_CONSTANT,
          cv.morphologyDefaultBorderValue(),
        );
        break;
      }
      case 'hough-lines': {
        const input = keep(src.clone()),
          lines = mat();
        cv.HoughLinesP(
          input,
          lines,
          1,
          Math.PI / 180,
          Math.max(1, Math.round(n('votes') * scale)),
          n('minLength') * scale,
          n('maxGap') * scale,
        );
        limit(lines.rows);
        cv.cvtColor(src, dst, cv.COLOR_GRAY2RGBA);
        for (let i = 0; i < lines.data32S.length; i += 4)
          cv.line(
            dst,
            point(lines.data32S[i], lines.data32S[i + 1]),
            point(lines.data32S[i + 2], lines.data32S[i + 3]),
            green,
            1,
            cv.LINE_8,
          );
        break;
      }
      case 'hough-circles': {
        const circles = mat();
        const minRadius = Math.max(0, Math.round(n('minRadius') * scale));
        const maxRadius =
          n('maxRadius') === 0 ? 0 : Math.max(1, minRadius, Math.round(n('maxRadius') * scale));
        cv.HoughCircles(
          src,
          circles,
          cv.HOUGH_GRADIENT,
          1,
          Math.max(1, n('minDistance') * scale),
          n('edgeThreshold'),
          n('accumulator'),
          minRadius,
          maxRadius,
        );
        limit(circles.cols);
        cv.cvtColor(src, dst, cv.COLOR_GRAY2RGBA);
        for (let i = 0; i < circles.data32F.length; i += 3) {
          const center = point(circles.data32F[i], circles.data32F[i + 1]);
          cv.circle(
            dst,
            center,
            Math.max(0, Math.floor(circles.data32F[i + 2] + 0.5)),
            green,
            1,
            cv.LINE_8,
          );
          cv.circle(dst, center, 2, green, -1, cv.LINE_8);
        }
        break;
      }
      case 'shi-tomasi': {
        const corners = mat();
        cv.goodFeaturesToTrack(
          src,
          corners,
          n('maxCorners'),
          n('quality'),
          Math.max(1, n('minDistance') * scale),
        );
        limit(corners.rows);
        cv.cvtColor(src, dst, cv.COLOR_GRAY2RGBA);
        for (let i = 0; i < corners.data32F.length; i += 2)
          cv.circle(dst, point(corners.data32F[i], corners.data32F[i + 1]), 3, green, 1, cv.LINE_8);
        break;
      }
      case 'distance-transform': {
        if (cv.countNonZero(src) === pixels)
          throw new Error(
            'Distance transform needs at least one zero background pixel. Add a threshold or invert the mask.',
          );
        const distances = mat();
        cv.distanceTransform(
          src,
          distances,
          (
            { euclidean: cv.DIST_L2, manhattan: cv.DIST_L1, chessboard: cv.DIST_C } as Record<
              string,
              number
            >
          )[String(p.metric)],
          3,
          cv.CV_32F,
        );
        cv.normalize(distances, dst, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
        break;
      }
      case 'color-map': {
        const bgr = mat();
        cv.applyColorMap(
          src,
          bgr,
          (
            {
              viridis: cv.COLORMAP_VIRIDIS,
              cividis: cv.COLORMAP_CIVIDIS,
              turbo: cv.COLORMAP_TURBO,
            } as Record<string, number>
          )[String(p.palette)],
        );
        cv.cvtColor(bgr, dst, cv.COLOR_BGR2RGBA);
        break;
      }
      case 'template-match': {
        const response = mat();
        cv.matchTemplate(src, second, response, cv.TM_SQDIFF);
        const { minLoc } = cv.minMaxLoc(response);
        cv.cvtColor(src, dst, cv.COLOR_GRAY2RGBA);
        cv.rectangle(
          dst,
          minLoc,
          point(minLoc.x + second.cols - 1, minLoc.y + second.rows - 1),
          green,
          1,
          cv.LINE_8,
        );
        break;
      }
      case 'inpaint': {
        if (selected === 0) {
          src.copyTo(dst);
          break;
        }
        const method = p.method === 'telea' ? cv.INPAINT_TELEA : cv.INPAINT_NS;
        if (src.channels() === 1) cv.inpaint(src, second, dst, radius, method);
        else {
          const rgb = mat(),
            repaired = mat();
          cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
          cv.inpaint(rgb, second, repaired, radius, method);
          cv.cvtColor(repaired, dst, cv.COLOR_RGB2RGBA);
          const original = src.data,
            output = dst.data;
          for (let i = 3; i < output.length; i += 4) output[i] = original[i];
        }
        break;
      }
      case 'flood-selection': {
        const mask = keep(cv.Mat.zeros(src.rows + 2, src.cols + 2, cv.CV_8UC1));
        const seed = point(
          (n('seedX') * (src.cols - 1)) / 100,
          (n('seedY') * (src.rows - 1)) / 100,
        );
        const tolerance = new cv.Scalar(n('tolerance'));
        const flags =
          n('connectivity') | cv.FLOODFILL_FIXED_RANGE | cv.FLOODFILL_MASK_ONLY | (255 << 8);
        cv.floodFill(src, mask, seed, new cv.Scalar(0), new cv.Rect(), tolerance, tolerance, flags);
        const region = keep(mask.roi(new cv.Rect(1, 1, src.cols, src.rows)));
        region.copyTo(dst);
        break;
      }
      case 'pad':
        cv.copyMakeBorder(
          src,
          dst,
          padding,
          padding,
          padding,
          padding,
          p.border === 'replicate'
            ? cv.BORDER_REPLICATE
            : p.border === 'reflect'
              ? cv.BORDER_REFLECT_101
              : cv.BORDER_CONSTANT,
          new cv.Scalar(0, 0, 0, 255),
        );
        break;
      case 'fourier-spectrum': {
        const padded = mat(),
          real = mat(),
          spectrum = mat(),
          magnitude = mat();
        cv.copyMakeBorder(
          src,
          padded,
          0,
          spectrumHeight - src.rows,
          0,
          spectrumWidth - src.cols,
          cv.BORDER_CONSTANT,
          new cv.Scalar(0),
        );
        padded.convertTo(real, cv.CV_32F);
        cv.dft(real, spectrum, cv.DFT_COMPLEX_OUTPUT);
        magnitude.create(spectrumHeight, spectrumWidth, cv.CV_32FC1);
        const complex = spectrum.data32F,
          centered = magnitude.data32F;
        const shiftX = Math.floor(spectrumWidth / 2),
          shiftY = Math.floor(spectrumHeight / 2);
        for (let y = 0; y < spectrumHeight; y++) {
          const row = y * spectrumWidth;
          const shiftedRow = ((y + shiftY) % spectrumHeight) * spectrumWidth;
          for (let x = 0; x < spectrumWidth; x++) {
            const index = 2 * (row + x);
            const real = complex[index],
              imaginary = complex[index + 1];
            centered[shiftedRow + ((x + shiftX) % spectrumWidth)] = Math.log1p(
              Math.sqrt(real * real + imaginary * imaginary),
            );
          }
        }
        cv.normalize(magnitude, dst, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
        break;
      }
      default:
        throw new Error('Unsupported toolkit operation.');
    }
    return dst;
  } catch (error) {
    dst.delete();
    throw error;
  } finally {
    for (const value of temp.reverse()) value.delete();
  }
}
