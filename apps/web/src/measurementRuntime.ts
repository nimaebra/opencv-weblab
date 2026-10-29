import { create } from 'zustand';
import {
  FrameStore,
  type Measurements,
  type WorkerRequest,
  type WorkerResponse,
} from '@opencv-weblab/engine';
import type { PipelineDocument } from '@opencv-weblab/pipeline';
import { getLearningContext, useRuntime } from './runtime';
export const measurementFrames = new FrameStore();
export const useMeasurements = create<{
  nodeId: string | null;
  status: 'idle' | 'running' | 'ready' | 'error';
  result: Measurements | null;
  error: string;
}>(() => ({ nodeId: null, status: 'idle', result: null, error: '' }));
let sequence = 0;
let timeout: ReturnType<typeof setTimeout> | undefined;
export function closeMeasurements() {
  sequence++;
  clearTimeout(timeout);
  getLearningContext().worker?.postMessage({ type: 'cancel-measure' } satisfies WorkerRequest);
  measurementFrames.clear();
  useMeasurements.setState({ nodeId: null, status: 'idle', result: null, error: '' });
}
export function requestMeasurements(document: PipelineDocument, nodeId: string) {
  closeMeasurements();
  const ctx = getLearningContext(),
    runtime = useRuntime.getState();
  useMeasurements.setState({ nodeId });
  if (!ctx.ready || runtime.status !== 'ready' || ctx.revision !== runtime.frameRevision) {
    useMeasurements.setState({
      status: 'error',
      error: 'Wait for the current preview to finish, then try again.',
    });
    return;
  }
  useMeasurements.setState({ status: 'running' });
  ctx.worker?.postMessage({
    type: 'measure',
    document,
    nodeId,
    revision: ctx.revision,
    requestId: sequence,
  } satisfies WorkerRequest);
  timeout = setTimeout(() => {
    const target = useMeasurements.getState().nodeId;
    closeMeasurements();
    useMeasurements.setState({
      nodeId: target,
      status: 'error',
      error: 'Measurement timed out. Use a smaller image or restart the engine.',
    });
  }, 60000);
}
export function handleMeasurementMessage(message: WorkerResponse) {
  if (message.type !== 'measured' && message.type !== 'measure-error') return false;
  if (
    message.requestId !== sequence ||
    message.revision !== getLearningContext().revision ||
    message.nodeId !== useMeasurements.getState().nodeId
  ) {
    if (message.type === 'measured') message.bitmap.close();
    return true;
  }
  clearTimeout(timeout);
  if (message.type === 'measured') {
    measurementFrames.replace([{ nodeId: message.nodeId, bitmap: message.bitmap }]);
    useMeasurements.setState({ status: 'ready', result: message.measurements });
  } else useMeasurements.setState({ status: 'error', error: message.message });
  return true;
}
