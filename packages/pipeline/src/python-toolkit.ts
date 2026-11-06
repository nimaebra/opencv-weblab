import type { PipelineNode } from './index';
export function toolkitExpression(
  node: PipelineNode,
  input: string,
  second?: string,
): string | undefined {
  const p = node.parameters;
  switch (node.operation) {
    case 'clahe':
      return `cv.createCLAHE(clipLimit=${p.clipLimit}, tileGridSize=(${p.tilesX}, ${p.tilesY})).apply(${input})`;
    case 'crop':
      return `crop_roi(${input}, ${p.left}, ${p.top}, ${p.right}, ${p.bottom})`;
    case 'perspective':
      return `rectify(${input}, [${['tl', 'tr', 'br', 'bl'].map((k) => `[${p[`${k}X`]}, ${p[`${k}Y`]}]`).join(', ')}], ${p.width}, ${p.height}, cv.INTER_${String(p.interpolation).toUpperCase()})`;
    case 'top-hat':
    case 'black-hat':
      return `cv.morphologyEx(${input}, cv.MORPH_${node.operation === 'top-hat' ? 'TOPHAT' : 'BLACKHAT'}, cv.getStructuringElement(cv.MORPH_${String(p.shape).toUpperCase()}, (${p.kernel}, ${p.kernel})), iterations=${p.iterations})`;
    case 'hough-lines':
      return `line_image(${input}, ${p.votes}, ${p.minLength}, ${p.maxGap})`;
    case 'hough-circles':
      return `circle_image(${input}, ${p.minDistance}, ${p.edgeThreshold}, ${p.accumulator}, ${p.minRadius}, ${p.maxRadius})`;
    case 'shi-tomasi':
      return `corner_image(${input}, ${p.maxCorners}, ${p.quality}, ${p.minDistance})`;
    case 'distance-transform':
      return `distance_image(${input}, cv.DIST_${({ euclidean: 'L2', manhattan: 'L1', chessboard: 'C' } as Record<string, string>)[String(p.metric)]})`;
    case 'color-map':
      return `cv.cvtColor(cv.applyColorMap(${input}, cv.COLORMAP_${String(p.palette).toUpperCase()}), cv.COLOR_BGR2RGBA)`;
    case 'template-match':
      return `template_match(${input}, ${second})`;
    case 'inpaint':
      return `inpaint_image(${input}, ${second}, ${p.radius}, cv.INPAINT_${p.method === 'telea' ? 'TELEA' : 'NS'})`;
    case 'flood-selection':
      return `flood_selection(${input}, ${p.seedX}, ${p.seedY}, ${p.tolerance}, ${p.connectivity})`;
    case 'pad': {
      const mode =
        p.border === 'replicate'
          ? 'REPLICATE'
          : p.border === 'reflect'
            ? 'REFLECT_101'
            : 'CONSTANT';
      return `cv.copyMakeBorder(${input}, ${p.padding}, ${p.padding}, ${p.padding}, ${p.padding}, cv.BORDER_${mode}, value=(0, 0, 0, 255))`;
    }
    case 'fourier-spectrum':
      return `fourier_spectrum(${input})`;
    default:
      return undefined;
  }
}
export const toolkitPython = `
def crop_roi(image, left, top, right, bottom):
    height, width = image.shape[:2]
    x0, y0 = int(np.floor(left * width / 100)), int(np.floor(top * height / 100))
    x1, y1 = int(np.ceil(right * width / 100)), int(np.ceil(bottom * height / 100))
    if not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
        raise ValueError("Use a nonempty crop inside the input")
    return image[y0:y1, x0:x1].copy()

def rectify(image, corners, width, height, interpolation):
    h, w = image.shape[:2]
    if w < 2 or h < 2: raise ValueError("Perspective correction needs an input at least 2x2 pixels")
    source = (np.asarray(corners, dtype=np.float64) * [(w-1)/100, (h-1)/100]).astype(np.float32)
    target = np.array([[0, 0], [width-1, 0], [width-1, height-1], [0, height-1]], dtype=np.float32)
    return cv.warpPerspective(image, cv.getPerspectiveTransform(source, target), (width, height), flags=interpolation, borderMode=cv.BORDER_CONSTANT, borderValue=0)

def detection_limit(values):
    if values is not None and len(values.reshape(-1, values.shape[-1])) > 10000:
        raise ValueError("More than 10,000 detections. Reduce noise or use a smaller image.")

def point(x, y):
    return (int(np.floor(float(x) + 0.5)), int(np.floor(float(y) + 0.5)))

def line_image(image, votes, minimum_length, maximum_gap):
    lines = cv.HoughLinesP(image.copy(), 1, np.pi/180, votes, minLineLength=minimum_length, maxLineGap=maximum_gap)
    detection_limit(lines)
    output = cv.cvtColor(image, cv.COLOR_GRAY2RGBA)
    if lines is not None:
        for x1, y1, x2, y2 in lines.reshape(-1, 4):
            cv.line(output, point(x1, y1), point(x2, y2), (0, 255, 0, 255), 1, cv.LINE_8)
    return output

def circle_image(image, separation, edge_threshold, accumulator, minimum_radius, maximum_radius):
    circles = cv.HoughCircles(image, cv.HOUGH_GRADIENT, 1, separation, param1=edge_threshold, param2=accumulator, minRadius=minimum_radius, maxRadius=maximum_radius)
    detection_limit(circles)
    output = cv.cvtColor(image, cv.COLOR_GRAY2RGBA)
    if circles is not None:
        for x, y, radius in circles.reshape(-1, 3):
            center = point(x, y)
            cv.circle(output, center, max(0, int(np.floor(float(radius)+0.5))), (0, 255, 0, 255), 1, cv.LINE_8)
            cv.circle(output, center, 2, (0, 255, 0, 255), -1, cv.LINE_8)
    return output

def corner_image(image, maximum, quality, separation):
    corners = cv.goodFeaturesToTrack(image, maximum, quality, separation)
    detection_limit(corners)
    output = cv.cvtColor(image, cv.COLOR_GRAY2RGBA)
    if corners is not None:
        for x, y in corners.reshape(-1, 2):
            cv.circle(output, point(x, y), 3, (0, 255, 0, 255), 1, cv.LINE_8)
    return output

def distance_image(image, metric):
    if np.all(image != 0):
        raise ValueError("Distance transform needs at least one zero background pixel. Add a threshold or invert the mask.")
    distances = cv.distanceTransform(image, metric, 3, dstType=cv.CV_32F)
    return cv.normalize(distances, None, 0, 255, cv.NORM_MINMAX, dtype=cv.CV_8U)

def template_match(image, template):
    height, width = template.shape
    if height > image.shape[0] or width > image.shape[1]:
        raise ValueError("Template must fit inside the search image on both axes.")
    response = cv.matchTemplate(image, template, cv.TM_SQDIFF)
    _, _, (x, y), _ = cv.minMaxLoc(response)
    output = cv.cvtColor(image, cv.COLOR_GRAY2RGBA)
    cv.rectangle(output, (x, y), (x + width - 1, y + height - 1), (0, 255, 0, 255), 1, cv.LINE_8)
    return output

def inpaint_image(image, mask, radius, method):
    if image.shape[:2] != mask.shape:
        raise ValueError("Image and mask must have identical dimensions.")
    selected = cv.countNonZero(mask)
    if not selected: return image.copy()
    if selected == mask.size:
        raise ValueError("Inpaint needs some unmasked pixels. Reduce the mask coverage.")
    if selected * (2 * radius + 1) ** 2 > 50000000:
        raise ValueError("Inpaint needs a smaller mask or radius for this image.")
    return color_only(image, lambda pixels: cv.inpaint(pixels, mask, radius, method))

def flood_selection(image, seed_x, seed_y, tolerance, connectivity):
    height, width = image.shape
    seed = point(seed_x * (width - 1) / 100, seed_y * (height - 1) / 100)
    mask = np.zeros((height + 2, width + 2), dtype=np.uint8)
    flags = connectivity | cv.FLOODFILL_FIXED_RANGE | cv.FLOODFILL_MASK_ONLY | (255 << 8)
    cv.floodFill(image, mask, seed, 0, loDiff=tolerance, upDiff=tolerance, flags=flags)
    return mask[1:-1, 1:-1].copy()

def fourier_spectrum(image):
    height, width = image.shape
    padded = cv.copyMakeBorder(image, 0, cv.getOptimalDFTSize(height) - height,
                              0, cv.getOptimalDFTSize(width) - width, cv.BORDER_CONSTANT)
    spectrum = cv.dft(padded.astype(np.float32), flags=cv.DFT_COMPLEX_OUTPUT)
    real, imaginary = spectrum[:, :, 0].astype(np.float64), spectrum[:, :, 1].astype(np.float64)
    magnitude = np.fft.fftshift(np.log1p(np.sqrt(real * real + imaginary * imaginary)).astype(np.float32))
    return cv.normalize(magnitude, None, 0, 255, cv.NORM_MINMAX, dtype=cv.CV_8U)
`;
