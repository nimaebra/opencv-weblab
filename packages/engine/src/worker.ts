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
let analysis:
  | { revision: number; requestId: number; nodeId: string; pixels: ImageData; gray: boolean }
  | undefined;
function send(message: WorkerResponse, transfers: Transferable[] = []) {
  scope.postMessage(message, transfers);
}
async function init() {
  if (loading) return loading;
  loading = (async () => {
    scope.importScripts(new URL('runtime/opencv.js', scope.location.href).href);
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
    if (message.type === 'clear-analysis') {
      analysis = undefined;
      return;
    }
    if (message.type === 'analyze') {
      try {
        if (message.bitmap.width * message.bitmap.height > 4096 * 4096)
          throw new Error('Analysis image is too large.');
        const canvas = new OffscreenCanvas(message.bitmap.width, message.bitmap.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(message.bitmap, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        analysis = {
          revision: message.revision,
          requestId: message.requestId,
          nodeId: message.nodeId,
          pixels,
          gray: message.mode === 'gray',
        };
        const histograms = Array.from({ length: analysis.gray ? 1 : 4 }, () =>
          Array<number>(256).fill(0),
        );
        for (let i = 0; i < pixels.data.length; i += 4)
          for (let channel = 0; channel < histograms.length; channel++)
            histograms[channel]![pixels.data[i + channel]!]!++;
        send({
          type: 'analysis',
          revision: message.revision,
          requestId: message.requestId,
          nodeId: message.nodeId,
          histograms,
        });
      } finally {
        message.bitmap.close();
      }
      return;
    }
    if (message.type === 'sample') {
      if (
        !analysis ||
        analysis.requestId !== message.analysisId ||
        analysis.revision !== message.revision ||
        analysis.nodeId !== message.nodeId
      )
        return;
      const { pixels } = analysis,
        x = Math.floor(message.x),
        y = Math.floor(message.y);
      if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return;
      const offset = (y * pixels.width + x) * 4;
      send({
        type: 'pixel',
        revision: message.revision,
        requestId: message.requestId,
        nodeId: message.nodeId,
        x,
        y,
        values: Array.from(pixels.data.slice(offset, offset + (analysis.gray ? 1 : 4))),
      });
      return;
    }
    if (message.type === 'dispose') {
      analysis = undefined;
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
