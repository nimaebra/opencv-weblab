import type { PipelineDocument, ImageMode } from '@roveran/pipeline';
import type { PipelineNode } from '@roveran/pipeline';
import type { PixelExplanation } from './learning';
import type { Measurements } from './measurements';
export { measurementsCsv } from './measurements';
export type {
  Measurements,
  ComponentRow,
  ContourRow,
  Bounds,
  OperationResult,
} from './measurements';
export { previewScale, explanationKernel, explanationRegion, reflect101 } from './learning';
export type { PixelExplanation } from './learning';
export type EvaluationStats = {
  elapsed: number;
  computed: number;
  cached: number;
  cacheBytes: number;
  liveMatrices: number;
  heapBytes: number;
};
export type NodeResult = {
  nodeId: string;
  width: number;
  height: number;
  mode: ImageMode;
  elapsed: number;
  cached: boolean;
  measurements?: Measurements;
};
export type WorkerRequest =
  | { type: 'init' }
  | { type: 'sources'; sources: { id: string; blob: Blob }[] }
  | { type: 'evaluate'; revision: number; document: PipelineDocument }
  | { type: 'export'; revision: number; document: PipelineDocument; target: string }
  | {
      type: 'measure';
      revision: number;
      requestId: number;
      document: PipelineDocument;
      nodeId: string;
    }
  | { type: 'cancel-measure' }
  | {
      type: 'analyze';
      revision: number;
      requestId: number;
      nodeId: string;
      bitmap: ImageBitmap;
      mode: ImageMode;
    }
  | {
      type: 'sample';
      revision: number;
      requestId: number;
      analysisId: number;
      nodeId: string;
      x: number;
      y: number;
    }
  | { type: 'clear-analysis' }
  | { type: 'cancel-study' }
  | {
      type: 'explain';
      revision: number;
      requestId: number;
      analysisId: number;
      node: PipelineNode;
      scale: number;
      x: number;
      y: number;
      width: number;
      height: number;
      left: number;
      top: number;
      bitmap: ImageBitmap;
    }
  | {
      type: 'compare';
      revision: number;
      requestId: number;
      node: PipelineNode;
      parameter: string;
      values: number[];
      scale: number;
      mode: ImageMode;
      bitmap: ImageBitmap;
    }
  | { type: 'dispose' };
export type WorkerResponse =
  | {
      type: 'measured';
      revision: number;
      requestId: number;
      nodeId: string;
      measurements: Measurements;
      bitmap: ImageBitmap;
    }
  | { type: 'measure-error'; revision: number; requestId: number; nodeId: string; message: string }
  | { type: 'ready'; version: string }
  | { type: 'explanation'; revision: number; requestId: number; explanation: PixelExplanation }
  | {
      type: 'comparison';
      revision: number;
      requestId: number;
      nodeId: string;
      parameter: string;
      frames: { nodeId: string; bitmap: ImageBitmap }[];
      variants: { value: number; width: number; height: number; scale: number }[];
    }
  | {
      type: 'study-error';
      kind: 'explain' | 'compare';
      revision: number;
      requestId: number;
      message: string;
    }
  | {
      type: 'analysis';
      revision: number;
      requestId: number;
      nodeId: string;
      histograms: number[][];
    }
  | {
      type: 'pixel';
      revision: number;
      requestId: number;
      nodeId: string;
      x: number;
      y: number;
      values: number[];
    }
  | {
      type: 'result';
      revision: number;
      nodes: NodeResult[];
      errors: Record<string, string>;
      stats: EvaluationStats;
      frames: { nodeId: string; bitmap: ImageBitmap }[];
    }
  | { type: 'exported'; revision: number; blob: Blob }
  | { type: 'error'; revision?: number; message: string };
/** Frames stay in this imperative store, outside React and Zustand. */
export class FrameStore {
  private frames = new Map<string, ImageBitmap>();
  private listeners = new Set<() => void>();
  get(id: string | null) {
    return id ? this.frames.get(id) : undefined;
  }
  replace(frames: { nodeId: string; bitmap: ImageBitmap }[]) {
    const incoming = new Map(frames.map((f) => [f.nodeId, f.bitmap]));
    for (const frame of this.frames.values()) frame.close();
    this.frames = incoming;
    for (const listener of this.listeners) listener();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  clear() {
    this.replace([]);
  }
}
export { execute, executeResult, scaledOdd } from './operations';
