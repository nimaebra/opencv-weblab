/// <reference lib="webworker" />
import { OPENCV_VERSION, parseDocument } from '@roveran/pipeline';
import { Evaluator } from './evaluator';
import { waitForOpenCv } from './loader';
import type { WorkerRequest, WorkerResponse } from './index';
const scope = self as unknown as DedicatedWorkerGlobalScope;
let evaluator: Evaluator | undefined;
let loading: Promise<void> | undefined;
let revision = 0;
let pending: Extract<WorkerRequest, { type: 'evaluate' }> | undefined;
let running = false;
function send(message: WorkerResponse, transfers: Transferable[] = []) {
  scope.postMessage(message, transfers);
}
async function init() {
  if (loading) return loading;
  loading = (async () => {
    scope.importScripts('/runtime/opencv.js');
    const { cv } = await waitForOpenCv((scope as any).cv);
    if (!cv?.Mat) throw new Error('OpenCV could not initialize.');
    evaluator = new Evaluator(cv);
    send({ type: 'ready', version: OPENCV_VERSION });
  })();
  return loading;
}
async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending) {
      const request = pending;
      pending = undefined;
      const output = await evaluator!.evaluate(
        parseDocument(request.document),
        () => revision !== request.revision,
      );
      if (output && revision === request.revision)
        send(
          {
            type: 'result',
            revision: request.revision,
            nodes: output.nodes,
            errors: output.errors,
            stats: output.stats,
            frames: output.frames,
          },
          output.frames.map((f) => f.bitmap),
        );
      else if (output) for (const f of output.frames) f.bitmap.close();
    }
  } catch (error) {
    send({
      type: 'error',
      revision,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
    if (pending) void drain();
  }
}
scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'dispose') {
      revision++;
      pending = undefined;
      evaluator?.dispose();
      scope.close();
      return;
    }
    await init();
    switch (message.type) {
      case 'init':
        break;
      case 'sources':
        revision++;
        evaluator!.setSources(message.sources);
        break;
      case 'evaluate':
        revision = message.revision;
        pending = message;
        void drain();
        break;
      case 'export': {
        revision = message.revision;
        pending = undefined;
        while (running) await new Promise((resolve) => setTimeout(resolve, 5));
        const output = await evaluator!.evaluate(
          parseDocument(message.document),
          () => revision !== message.revision,
          true,
          message.target,
        );
        if (output?.blob) send({ type: 'exported', revision: message.revision, blob: output.blob });
        else
          send({
            type: 'error',
            revision: message.revision,
            message: output ? Object.values(output.errors).join(' ') : 'Export superseded.',
          });
        break;
      }
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
