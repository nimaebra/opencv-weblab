import { create } from 'zustand';
import {
  FrameStore,
  explanationRegion,
  previewScale,
  type PixelExplanation,
  type WorkerRequest,
  type WorkerResponse,
} from '@opencv-weblab/engine';
import type { PipelineDocument } from '@opencv-weblab/pipeline';
import { frames, getLearningContext, useRuntime } from './runtime';
type Comparison = Omit<Extract<WorkerResponse, { type: 'comparison' }>, 'type' | 'frames'>;
export const comparisonFrames = new FrameStore();
export const useStudy = create<{
  comparisonTarget: string | null;
  comparisonReveal: number;
  explanation: PixelExplanation | null;
  explanationError: string;
  comparison: Comparison | null;
  comparisonStatus: 'idle' | 'running' | 'ready' | 'error';
  comparisonError: string;
}>(() => ({
  comparisonTarget: null,
  comparisonReveal: 0,
  explanation: null,
  explanationError: '',
  comparison: null,
  comparisonStatus: 'idle',
  comparisonError: '',
}));
let explanationSequence = 0,
  comparisonSequence = 0;
let timeout: ReturnType<typeof setTimeout> | undefined;
export function clearExplanation() {
  explanationSequence++;
  useStudy.setState({ explanation: null, explanationError: '' });
}
export function cancelComparison() {
  comparisonSequence++;
  clearTimeout(timeout);
  getLearningContext().worker?.postMessage({ type: 'cancel-study' } satisfies WorkerRequest);
  comparisonFrames.clear();
  useStudy.setState({ comparison: null, comparisonStatus: 'idle', comparisonError: '' });
}
export function cancelLearning() {
  clearExplanation();
  cancelComparison();
}
export function closeComparison() {
  cancelComparison();
  useStudy.setState({ comparisonTarget: null });
}
export function handleLearningMessage(message: WorkerResponse): boolean {
  if (!['explanation', 'comparison', 'study-error'].includes(message.type)) return false;
  const ctx = getLearningContext();
  if (message.type === 'explanation') {
    if (
      message.requestId === explanationSequence &&
      message.revision === ctx.revision &&
      message.revision === useRuntime.getState().frameRevision
    )
      useStudy.setState({ explanation: message.explanation, explanationError: '' });
  } else if (message.type === 'comparison') {
    if (message.requestId !== comparisonSequence || message.revision !== ctx.revision) {
      for (const f of message.frames) f.bitmap.close();
    } else {
      clearTimeout(timeout);
      comparisonFrames.replace(message.frames);
      const { frames: _frames, type: _type, ...comparison } = message;
      useStudy.setState({ comparison, comparisonStatus: 'ready', comparisonError: '' });
    }
  } else if (message.type === 'study-error' && message.revision === ctx.revision) {
    if (message.kind === 'explain' && message.requestId === explanationSequence)
      useStudy.setState({ explanation: null, explanationError: message.message });
    else if (message.kind === 'compare' && message.requestId === comparisonSequence) {
      clearTimeout(timeout);
      useStudy.setState({ comparisonStatus: 'error', comparisonError: message.message });
    }
  }
  return true;
}
export async function requestExplanation(
  doc: PipelineDocument,
  nodeId: string,
  x: number,
  y: number,
) {
  const requestId = ++explanationSequence,
    ctx = getLearningContext();
  const node = doc.nodes.find((n) => n.id === nodeId);
  const edge = doc.edges.find((e) => e.target === nodeId && e.input === 0);
  const input = frames.get(edge?.source ?? null);
  const runtime = useRuntime.getState();
  if (
    !node ||
    !input ||
    !ctx.activeAnalysis ||
    ctx.revision !== runtime.frameRevision ||
    runtime.status !== 'ready'
  )
    return;
  try {
    if (runtime.nodes[edge!.source]?.mode !== 'gray' || runtime.nodes[nodeId]?.mode !== 'gray')
      throw new Error(
        'Use a grayscale input to inspect this calculation. Add Grayscale before the filter.',
      );
    const scale = previewScale(doc),
      region = explanationRegion(node, scale, x, y, input.width, input.height);
    const bitmap = await createImageBitmap(
      input,
      region.left,
      region.top,
      region.width,
      region.height,
    );
    if (requestId !== explanationSequence || getLearningContext().revision !== ctx.revision) {
      bitmap.close();
      return;
    }
    ctx.worker?.postMessage(
      {
        type: 'explain',
        revision: ctx.revision,
        requestId,
        analysisId: ctx.activeAnalysis.requestId,
        node,
        scale,
        x,
        y,
        width: input.width,
        height: input.height,
        left: region.left,
        top: region.top,
        bitmap,
      } satisfies WorkerRequest,
      [bitmap],
    );
  } catch (error) {
    if (requestId === explanationSequence)
      useStudy.setState({
        explanation: null,
        explanationError: error instanceof Error ? error.message : String(error),
      });
  }
}
export async function requestComparison(
  doc: PipelineDocument,
  nodeId: string,
  parameter: string,
  values: number[],
) {
  cancelComparison();
  const requestId = comparisonSequence,
    ctx = getLearningContext();
  const node = doc.nodes.find((n) => n.id === nodeId),
    edge = doc.edges.find((e) => e.target === nodeId && e.input === 0);
  const input = frames.get(edge?.source ?? null),
    runtime = useRuntime.getState();
  if (
    !node ||
    !input ||
    !ctx.ready ||
    runtime.status !== 'ready' ||
    ctx.revision !== runtime.frameRevision
  ) {
    useStudy.setState({
      comparisonStatus: 'error',
      comparisonError: 'Wait for a valid input preview, then try again.',
    });
    return;
  }
  useStudy.setState({ comparisonStatus: 'running', comparisonError: '' });
  try {
    const bitmap = await createImageBitmap(input);
    if (requestId !== comparisonSequence || getLearningContext().revision !== ctx.revision) {
      bitmap.close();
      return;
    }
    ctx.worker?.postMessage(
      {
        type: 'compare',
        revision: ctx.revision,
        requestId,
        node,
        parameter,
        values,
        scale: previewScale(doc),
        mode: runtime.nodes[edge!.source]!.mode,
        bitmap,
      } satisfies WorkerRequest,
      [bitmap],
    );
    timeout = setTimeout(() => {
      cancelComparison();
      useStudy.setState({
        comparisonStatus: 'error',
        comparisonError: 'Comparison timed out. Try a smaller input or restart the engine.',
      });
    }, 30000);
  } catch (error) {
    if (requestId === comparisonSequence)
      useStudy.setState({
        comparisonStatus: 'error',
        comparisonError: error instanceof Error ? error.message : String(error),
      });
  }
}
