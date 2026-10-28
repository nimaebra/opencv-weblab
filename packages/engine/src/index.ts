import type { PipelineDocument, ImageMode } from '@roveran/pipeline';
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
};
export type WorkerRequest =
  | { type: 'init' }
  | { type: 'sources'; sources: { id: string; blob: Blob }[] }
  | { type: 'evaluate'; revision: number; document: PipelineDocument }
  | { type: 'export'; revision: number; document: PipelineDocument; target: string }
  | { type: 'dispose' };
export type WorkerResponse =
  | { type: 'ready'; version: string }
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
export { execute, scaledOdd } from './operations';
