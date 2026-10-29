import {
  topologicalOrder,
  validateGraph,
  OPENCV_VERSION,
  type PipelineDocument,
} from '@roveran/pipeline';
import { executeResult, type CV } from './operations';
import { WORKING_BYTES, type Measurements } from './measurements';
import type { NodeResult, EvaluationStats } from './index';
import { previewScale } from './learning';
type Entry = { mat: CV; measurements?: Measurements; key: string; bytes: number; used: number };
export class Evaluator {
  private cache = new Map<string, Entry>();
  private blobs = new Map<string, { blob: Blob; version: number }>();
  private bytes = 0;
  private clock = 0;
  constructor(
    private cv: CV,
    private maxBytes = 128 * 1024 * 1024,
  ) {}
  setSources(sources: { id: string; blob: Blob }[]) {
    const next = new Map<string, { blob: Blob; version: number }>();
    for (const { id, blob } of sources) {
      const old = this.blobs.get(id);
      next.set(id, { blob, version: (old?.version ?? 0) + 1 });
    }
    this.blobs = next;
    this.clearCache();
  }
  clearCache() {
    for (const e of this.cache.values()) e.mat.delete();
    this.cache.clear();
    this.bytes = 0;
  }
  dispose() {
    this.clearCache();
    this.blobs.clear();
  }
  private evict(pinned: Set<string>) {
    for (const [key, entry] of [...this.cache].sort((a, b) => a[1].used - b[1].used)) {
      if (this.bytes <= this.maxBytes) break;
      if (!pinned.has(key)) {
        entry.mat.delete();
        this.bytes -= entry.bytes;
        this.cache.delete(key);
      }
    }
  }
  async source(id: string, scale: number) {
    const record = this.blobs.get(id);
    if (!record) throw new Error('Reconnect the original image to continue.');
    const bitmap = await createImageBitmap(record.blob, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
      premultiplyAlpha: 'none',
    });
    try {
      const width = Math.max(1, Math.round(bitmap.width * scale)),
        height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, width, height);
      return this.cv.matFromImageData(ctx.getImageData(0, 0, width, height));
    } finally {
      bitmap.close();
    }
  }
  async evaluate(
    doc: PipelineDocument,
    cancelled: () => boolean = () => false,
    full = false,
    target?: string,
    measurementFrame = false,
  ) {
    const start = performance.now();
    const order = topologicalOrder(doc);
    const errors: Record<string, string> = {};
    for (const issue of validateGraph(doc)) if (issue.nodeId) errors[issue.nodeId] = issue.message;
    const scale = full ? 1 : previewScale(doc);
    const results = new Map<string, Entry>();
    const nodes: NodeResult[] = [];
    let computed = 0,
      cached = 0;
    const pinned = new Set<string>();
    const needed = new Set<string>();
    if (target) {
      const visit = (id: string) => {
        if (needed.has(id)) return;
        needed.add(id);
        for (const e of doc.edges) if (e.target === id) visit(e.source);
      };
      visit(target);
    } else for (const n of doc.nodes) needed.add(n.id);
    const remaining = new Map<string, number>();
    const frames: { nodeId: string; bitmap: ImageBitmap }[] = [];
    let delivered = false;
    for (const e of doc.edges)
      if (needed.has(e.target)) remaining.set(e.source, (remaining.get(e.source) ?? 0) + 1);
    try {
      for (const node of order) {
        if (!needed.has(node.id)) continue;
        if (cancelled()) return null;
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled()) return null;
        const begin = performance.now();
        const edges = doc.edges
          .filter((e) => e.target === node.id && (node.enabled || e.input === 0))
          .sort((a, b) => a.input - b.input);
        if (edges.some((e) => errors[e.source] || !results.has(e.source)))
          errors[node.id] = 'Waiting for a valid upstream result.';
        if (errors[node.id]) continue;
        const inputs = edges.map((e) => results.get(e.source)!);
        const description = JSON.stringify([
          OPENCV_VERSION,
          node.operation,
          node.operationVersion,
          node.enabled,
          node.parameters,
          scale,
          node.sourceId ? this.blobs.get(node.sourceId)?.version : null,
          node.sourceId,
          inputs.map((e) => e.key),
        ]);
        const key = [
          ...new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(description)),
          ),
        ]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('');
        if (cancelled()) return null;
        let entry = full ? undefined : this.cache.get(key);
        const hit = !!entry;
        try {
          if (!entry) {
            const working = [...new Set(results.values())].reduce((sum, e) => sum + e.bytes, 0);
            const execution =
              node.operation === 'source'
                ? { mat: await this.source(node.sourceId!, scale), measurements: undefined }
                : executeResult(
                    this.cv,
                    node,
                    inputs.map((e) => e.mat),
                    scale,
                    WORKING_BYTES - working,
                  );
            const { mat, measurements } = execution;
            entry = {
              mat,
              measurements,
              key,
              bytes:
                mat.rows * mat.cols * mat.elemSize() +
                (measurements
                  ? new TextEncoder().encode(JSON.stringify(measurements)).byteLength
                  : 0),
              used: ++this.clock,
            };
            if (working + entry.bytes > WORKING_BYTES) {
              mat.delete();
              throw new Error(
                'This graph needs too much working memory. Use a smaller image or fewer branches.',
              );
            }
            computed++;
            if (!full) {
              this.cache.set(key, entry);
              this.bytes += entry.bytes;
            }
          } else {
            entry.used = ++this.clock;
            cached++;
          }
          results.set(node.id, entry);
          pinned.add(key);
          nodes.push({
            nodeId: node.id,
            width: entry.mat.cols,
            height: entry.mat.rows,
            mode: entry.mat.channels() === 1 ? 'gray' : 'rgba',
            elapsed: performance.now() - begin,
            cached: hit,
            measurements: entry.measurements,
          });
        } catch (error) {
          errors[node.id] =
            typeof error === 'number'
              ? `OpenCV rejected these parameters (${error}).`
              : error instanceof Error
                ? error.message
                : String(error);
        }
        if (full) {
          for (const e of edges) {
            const count = remaining.get(e.source)! - 1;
            remaining.set(e.source, count);
            if (count === 0 && e.source !== target) {
              results.get(e.source)?.mat.delete();
              results.delete(e.source);
            }
          }
        }
      }
      if (cancelled()) return null;
      let blob: Blob | undefined;
      for (const [id, e] of results) {
        if (full && id !== target) continue;
        const m = e.mat;
        const rgba = new this.cv.Mat();
        try {
          if (m.channels() === 1) this.cv.cvtColor(m, rgba, this.cv.COLOR_GRAY2RGBA);
          else m.copyTo(rgba);
          const canvas = new OffscreenCanvas(m.cols, m.rows);
          const ctx = canvas.getContext('2d')!;
          ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), m.cols, m.rows), 0, 0);
          if (full && !measurementFrame) blob = await canvas.convertToBlob({ type: 'image/png' });
          else frames.push({ nodeId: id, bitmap: canvas.transferToImageBitmap() });
        } finally {
          rgba.delete();
        }
      }
      this.evict(new Set());
      const stats: EvaluationStats = {
        elapsed: performance.now() - start,
        computed,
        cached,
        cacheBytes: this.bytes,
        liveMatrices: this.cache.size,
        heapBytes: this.cv.HEAPU8?.buffer.byteLength ?? 0,
      };
      delivered = true;
      return { nodes, errors, stats, frames, blob };
    } finally {
      if (!delivered) for (const frame of frames) frame.bitmap.close();
      if (full) for (const e of new Set(results.values())) e.mat.delete();
      else this.evict(new Set());
    }
  }
}
