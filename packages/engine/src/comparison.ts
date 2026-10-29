import { registry, parameterSchema } from '@opencv-weblab/pipeline';
import { execute, type CV } from './operations';
import type { WorkerRequest } from './index';

export async function compareVariants(
  cv: CV,
  request: Extract<WorkerRequest, { type: 'compare' }>,
  cancelled: () => boolean,
) {
  const { node, parameter, values, bitmap } = request;
  const def = registry[node.operation];
  if (!def || def.inputs !== 1 || node.operation === 'resize' || !node.enabled)
    throw new Error('Choose an enabled, single-input filter that keeps image dimensions.');
  if (!def.parameters.some((p) => p.key === parameter && !p.options) || values.length !== 3)
    throw new Error('Choose one numeric parameter and three valid values.');
  for (const value of values)
    parameterSchema(node.operation).parse({ ...node.parameters, [parameter]: value });
  if (bitmap.width * bitmap.height > 4096 * 4096) throw new Error('Comparison input is too large.');
  const downscale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * downscale));
  const height = Math.max(1, Math.round(bitmap.height * downscale));
  const scale = request.scale * downscale;
  const canvas = new OffscreenCanvas(width, height),
    ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const rgba = cv.matFromImageData(ctx.getImageData(0, 0, width, height));
  let input = rgba;
  const frames: { nodeId: string; bitmap: ImageBitmap }[] = [];
  const variants: { value: number; width: number; height: number; scale: number }[] = [];
  let delivered = false;
  try {
    if (request.mode === 'gray') {
      input = new cv.Mat();
      cv.cvtColor(rgba, input, cv.COLOR_RGBA2GRAY);
    }
    // Sequential on purpose: at most one operation's matrices exist at a time.
    for (const [index, value] of values.entries()) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled()) return null;
      const output = execute(
        cv,
        { ...node, parameters: { ...node.parameters, [parameter]: value } },
        [input],
        scale,
      );
      const render = new cv.Mat();
      try {
        if (output.channels() === 1) cv.cvtColor(output, render, cv.COLOR_GRAY2RGBA);
        else output.copyTo(render);
        ctx.putImageData(new ImageData(new Uint8ClampedArray(render.data), width, height), 0, 0);
        frames.push({ nodeId: `variant-${index}`, bitmap: canvas.transferToImageBitmap() });
        variants.push({ value, width, height, scale });
      } finally {
        output.delete();
        render.delete();
      }
    }
    if (cancelled()) return null;
    delivered = true;
    return { frames, variants };
  } finally {
    if (input !== rgba) input.delete();
    rgba.delete();
    if (!delivered) for (const f of frames) f.bitmap.close();
  }
}
