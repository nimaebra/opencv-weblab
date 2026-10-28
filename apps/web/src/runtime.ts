import { create } from 'zustand';
import {
  FrameStore,
  type NodeResult,
  type WorkerResponse,
  type WorkerRequest,
  type EvaluationStats,
} from '@roveran/engine';
import { executionSignature, type PipelineDocument } from '@roveran/pipeline';
import { resolveAssets, download } from './persistence';
export const frames = new FrameStore();
export const useRuntime = create<{
  status: 'loading' | 'ready' | 'processing' | 'exporting' | 'error';
  message: string;
  nodes: Record<string, NodeResult>;
  errors: Record<string, string>;
  stats: EvaluationStats | null;
}>(() => ({ status: 'loading', message: 'Loading OpenCV…', nodes: {}, errors: {}, stats: null }));
let worker: Worker | undefined,
  revision = 0,
  sourceSignature = '',
  latest: PipelineDocument | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  watchdog: ReturnType<typeof setTimeout> | undefined;
let ready = false;
let assetGeneration = 0;
function post(message: WorkerRequest) {
  worker?.postMessage(message);
}
function armTimeout() {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    worker?.terminate();
    ready = false;
    useRuntime.setState({
      status: 'error',
      message: 'Processing took too long. Restart the engine; your project is saved.',
    });
  }, 60000);
}
export function startRuntime() {
  if (worker) return;
  ready = false;
  sourceSignature = '';
  worker = new Worker('/engine-worker.js');
  armTimeout();
  worker.onerror = (event) => {
    clearTimeout(watchdog);
    ready = false;
    useRuntime.setState({
      status: 'error',
      message: event.message || 'The processing engine stopped. Restart to continue.',
    });
  };
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    if (msg.type === 'ready') {
      clearTimeout(watchdog);
      ready = true;
      useRuntime.setState({ status: 'ready', message: `OpenCV ${msg.version} ready` });
      if (latest) void evaluate(latest, true);
    } else if (msg.type === 'result') {
      if (msg.revision !== revision) {
        for (const f of msg.frames) f.bitmap.close();
        return;
      }
      clearTimeout(watchdog);
      frames.replace(msg.frames);
      useRuntime.setState({
        status: 'ready',
        message: 'Preview up to date',
        nodes: Object.fromEntries(msg.nodes.map((n) => [n.nodeId, n])),
        errors: msg.errors,
        stats: msg.stats,
      });
      window.dispatchEvent(new CustomEvent('roveran-evaluated', { detail: msg.stats }));
    } else if (msg.type === 'exported') {
      clearTimeout(watchdog);
      download(`${latest?.name ?? 'roveran'}.png`, msg.blob);
      useRuntime.setState({ status: 'ready', message: 'Full-resolution PNG exported' });
      if (latest) void evaluate(latest);
    } else {
      if (msg.revision !== undefined && msg.revision !== revision) return;
      clearTimeout(watchdog);
      useRuntime.setState({ status: 'error', message: msg.message });
    }
  };
  post({ type: 'init' });
}
export async function evaluate(document: PipelineDocument, reloadSources = false) {
  latest = document;
  const signature = executionSignature(document);
  clearTimeout(timer);
  const requested = ++revision;
  if (!ready) return;
  const generation = assetGeneration;
  const ids = JSON.stringify(document.sources.map((s) => [s.id, s.builtin]));
  if (ids !== sourceSignature || reloadSources) {
    const sources = await resolveAssets(document);
    if (requested !== revision || generation !== assetGeneration) return;
    post({ type: 'sources', sources });
    sourceSignature = ids;
  }
  if (requested !== revision) return;
  timer = setTimeout(() => {
    if (requested !== revision || signature !== executionSignature(latest!)) return;
    useRuntime.setState({ status: 'processing', message: 'Updating preview…' });
    armTimeout();
    post({ type: 'evaluate', revision: requested, document });
  }, 24);
}
export function exportImage(document: PipelineDocument) {
  latest = document;
  if (!ready) {
    useRuntime.setState({ message: 'The engine must finish loading before export.' });
    return;
  }
  const target = document.preview.b ?? document.nodes.at(-1)?.id;
  if (!target) return;
  clearTimeout(timer);
  revision++;
  useRuntime.setState({ status: 'exporting', message: 'Rendering full-resolution PNG…' });
  armTimeout();
  post({ type: 'export', revision, document, target });
}
export function restartRuntime() {
  clearTimeout(watchdog);
  worker?.terminate();
  worker = undefined;
  frames.clear();
  useRuntime.setState({ status: 'loading', message: 'Restarting OpenCV…', nodes: {}, errors: {} });
  startRuntime();
}
window.addEventListener('roveran-assets', () => {
  assetGeneration++;
  sourceSignature = '';
  if (latest) void evaluate(latest, true);
});
